import { and, eq, inArray } from 'drizzle-orm';
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
 * `hasta` es la última fecha que cuenta como vigente: normalmente el fin del
 * mes en curso, para que la mensualidad de septiembre exista durante todo
 * septiembre y no solo a partir del día que vence.
 */
export function cuotasVigentes(plan: LineaPlan[], conceptos: number[], hasta: string) {
  return plan
    .filter((l) => conceptos.includes(l.conceptoId))
    .flatMap((l) => l.cuotas
      .filter((c) => !c.vencida && c.fechaVencimiento <= hasta)
      .map((c) => ({ linea: l, cuota: c })));
}

/**
 * Devenga las cuotas vencidas de todas las matrículas activas de un período.
 *
 * Pensado para correr una vez al mes. Solo mira matrículas `activa`: la del
 * alumno que se retiró deja de generar deuda automáticamente, sin que nadie
 * tenga que acordarse de apagarle nada.
 */
export async function devengarPeriodo(
  teamId: number,
  periodoId: number,
  hasta: string,
): Promise<ResultadoDevengo> {
  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      cursoId: adminEscolarMatriculas.cursoId,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      becaTipo: adminEscolarMatriculas.becaTipo,
      becaValor: adminEscolarMatriculas.becaValor,
    })
    .from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.periodoId, periodoId),
      eq(adminEscolarMatriculas.estado, 'activa'),
    ));

  if (matriculas.length === 0) return { matriculas: 0, cargosCreados: 0 };

  // Qué cuotas ya tiene cada matrícula, de una vez. Sin esto habría que
  // preguntarlo por matrícula y son cientos por colegio. El índice único
  // igual protegería, pero preguntando antes no se intenta el insert.
  const yaHechos = await db
    .select({ matriculaId: adminEscolarCargos.matriculaId, cuotaId: adminEscolarCargos.cuotaId })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.matriculaId, matriculas.map((m) => m.id)),
    ));
  const existentes = new Set(yaHechos.map((c) => `${c.matriculaId}:${c.cuotaId}`));

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

    // Aquí se devenga todo lo que aplique por defecto. Los conceptos que la
    // secretaria desmarcó al matricular no llevan cuotas creadas, y este
    // proceso no puede saber que se desmarcaron a propósito — por eso solo
    // devenga los conceptos que ya tienen algún cargo de esta matrícula, más
    // los marcados por defecto en la configuración.
    const yaUsados = new Set(
      yaHechos.filter((c) => c.matriculaId === m.id).map((c) => c.cuotaId),
    );
    const conceptosVivos = plan
      .filter((l) => l.porDefecto || l.cuotas.some((c) => yaUsados.has(c.cuotaId)))
      .map((l) => l.conceptoId);

    for (const { linea, cuota } of cuotasVigentes(plan, conceptosVivos, hasta)) {
      if (existentes.has(`${m.id}:${cuota.cuotaId}`)) continue;
      filas.push({
        teamId,
        estudianteId: m.estudianteId,
        matriculaId: m.id,
        periodoId,
        conceptoId: linea.conceptoId,
        cuotaId: cuota.cuotaId || null,
        mes: cuota.mes,
        anio: Number(cuota.fechaVencimiento.slice(0, 4)),
        montoCentavos: cuota.montoCentavos,
        saldoCentavos: cuota.montoCentavos,
        fechaVencimiento: cuota.fechaVencimiento,
        estado: 'pendiente',
      });
    }
  }

  if (filas.length === 0) return { matriculas: matriculas.length, cargosCreados: 0 };

  const creados = await db.insert(adminEscolarCargos)
    .values(filas)
    .onConflictDoNothing()
    .returning({ id: adminEscolarCargos.id });

  return { matriculas: matriculas.length, cargosCreados: creados.length };
}
