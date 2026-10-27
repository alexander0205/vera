/**
 * Facturar por lote: lo que lee y lo que escribe en la base.
 *
 * Las reglas —qué facturas salen, de quién, a quién se deja fuera— están en
 * `facturar-lote.ts`, que no toca la base y se prueba solo. Aquí queda el resto:
 * traer los alumnos y los cargos que alimentan ese plan, y entregar el plan al
 * mismo constructor de facturas del cron (`facturarGrupos`).
 *
 * No hay un segundo constructor de facturas. Numeración, estado BORRADOR,
 * comprador, producto e ITBIS de cada línea, enlace cargo↔documento y el candado
 * contra la doble factura son los de `facturar-emision.ts`, uno por uno.
 */

import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptoCuotas,
  adminEscolarConceptosPago,
  adminEscolarCursos,
  adminEscolarEstudiantes,
  adminEscolarGrados,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarServicios,
  clients,
} from '@/lib/db/schema';
import { fechaRD } from '@/lib/utils/format';
import { facturarGrupos, type GrupoAFacturar } from './facturar-emision';
import { devengarPeriodo } from './devengar';
import type {
  AlumnoCatalogo, AlumnoLote, CargoLote, ConceptoCatalogo, CuotaCalendario, FacturaCreada, FacturaFallida, FacturaPlan, PendienteMes,
} from './facturar-lote';
import { PAGO_UNICO, mesDeCuota } from './facturar-lote';

/** Estados que se pueden cobrar. Mismo criterio que el cron y el prefill. */
const COBRABLES = ['pendiente', 'parcial', 'vencido'];

/** Los años escolares del colegio, el más reciente primero: para el selector de la pantalla. */
export async function periodosDelColegio(teamId: number) {
  return db
    .select({
      id: adminEscolarPeriodos.id,
      nombre: adminEscolarPeriodos.nombre,
      activo: adminEscolarPeriodos.activo,
    })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, teamId))
    .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.id));
}

/**
 * El año escolar sobre el que se factura: el pedido, o el activo.
 * Siempre acotado al colegio: un id de otro colegio no encuentra nada.
 */
export async function periodoDelLote(teamId: number, periodoId: number | null) {
  const [periodo] = await db
    .select({
      id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre,
      fechaInicio: adminEscolarPeriodos.fechaInicio, fechaFin: adminEscolarPeriodos.fechaFin,
    })
    .from(adminEscolarPeriodos)
    .where(periodoId
      ? and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId))
      : and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);
  return periodo ?? null;
}

/**
 * El mes de un cargo como 'YYYY-MM', igual que `mesDelCargo`: el de su cuota si
 * es de un mes (con el año corregido como en `mesDeCuota`); si no, el día en
 * que se emite su cuota. Sin mes ni cuota es un pago único: `PAGO_UNICO`, no
 * el mes en que se creó (ver `esPagoUnico`).
 */
const emisionSql = sql`coalesce(${adminEscolarConceptoCuotas.fechaEmision},
  (${adminEscolarCargos.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santo_Domingo')::date)`;
const mesDelCargoSql = sql<string>`CASE
  WHEN ${adminEscolarCargos.mes} BETWEEN 1 AND 12
    THEN (${adminEscolarCargos.anio} + CASE
            WHEN ${adminEscolarCargos.mes} < extract(month FROM ${emisionSql}) - 6
             AND ${adminEscolarCargos.anio} = extract(year FROM ${emisionSql}) THEN 1 ELSE 0 END
         )::text || '-' || lpad(${adminEscolarCargos.mes}::text, 2, '0')
  WHEN ${adminEscolarConceptoCuotas.fechaEmision} IS NULL THEN ${sql.raw(`'${PAGO_UNICO}'`)}
  ELSE to_char(${emisionSql}, 'YYYY-MM')
END`;

/**
 * Lo que la pantalla necesita para dejar elegir: los alumnos matriculados
 * (con su curso y su responsable) y los conceptos que tienen algo por facturar.
 *
 * Los conceptos sin ningún cargo pendiente no se ofrecen: marcarlos no haría
 * nada, y con quince conceptos en el catálogo la lista que importa se perdería.
 * El número de pendientes de cada alumno es solo una pista para elegir; la
 * vista previa es la que dice qué se va a crear.
 */
export async function catalogoDelLote(teamId: number, periodoId: number) {
  const [filas, pendientes] = await Promise.all([
    db
      .select({
        estudianteId: adminEscolarMatriculas.estudianteId,
        nombres: adminEscolarEstudiantes.nombres,
        apellidos: adminEscolarEstudiantes.apellidos,
        codigo: adminEscolarEstudiantes.codigo,
        servicioId: adminEscolarServicios.id,
        servicio: adminEscolarServicios.nombre,
        tanda: adminEscolarServicios.tanda,
        gradoId: adminEscolarGrados.id,
        grado: adminEscolarGrados.nombre,
        cursoId: adminEscolarCursos.id,
        seccion: adminEscolarCursos.nombre,
        responsableId: adminEscolarEstudiantes.facturarAClientId,
        responsable: clients.razonSocial,
      })
      .from(adminEscolarMatriculas)
      .innerJoin(adminEscolarEstudiantes, and(
        eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
        eq(adminEscolarEstudiantes.teamId, teamId),
      ))
      .leftJoin(adminEscolarCursos, and(
        eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id),
        eq(adminEscolarCursos.teamId, teamId),
      ))
      .leftJoin(adminEscolarGrados, eq(adminEscolarCursos.gradoId, adminEscolarGrados.id))
      .leftJoin(adminEscolarServicios, eq(adminEscolarGrados.servicioId, adminEscolarServicios.id))
      .leftJoin(clients, and(
        eq(adminEscolarEstudiantes.facturarAClientId, clients.id),
        eq(clients.teamId, teamId),
      ))
      .where(and(
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.periodoId, periodoId),
        eq(adminEscolarMatriculas.estado, 'activa'),
      ))
      .orderBy(asc(adminEscolarEstudiantes.apellidos), asc(adminEscolarEstudiantes.nombres)),

    // Cargos cobrables y con saldo, sin factura: lo que hay por facturar de
    // verdad. Agrupado en la base —una fila por alumno y concepto— para no
    // traer una por cargo.
    db
      .select({
        estudianteId: adminEscolarCargos.estudianteId,
        conceptoId: adminEscolarCargos.conceptoId,
        mes: mesDelCargoSql,
        n: sql<number>`count(*)::int`,
        // float8 y no bigint: el controlador devuelve el bigint como texto.
        centavos: sql<number>`coalesce(sum(${adminEscolarCargos.saldoCentavos}), 0)::float8`,
      })
      .from(adminEscolarCargos)
      .leftJoin(adminEscolarConceptoCuotas, and(
        eq(adminEscolarCargos.cuotaId, adminEscolarConceptoCuotas.id),
        eq(adminEscolarConceptoCuotas.teamId, teamId),
      ))
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.periodoId, periodoId),
        inArray(adminEscolarCargos.estado, COBRABLES),
        isNull(adminEscolarCargos.ecfDocumentId),
        gt(adminEscolarCargos.saldoCentavos, 0),
      ))
      .groupBy(adminEscolarCargos.estudianteId, adminEscolarCargos.conceptoId, mesDelCargoSql),
  ]);

  // Una matrícula activa por alumno y año; el `Map` por si el dato dijera otra cosa.
  const alumnos = new Map<number, AlumnoCatalogo>();
  for (const f of filas) {
    if (alumnos.has(f.estudianteId)) continue;
    alumnos.set(f.estudianteId, {
      estudianteId: f.estudianteId,
      nombre: `${f.nombres} ${f.apellidos}`.trim(),
      codigo: f.codigo ?? null,
      servicioId: f.servicioId ?? null,
      // La tanda va con el nombre: «Primaria» matutina y vespertina son dos servicios.
      servicio: f.servicio ? (f.tanda ? `${f.servicio} · ${f.tanda}` : f.servicio) : null,
      gradoId: f.gradoId ?? null,
      grado: f.grado ?? null,
      cursoId: f.cursoId ?? null,
      seccion: f.seccion ?? null,
      responsableId: f.responsableId ?? null,
      responsable: f.responsable ?? null,
      sinFactura: 0,
      sinFacturaCentavos: 0,
    });
  }

  // Solo cuentan los pendientes de alumnos que SE PUEDEN marcar: un retirado
  // con deuda no sale en la lista, y sumarle sus cargos a los conceptos haría
  // decir «40 cargos» donde marcando a todos solo se alcanzan 38.
  const porConcepto = new Map<number, { n: number; centavos: number }>();
  /** Lo pendiente por alumno, concepto y mes: con esto la pantalla dice cuánto hay en cada mes. */
  const porMes: PendienteMes[] = [];
  for (const p of pendientes) {
    const alumno = alumnos.get(p.estudianteId);
    if (!alumno) continue;
    porMes.push({ e: p.estudianteId, c: p.conceptoId, m: p.mes, n: Number(p.n), centavos: Number(p.centavos) });
    alumno.sinFactura += Number(p.n);
    alumno.sinFacturaCentavos += Number(p.centavos);
    const c = porConcepto.get(p.conceptoId) ?? { n: 0, centavos: 0 };
    c.n += Number(p.n); c.centavos += Number(p.centavos);
    porConcepto.set(p.conceptoId, c);
  }

  // El calendario de cada concepto en este año: con qué meses cobra. Con esto
  // la pantalla dice, mes por mes, qué concepto se factura (y cómo cobra cada uno).
  const cuotas = await db
    .select({
      conceptoId: adminEscolarConceptoCuotas.conceptoId,
      mes: adminEscolarConceptoCuotas.mes,
      fechaEmision: adminEscolarConceptoCuotas.fechaEmision,
      etiqueta: adminEscolarConceptoCuotas.etiqueta,
    })
    .from(adminEscolarConceptoCuotas)
    .where(and(
      eq(adminEscolarConceptoCuotas.teamId, teamId),
      eq(adminEscolarConceptoCuotas.periodoId, periodoId),
      eq(adminEscolarConceptoCuotas.activo, true),
    ))
    .orderBy(asc(adminEscolarConceptoCuotas.fechaEmision));
  const calendario: CuotaCalendario[] = cuotas.map((q) => {
    const emision = String(q.fechaEmision).slice(0, 10);
    return { c: q.conceptoId, m: q.mes ? mesDeCuota(q.mes, emision) : emision.slice(0, 7), etiqueta: q.etiqueta };
  });

  // TODOS los conceptos activos, no solo los que ya tienen un cargo sin
  // facturar: lo pidió Alex («déjalo abierto, que puedas seleccionar cualquier
  // concepto»). Un concepto sin cargo todavía se factura adelantando sus
  // cuotas hasta la fecha de corte (ver `adelantarCuotasDelLote`).
  const conceptos: ConceptoCatalogo[] = (await db
    .select({
      id: adminEscolarConceptosPago.id,
      nombre: adminEscolarConceptosPago.nombre,
      tipo: adminEscolarConceptosPago.tipo,
    })
    .from(adminEscolarConceptosPago)
    .where(and(
      eq(adminEscolarConceptosPago.teamId, teamId),
      eq(adminEscolarConceptosPago.activo, true),
    )))
    .map((c) => ({
      ...c,
      sinFactura: porConcepto.get(c.id)?.n ?? 0,
      sinFacturaCentavos: porConcepto.get(c.id)?.centavos ?? 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { alumnos: [...alumnos.values()], conceptos, pendientes: porMes, calendario };
}

/**
 * Adelanta las cuotas de los conceptos elegidos hasta la fecha de corte.
 *
 * «Facturar por lote» deja elegir cualquier concepto, también uno cuya cuota
 * todavía no se ha emitido (la de noviembre en octubre). Para facturarla tiene
 * que existir su cargo, y quien lo crea es el devengo —el mismo del cron, con
 * el mismo precio, calendario y beca—, solo que hasta la fecha que se eligió y
 * no hasta hoy. Como cada cuota tiene su índice único, cuando el cron llegue
 * a esa fecha la encuentra hecha y no la repite; y como ya tendrá factura, la
 * facturación automática tampoco.
 *
 * Solo lo que el alumno tiene en su plan: un concepto que no eligió al
 * matricular no se le inventa aquí (se agrega en «Servicios por alumno»).
 *
 * Con `simular` no escribe nada y devuelve los cargos que crearía, con ids
 * negativos, para la vista previa. Sin él los crea, y el plan se vuelve a
 * calcular con lo que hay en la base.
 */
export async function adelantarCuotasDelLote(
  teamId: number, periodoId: number, estudianteIds: number[], conceptoIds: number[],
  hasta: string, simular: boolean,
): Promise<CargoLote[]> {
  if (estudianteIds.length === 0 || conceptoIds.length === 0) return [];
  const matriculas = await db
    .select({ id: adminEscolarMatriculas.id })
    .from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.periodoId, periodoId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      inArray(adminEscolarMatriculas.estudianteId, estudianteIds),
    ));
  if (matriculas.length === 0) return [];

  const r = await devengarPeriodo(teamId, periodoId, hasta, false, {
    soloMatriculas: matriculas.map((m) => m.id),
    soloConceptos: conceptoIds,
  }, { simular });
  if (!simular) return [];

  return (r.porCrear ?? []).map((x, i) => ({
    id: -(i + 1),
    estudianteId: x.fila.estudianteId,
    conceptoId: x.fila.conceptoId,
    conceptoNombre: x.concepto,
    mes: x.fila.mes ?? null,
    anio: x.fila.anio ?? Number(x.fechaEmision.slice(0, 4)),
    estado: 'pendiente',
    saldoCentavos: x.fila.saldoCentavos ?? x.fila.montoCentavos,
    fechaVencimiento: x.fila.fechaVencimiento ? String(x.fila.fechaVencimiento).slice(0, 10) : null,
    fechaEmision: x.fechaEmision,
    ecfDocumentId: null,
    // Como lo verá `cargarDatosDelLote` una vez creado.
    pagoUnico: x.fila.mes == null && !x.fila.cuotaId,
  }));
}

/**
 * Los alumnos marcados y sus cargos de los conceptos elegidos: la entrada del
 * planificador.
 *
 * Se traen TODOS los cargos no anulados, también los ya facturados o pagados,
 * y no solo los facturables: así el plan puede decirle a la secretaria POR QUÉ
 * un alumno se queda sin factura («ya está facturado», «se emite después del
 * corte») en vez de dejarlo en blanco. El filtrado de verdad lo hace el plan.
 *
 * Todo va acotado al colegio y al año: un id de alumno de otro colegio, o de
 * otro año, simplemente no devuelve nada.
 */
export async function cargarDatosDelLote(
  teamId: number, periodoId: number, estudianteIds: number[], conceptoIds: number[],
): Promise<{ alumnos: AlumnoLote[]; cargos: CargoLote[] }> {
  const [alumnosDb, cargosDb] = await Promise.all([
    db
      .select({
        id: adminEscolarEstudiantes.id,
        nombres: adminEscolarEstudiantes.nombres,
        apellidos: adminEscolarEstudiantes.apellidos,
        clienteId: adminEscolarEstudiantes.facturarAClientId,
        responsable: clients.razonSocial,
      })
      .from(adminEscolarEstudiantes)
      .leftJoin(clients, and(
        eq(adminEscolarEstudiantes.facturarAClientId, clients.id),
        eq(clients.teamId, teamId),
      ))
      .where(and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        inArray(adminEscolarEstudiantes.id, estudianteIds),
      )),

    db
      .select({
        id: adminEscolarCargos.id,
        estudianteId: adminEscolarCargos.estudianteId,
        conceptoId: adminEscolarCargos.conceptoId,
        conceptoNombre: adminEscolarConceptosPago.nombre,
        mes: adminEscolarCargos.mes,
        anio: adminEscolarCargos.anio,
        estado: adminEscolarCargos.estado,
        saldoCentavos: adminEscolarCargos.saldoCentavos,
        fechaVencimiento: adminEscolarCargos.fechaVencimiento,
        emisionDeLaCuota: adminEscolarConceptoCuotas.fechaEmision,
        creadoEn: adminEscolarCargos.createdAt,
        ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      })
      .from(adminEscolarCargos)
      .innerJoin(adminEscolarConceptosPago, and(
        eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
        eq(adminEscolarConceptosPago.teamId, teamId),
      ))
      .leftJoin(adminEscolarConceptoCuotas, and(
        eq(adminEscolarCargos.cuotaId, adminEscolarConceptoCuotas.id),
        eq(adminEscolarConceptoCuotas.teamId, teamId),
      ))
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.periodoId, periodoId),
        inArray(adminEscolarCargos.estudianteId, estudianteIds),
        inArray(adminEscolarCargos.conceptoId, conceptoIds),
        ne(adminEscolarCargos.estado, 'anulado'),
      ))
      .orderBy(asc(adminEscolarCargos.id)),
  ]);

  const alumnos: AlumnoLote[] = alumnosDb.map((a) => ({
    id: a.id,
    nombre: `${a.nombres} ${a.apellidos}`.trim(),
    clienteId: a.clienteId ?? null,
    responsable: a.responsable ?? null,
  }));

  const cargos: CargoLote[] = cargosDb.map((c) => ({
    id: c.id,
    estudianteId: c.estudianteId,
    conceptoId: c.conceptoId,
    conceptoNombre: c.conceptoNombre,
    mes: c.mes,
    anio: c.anio,
    estado: c.estado,
    saldoCentavos: c.saldoCentavos,
    fechaVencimiento: c.fechaVencimiento ? String(c.fechaVencimiento).slice(0, 10) : null,
    // Con calendario, la emisión de su cuota. Sin él (un paseo, la inscripción
    // cobrada a mano), el día en que se creó el cargo — en hora de República
    // Dominicana, no en la UTC del servidor, que a las 8 p. m. ya es mañana.
    fechaEmision: c.emisionDeLaCuota
      ? String(c.emisionDeLaCuota).slice(0, 10)
      : fechaRD(c.creadoEn),
    ecfDocumentId: c.ecfDocumentId,
    pagoUnico: c.mes == null && !c.emisionDeLaCuota,
  }));

  return { alumnos, cargos };
}

/** Lo que dice al usuario un grupo que no se pudo facturar. Nunca el texto crudo de un error interno. */
function detalleParaElUsuario(
  d: { motivo: string; detalle: string; yaFacturados?: boolean },
): string {
  if (d.yaFacturados) {
    return 'Alguien (o el cierre automático del día) ya facturó alguno de estos cargos mientras tanto. No se creó nada duplicado.';
  }
  // Estos tres los escribe el sistema en español para la oficina.
  if (d.motivo === 'prefill-rechazado' || d.motivo === 'sin-lineas' || d.motivo === 'sin-responsable' || d.motivo === 'sin-saldo') {
    return d.detalle;
  }
  // Cualquier otro es un fallo de la base o del código: el detalle (que puede
  // traer SQL) se queda en el log del servidor.
  return 'No se pudo crear esta factura. Vuelve a intentarlo; si sigue igual, avisa a soporte.';
}

/**
 * Crea las facturas de un plan. Siempre en BORRADOR (lo garantiza el
 * constructor): enviar a la DGII sigue siendo un acto aparte y deliberado.
 *
 * Recibe los grupos TAL CUAL los armó el plan —los mismos que la persona vio en
 * la vista previa— y se los entrega a `facturarGrupos`. Si entre la vista
 * previa y el clic otra corrida se llevó algún cargo, el candado de la
 * transacción deshace ese documento y aquí aparece como `yaFacturados`.
 */
export async function crearFacturasDelPlan(
  teamId: number, userId: number | null, facturas: FacturaPlan[],
): Promise<{ creadas: FacturaCreada[]; fallidas: FacturaFallida[] }> {
  const grupos: GrupoAFacturar[] = facturas.map((f) => ({
    clienteId: f.clienteId,
    cargos: f.lineas.map((l) => ({
      id: l.cargoId, saldoCentavos: l.saldoCentavos, fechaVencimiento: l.fechaVencimiento,
    })),
  }));

  const { facturas: hechas, diagnostico } = await facturarGrupos(teamId, grupos, { userId });

  // El plan y el resultado se emparejan por el primer cargo del grupo: es único
  // (un cargo está en una sola factura) y `facturarGrupos` respeta el orden.
  const porPrimerCargo = new Map(facturas.map((f) => [f.cargoIds[0], f]));

  const creadas: FacturaCreada[] = hechas.map((h) => {
    const plan = porPrimerCargo.get(h.cargoIds[0])!;
    return {
      clave: plan.clave,
      documentoId: h.documentoId,
      codigo: h.codigo,
      montoCentavos: h.montoCentavos,
      estudiantes: plan.estudiantes,
      responsable: plan.responsable,
      cargos: h.cargoIds.length,
    };
  });

  const fallidas: FacturaFallida[] = diagnostico.map((d) => {
    const plan = porPrimerCargo.get(d.cargoIds[0])!;
    if (d.motivo === 'error' && !d.yaFacturados) {
      console.error('[facturar-lote] factura no creada', { teamId, clave: plan.clave, detalle: d.detalle });
    }
    return {
      clave: plan.clave,
      estudiantes: plan.estudiantes,
      responsable: plan.responsable,
      motivo: d.motivo,
      detalle: detalleParaElUsuario(d),
      yaFacturados: d.yaFacturados === true,
    };
  });

  return { creadas, fallidas };
}
