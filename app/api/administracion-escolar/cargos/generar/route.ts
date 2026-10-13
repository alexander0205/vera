import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptoCuotas,
  adminEscolarConceptosPago,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { mesPerteneceAlPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';
import { vencimientoDe } from '@/lib/administracion-escolar/calendario';
import { repartir } from '@/lib/administracion-escolar/plan-cobro';
import { resolverTarifa } from '@/lib/administracion-escolar/tarifas';
import { eq, and, asc, inArray, isNull, ne, or } from 'drizzle-orm';

/**
 * Generación masiva de cargos: el mismo concepto a un grupo de alumnos.
 *
 * Es por donde pasa el cobro eventual —el día de cine, la excursión, la
 * evaluación del período—: lo que se le cobra a muchos de una vez y no sale de
 * ninguna tarifa mensual.
 *
 * Dos cosas que antes no tenía, y que son las que hacían que nadie se atreviera
 * a usarlo con el colegio entero delante:
 *
 *  - **`dryRun`**: la revisión. Devuelve alumno por alumno a quién se le va a
 *    crear y a quién se le omite, sin escribir una línea. Antes se pulsaba
 *    «Generar» a ciegas sobre cuatrocientas matrículas y el resultado se leía
 *    después, cuando la deuda ya estaba puesta.
 *  - **`estudianteIds`**: el subconjunto. El filtro llegaba hasta la sección, y
 *    un cobro eventual casi nunca es «toda la sección»: es la lista de los que
 *    van al viaje. Sin esto había que crear el cargo uno a uno.
 *
 * El duplicado se omite igual que siempre (mismo estudiante + concepto +
 * período + mes), pero ya NO cuenta el cargo anulado: anular es la forma de
 * decir «esto no se cobra», y un anulado bloqueando la regeneración dejaba al
 * alumno fuera del cobro para siempre, en silencio.
 */

interface DetalleGeneracion {
  estudianteId: number;
  matriculaId: number;
  nombre: string;
  codigo: string | null;
  /**
   * dryRun: crear | duplicado | sin-tarifa. Real: creado | duplicado | sin-tarifa.
   *
   * `sin-tarifa` solo aparece cobrando la tarifa de cada alumno: ese alumno no
   * tiene precio para este concepto y no se le crea nada. Antes no podía
   * pasar, porque el monto venía escrito y era el mismo para todos.
   */
  resultado: 'crear' | 'creado' | 'duplicado' | 'sin-tarifa';
  /** Lo que paga ESTE alumno. `null` cuando no se le va a crear nada. */
  montoCentavos: number | null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  // Revisar solo lee; crear de verdad pone deuda cobrable y va con el gate de
  // escritura, igual que el alta en lote de matrículas.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: !dryRun },
  );
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const {
    periodoId, cursoId, cursoIds, estudianteIds,
    conceptoId, mes, anio, montoCentavos, fechaVencimiento,
    cuotaId, tarifaPorAlumno,
  } = body ?? {};

  /**
   * `tarifaPorAlumno` cobra lo que le toca a CADA uno —su beca, su tarifa
   * personal— en vez del mismo monto a todos. Entonces `montoCentavos` no
   * viaja: lo resuelve el servidor, que es el único que puede.
   */
  const porAlumno = tarifaPorAlumno === true;
  /** `cuotaId` ata el cargo a una cuota del calendario, como hace el devengo. */
  const conCuota = Number.isInteger(cuotaId) && cuotaId > 0;

  if (!periodoId || !conceptoId || (!conCuota && !Number.isInteger(anio))) {
    return NextResponse.json({ error: 'periodoId, conceptoId y anio son requeridos' }, { status: 400 });
  }
  if (!porAlumno && (!Number.isInteger(montoCentavos) || montoCentavos <= 0)) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }
  if (!conCuota && mes != null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: 'mes debe estar entre 1 y 12' }, { status: 400 });
  }

  // El concepto viene del cliente. Los cursos no hace falta validarlos: solo
  // filtran matrículas que ya están acotadas al team.
  const refs = await validarPertenencia(teamId, { concepto: conceptoId, periodo: periodoId });
  if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: 404 });
  // A partir de aquí se usan los ids normalizados, no los crudos del JSON.
  const periodoIdOk = refs.ids.periodo!;
  const conceptoIdOk = refs.ids.concepto!;

  const [periodo] = await db
    .select({ fechaInicio: adminEscolarPeriodos.fechaInicio, fechaFin: adminEscolarPeriodos.fechaFin })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoIdOk), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!periodo) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  if (!conCuota && mes != null && !mesPerteneceAlPeriodo(periodo.fechaInicio, periodo.fechaFin, mes, anio)) {
    return NextResponse.json({ error: 'El mes seleccionado no pertenece al calendario de este período' }, { status: 400 });
  }

  /**
   * La cuota manda sobre el mes, el año y el vencimiento.
   *
   * Cuando el cargo es de una cuota, esos tres datos salen de ELLA y no de lo
   * que mande el cliente: es lo que hace el devengo, y así los dos caminos
   * escriben lo mismo. El mes se deriva de la fecha de emisión y no de la
   * columna `mes` de la cuota, que puede haberse quedado vieja si alguien
   * editó las fechas a mano.
   */
  const [conceptoDelCargo] = await db
    .select({
      tipo: adminEscolarConceptosPago.tipo,
      diasParaPago: adminEscolarConceptosPago.diasParaPago,
    })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoIdOk), eq(adminEscolarConceptosPago.teamId, teamId)))
    .limit(1);
  if (!conceptoDelCargo) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  let cuota: { id: number; numero: number; fechaEmision: string; porcentajeMilesimas: number } | null = null;
  let pesosDeLasCuotas: number[] = [];
  if (conCuota) {
    const cuotasDelConcepto = await db
      .select({
        id: adminEscolarConceptoCuotas.id,
        numero: adminEscolarConceptoCuotas.numero,
        fechaEmision: adminEscolarConceptoCuotas.fechaEmision,
        porcentajeMilesimas: adminEscolarConceptoCuotas.porcentajeMilesimas,
      })
      .from(adminEscolarConceptoCuotas)
      .where(and(
        eq(adminEscolarConceptoCuotas.teamId, teamId),
        eq(adminEscolarConceptoCuotas.conceptoId, conceptoIdOk),
        eq(adminEscolarConceptoCuotas.periodoId, periodoIdOk),
      ))
      .orderBy(asc(adminEscolarConceptoCuotas.numero));
    const suya = cuotasDelConcepto.find((c) => c.id === Number(cuotaId));
    if (!suya) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 });
    cuota = { ...suya, fechaEmision: String(suya.fechaEmision) };
    pesosDeLasCuotas = cuotasDelConcepto.map((c) => c.porcentajeMilesimas);
  }

  const mesDelCargo = cuota ? Number(cuota.fechaEmision.slice(5, 7)) : (mes ?? null);
  const anioDelCargo = cuota ? Number(cuota.fechaEmision.slice(0, 4)) : anio;
  const venceEl = cuota
    ? vencimientoDe(cuota.fechaEmision, conceptoDelCargo.diasParaPago)
    : (fechaVencimiento || null);

  const where = [
    eq(adminEscolarMatriculas.teamId, teamId),
    eq(adminEscolarMatriculas.periodoId, periodoIdOk),
    eq(adminEscolarMatriculas.estado, 'activa'),
  ];
  // `cursoId` suelto se mantiene por compatibilidad con quien ya llamaba así.
  const cursos: number[] = Array.isArray(cursoIds)
    ? [...new Set(cursoIds.map(Number).filter(Boolean))]
    : cursoId ? [Number(cursoId)] : [];
  // Una lista de secciones VACÍA no es «sin filtro»: quien manda `cursoIds: []`
  // acotó a un grupo que no tiene secciones, y leerlo como «todo el colegio»
  // le crearía la deuda a quien nadie eligió. Sin lista (o con `cursoId` suelto
  // ausente) sí es todo el colegio.
  if (Array.isArray(cursoIds) && cursos.length === 0) {
    return NextResponse.json({ dryRun, creados: 0, omitidos: 0, total: 0, detalles: [] });
  }
  if (cursos.length === 1) where.push(eq(adminEscolarMatriculas.cursoId, cursos[0]));
  else if (cursos.length > 1) where.push(inArray(adminEscolarMatriculas.cursoId, cursos));

  // La lista explícita manda sobre el filtro: es la que se marcó en la revisión.
  const elegidos: number[] = Array.isArray(estudianteIds)
    ? [...new Set(estudianteIds.map(Number).filter(Boolean))]
    : [];
  if (elegidos.length > 0) where.push(inArray(adminEscolarMatriculas.estudianteId, elegidos));

  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      cursoId: adminEscolarMatriculas.cursoId,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      codigo: adminEscolarEstudiantes.codigo,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .where(and(...where));

  if (matriculas.length === 0) {
    return NextResponse.json({ dryRun, creados: 0, omitidos: 0, total: 0, detalles: [] });
  }

  const existentesWhere = [
    eq(adminEscolarCargos.teamId, teamId),
    eq(adminEscolarCargos.periodoId, periodoIdOk),
    eq(adminEscolarCargos.conceptoId, conceptoIdOk),
    // Un cargo anulado no es deuda de nadie: no cuenta como duplicado.
    ne(adminEscolarCargos.estado, 'anulado'),
    inArray(adminEscolarCargos.estudianteId, matriculas.map((m) => m.estudianteId)),
  ];
  /*
   * Con cuota, el duplicado es por CUOTA y no por mes: es la misma llave que
   * usa el devengo (`claveHecho`), y por eso los dos caminos se ven. Sin ella
   * se mira el mes, como siempre.
   */
  if (cuota) {
    /*
     * La cuota, O el mismo mes sin cuota.
     *
     * Lo segundo no es adorno: un cargo puesto a mano —desde «Cargo a varios
     * alumnos», o por quien no sabía que este cobro tenía calendario— lleva
     * mes pero no cuota. Mirando solo la cuota, ese alumno saldría como que no
     * lo tiene y acabaría con la colegiatura de octubre dos veces.
     */
    existentesWhere.push(or(
      eq(adminEscolarCargos.cuotaId, cuota.id),
      and(
        isNull(adminEscolarCargos.cuotaId),
        mesDelCargo == null ? isNull(adminEscolarCargos.mes) : eq(adminEscolarCargos.mes, mesDelCargo),
        eq(adminEscolarCargos.anio, anioDelCargo),
      ),
    )!);
  } else if (mesDelCargo == null) {
    existentesWhere.push(isNull(adminEscolarCargos.mes));
  } else {
    existentesWhere.push(eq(adminEscolarCargos.mes, mesDelCargo));
  }

  const existentes = await db
    .select({ estudianteId: adminEscolarCargos.estudianteId })
    .from(adminEscolarCargos)
    .where(and(...existentesWhere));
  const estudiantesConCargo = new Set(existentes.map((e) => e.estudianteId));
  const pendientes = matriculas.filter((m) => !estudiantesConCargo.has(m.estudianteId));

  /**
   * Lo que paga CADA alumno.
   *
   * Sin `tarifaPorAlumno` es el mismo monto para todos, como siempre. Con él,
   * cada uno paga lo suyo: lo resuelve `resolverTarifa`, que es la que ya sabe
   * de tarifa personal, de sección, de grado, de servicio y de beca — la misma
   * que usa el plan del año, para que los dos caminos no digan precios
   * distintos del mismo cobro.
   *
   * Y si el cargo es de una cuota, se cobra lo que le toca a ESA cuota: la
   * mensualidad entera cada mes, y el resto de cobros repartido entre sus
   * cuotas con el mismo reparto del plan, sin perder centavos.
   */
  const trozoDeLaCuota = (total: number): number => {
    if (!cuota) return total;
    if (conceptoDelCargo.tipo === 'mensualidad') return total;
    const partes = repartir(total, pesosDeLasCuotas);
    const i = Math.max(0, pesosDeLasCuotas.length > 0
      ? [...pesosDeLasCuotas.keys()].find((k) => k === cuota!.numero - 1) ?? 0
      : 0);
    return partes[i] ?? total;
  };

  const montoDe = new Map<number, number>();
  if (porAlumno) {
    // En tandas: un colegio de doscientos alumnos no puede abrir doscientas
    // consultas a la vez.
    const tanda = 20;
    for (let i = 0; i < pendientes.length; i += tanda) {
      const trozo = pendientes.slice(i, i + tanda);
      const tarifas = await Promise.all(
        trozo.map((m) => resolverTarifa(teamId, m.id, conceptoIdOk)),
      );
      trozo.forEach((m, j) => {
        const t = tarifas[j];
        if (t && t.montoCentavos > 0) montoDe.set(m.id, trozoDeLaCuota(t.montoCentavos));
      });
    }
  }

  /** A quién no se le pudo saber el precio: no se le crea nada y se dice. */
  const sinTarifa = porAlumno ? pendientes.filter((m) => !montoDe.has(m.id)) : [];
  const sinTarifaIds = new Set(sinTarifa.map((m) => m.id));
  const aCrear = pendientes.filter((m) => !sinTarifaIds.has(m.id));

  const detalles: DetalleGeneracion[] = matriculas
    .map((m) => ({
      estudianteId: m.estudianteId,
      matriculaId: m.id,
      nombre: `${m.nombres ?? ''} ${m.apellidos ?? ''}`.trim() || `Estudiante #${m.estudianteId}`,
      codigo: m.codigo ?? null,
      resultado: (estudiantesConCargo.has(m.estudianteId)
        ? 'duplicado'
        : sinTarifaIds.has(m.id) ? 'sin-tarifa'
        : dryRun ? 'crear' : 'creado') as DetalleGeneracion['resultado'],
      // Lo que va a pagar este alumno. Va en cada fila porque con beca o con
      // tarifa personal ya no hay «un monto» que valga para la frase.
      montoCentavos: estudiantesConCargo.has(m.estudianteId) || sinTarifaIds.has(m.id)
        ? null
        : (porAlumno ? montoDe.get(m.id) ?? null : trozoDeLaCuota(montoCentavos)),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      creados: aCrear.length,
      omitidos: matriculas.length - aCrear.length,
      total: matriculas.length,
      // Lo que suman los que SÍ reciben cargo. Con tarifa por alumno es el
      // único total verdadero: no hay un monto que multiplicar.
      totalCentavos: detalles.reduce((a, d) => a + (d.montoCentavos ?? 0), 0),
      sinTarifa: sinTarifa.length,
      detalles,
    });
  }

  const values = aCrear.map((m) => {
    const suyo = porAlumno ? montoDe.get(m.id) as number : trozoDeLaCuota(montoCentavos);
    return {
      teamId,
      estudianteId: m.estudianteId,
      matriculaId: m.id,
      periodoId: periodoIdOk,
      conceptoId: conceptoIdOk,
      // Atado a su cuota: es lo que hace que el plan del año NO vuelva a
      // crearlo (busca por cuota, ver `claveHecho` en devengar.ts).
      cuotaId: cuota ? cuota.id : null,
      mes: mesDelCargo,
      anio: anioDelCargo,
      montoCentavos: suyo,
      saldoCentavos: suyo,
      fechaVencimiento: venceEl,
      estado: 'pendiente' as const,
    };
  });

  const creados = values.length === 0
    ? []
    : await db.insert(adminEscolarCargos)
      .values(values)
      .returning({ id: adminEscolarCargos.id });

  return NextResponse.json({
    dryRun: false,
    creados: creados.length,
    omitidos: matriculas.length - creados.length,
    total: matriculas.length,
    totalCentavos: values.reduce((a, v) => a + v.montoCentavos, 0),
    sinTarifa: sinTarifa.length,
    detalles,
  });
}
