import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarMatriculas } from '@/lib/db/schema';
import { contextoDeSeccion } from './tarifas';
import { armarPlanDeCobro, type LineaPlan } from './plan-cobro';

/**
 * Convierte en deuda las cuotas que ya llegaron.
 *
 * Los cargos NO nacen todos el día de la matrícula. Un colegio que cobra diez
 * mensualidades no le debe al padre de agosto la de junio del año siguiente:
 * mientras ese mes no llegue, no hay nada que cobrar, y tenerlo escrito como
 * deuda infla el saldo pendiente y descuadra cualquier lectura de cartera.
 *
 * Así que el calendario es el plan y esto lo va aterrizando: cada mes crea las
 * cuotas que entraron en vigor y deja las demás donde estaban.
 *
 * Se puede correr cuantas veces haga falta. El índice único
 * `(matricula_id, cuota_id)` es el que garantiza que la segunda pasada no le
 * vuelva a cobrar a nadie — no hace falta llevar la cuenta de hasta dónde se
 * devengó.
 */

/** El último día del mes de `fecha` (ISO), que es hasta dónde se devenga. */
export function finDeMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  // Día 0 del mes siguiente = último del actual, y Date resuelve solo los
  // meses de 28/30/31 y los bisiestos.
  const ultimo = new Date(Date.UTC(anio, mes, 0));
  return ultimo.toISOString().slice(0, 10);
}

export interface ResultadoDevengo {
  matriculas: number;
  cargosCreados: number;
}

/**
 * Cuotas de UNA matrícula que ya entraron en vigor y todavía no son cargo.
 *
 * Lo que las hace entrar es la EMISIÓN, no el vencimiento: la deuda nace el día
 * en que sale la factura, y el plazo para pagarla es otra cosa. Con un concepto
 * que da 15 días para pagar, mirar el vencimiento retrasaría medio mes la
 * aparición del cargo y la cartera enseñaría de menos justo mientras el padre
 * ya tiene la factura en la mano.
 *
 * `hasta` es la última fecha de emisión que cuenta: normalmente el fin del mes
 * en curso, para que la mensualidad de septiembre exista durante todo
 * septiembre y no solo a partir del día 28 en que se emite.
 */
export function cuotasVigentes(plan: LineaPlan[], conceptos: number[], hasta: string) {
  return plan
    .filter((l) => conceptos.includes(l.conceptoId))
    .flatMap((l) => l.cuotas
      .filter((c) => !c.omitida && c.fechaEmision <= hasta)
      .map((c) => ({ linea: l, cuota: c })));
}

/**
 * Devenga las cuotas vencidas de todas las matrículas activas de un período.
 *
 * Pensado para correr una vez al mes. Solo mira matrículas `activa`: la del
 * alumno que se retiró deja de generar deuda automáticamente, sin que nadie
 * tenga que acordarse de apagarle nada.
 */
/**
 * La llave con la que se sabe que un cargo YA se creó.
 *
 * Con calendario manda la cuota, y el índice único de la base respalda lo
 * mismo. Sin calendario —«pago único»: inscripción, uniforme, evaluaciones— no
 * hay cuota, y ahí estaba el agujero: el plan traía `cuotaId: 0`, la base
 * guardaba `NULL`, y `0` nunca es igual a `null`. Cada clic en «Cargos del
 * mes» volvía a crear los mismos cargos. El índice único tampoco lo frenaba:
 * en Postgres dos NULL no chocan entre sí.
 *
 * Sin cuota, la identidad de ese cobro es (matrícula, concepto): a un alumno
 * se le cobra la inscripción una vez por año escolar. Si ya existe —lo haya
 * creado el devengo o alguien a mano— no se vuelve a crear.
 */
function claveHecho(c: { matriculaId: number; cuotaId: number | null; conceptoId: number }): string {
  return c.cuotaId ? `q:${c.matriculaId}:${c.cuotaId}` : `c:${c.matriculaId}:${c.conceptoId}`;
}

export async function devengarPeriodo(
  teamId: number,
  periodoId: number,
  hasta: string,
  /**
   * Incluir también las matrículas ya finalizadas.
   *
   * Apagado por defecto: el cron mensual no debe seguir generando deuda a quien
   * ya terminó. Se enciende para cerrar un año escolar o subir el histórico.
   */
  incluirFinalizadas = false,
): Promise<ResultadoDevengo> {
  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      cursoId: adminEscolarMatriculas.cursoId,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      becaTipo: adminEscolarMatriculas.becaTipo,
      becaValor: adminEscolarMatriculas.becaValor,
      conceptosIds: adminEscolarMatriculas.conceptosIds,
    })
    .from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.periodoId, periodoId),
      // 'activa' siempre; 'finalizada' solo si se pide.
      //
      // El cron mensual corre sin la bandera, así que una matrícula terminada
      // no sigue generando deuda sola. Pero un colegio que CIERRA el año —o que
      // sube su historia— necesita generar los cargos de un período que ya
      // acabó, y con el filtro fijo no había forma: había que reabrir las
      // matrículas una por una, devengar, y volver a cerrarlas.
      incluirFinalizadas
        ? inArray(adminEscolarMatriculas.estado, ['activa', 'finalizada'])
        : eq(adminEscolarMatriculas.estado, 'activa'),
    ));

  if (matriculas.length === 0) return { matriculas: 0, cargosCreados: 0 };

  /**
   * Un solo devengo a la vez por (colegio, período).
   *
   * La comprobación de «ya existe» y el insert son dos pasos, y dos clics
   * seguidos en «Cargos del mes» son dos peticiones a la vez: las dos leen que
   * no hay nada antes de que ninguna escriba, y las dos crean. El candado es de
   * transacción, así que se suelta solo cuando la corrida termina o falla.
   */
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${teamId}, ${periodoId})`);

  // Qué cuotas ya tiene cada matrícula, de una vez. Sin esto habría que
  // preguntarlo por matrícula y son cientos por colegio.
  const yaHechos = await tx
    .select({
      matriculaId: adminEscolarCargos.matriculaId,
      cuotaId: adminEscolarCargos.cuotaId,
      conceptoId: adminEscolarCargos.conceptoId,
    })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.matriculaId, matriculas.map((m) => m.id)),
    ));
  const existentes = new Set(yaHechos.map(claveHecho));

  const filas: (typeof adminEscolarCargos.$inferInsert)[] = [];

  for (const m of matriculas) {
    const ctx = await contextoDeSeccion(teamId, periodoId, m.cursoId, {
      tipo: m.becaTipo, valor: m.becaValor,
    });
    if (!ctx) continue;

    // El plan se arma desde la inscripción del alumno, no desde hoy: así lo
    // que ya estaba vencido cuando entró sigue sin cobrársele.
    const desde = m.fechaInscripcion ?? hasta;
    const plan = await armarPlanDeCobro(teamId, ctx, String(desde));

    // Se devenga lo que se marcó al matricular, y nada más. Antes esto miraba
    // `aplicaPorDefecto` del catálogo, y como desmarcar no dejaba rastro, al
    // mes siguiente volvía a añadir lo que la secretaria había quitado.
    //
    // El respaldo por cargos existentes se queda para las matrículas viejas
    // que se hicieran antes de la migración 0114 y quedaran con la lista
    // vacía: sin él dejarían de generar deuda de golpe.
    const elegidos = new Set(m.conceptosIds ?? []);
    const yaUsados = new Set(
      yaHechos.filter((c) => c.matriculaId === m.id).map((c) => c.cuotaId),
    );
    const conceptosVivos = plan
      .filter((l) => elegidos.has(l.conceptoId)
        || (elegidos.size === 0 && l.cuotas.some((c) => yaUsados.has(c.cuotaId))))
      .map((l) => l.conceptoId);

    for (const { linea, cuota } of cuotasVigentes(plan, conceptosVivos, hasta)) {
      const clave = claveHecho({ matriculaId: m.id, cuotaId: cuota.cuotaId || null, conceptoId: linea.conceptoId });
      if (existentes.has(clave)) continue;
      // Se apunta ya: dentro de la misma corrida, dos conceptos sin calendario
      // de la misma matrícula generarían la misma clave.
      existentes.add(clave);
      filas.push({
        teamId,
        estudianteId: m.estudianteId,
        matriculaId: m.id,
        periodoId,
        conceptoId: linea.conceptoId,
        cuotaId: cuota.cuotaId || null,
        mes: cuota.mes,
        // El año es el de la emisión, que con `mes` dice a qué mensualidad
        // corresponde. El del vencimiento cambiaría de año en la cuota de
        // diciembre de un concepto que da 15 días para pagar.
        anio: Number(cuota.fechaEmision.slice(0, 4)),
        montoCentavos: cuota.montoCentavos,
        saldoCentavos: cuota.montoCentavos,
        fechaVencimiento: cuota.fechaVencimiento,
        estado: 'pendiente',
      });
    }
  }

  if (filas.length === 0) return { matriculas: matriculas.length, cargosCreados: 0 };

  const creados = await tx.insert(adminEscolarCargos)
      .values(filas)
      .onConflictDoNothing()
      .returning({ id: adminEscolarCargos.id });

    return { matriculas: matriculas.length, cargosCreados: creados.length };
  });
}
