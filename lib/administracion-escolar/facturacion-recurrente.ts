/** Puente escuela -> motor de facturación recurrente. Sin cron paralelo. */

import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { mesPerteneceAlPeriodo } from './periodo-utils';
import { resolverTarifa } from './tarifas';

/**
 * Monto vigente de la mensualidad de la matrícula atada a una recurrente.
 *
 * La recurrente congela el precio cuando se configura; esto lo vuelve a
 * resolver EN CADA emisión desde la matrícula (monto propio, descuento o la
 * tarifa de su generación), para que un cambio hecho en la ficha DESPUÉS de
 * crear la recurrente sí se cobre del 25 en adelante. Antes el cron reemitía
 * eternamente el monto viejo aunque la secretaria le pusiera un monto propio.
 *
 * Solo repreciamos por una EXCEPCIÓN del propio alumno: un monto propio o un
 * descuento en su matrícula (`origen='beca'`), o un precio con
 * `objetivo_tipo='estudiante'` (`origen='estudiante'`). Cuando la tarifa sale de
 * la estructura (servicio/grado/sección = la de su generación) NO se toca la
 * recurrente: reprecificar en masa todas las mensualidades a la tarifa de
 * generación es otra decisión —el cutover de precios de estructura— y no la de
 * esta función; el emisor conserva el precio congelado y no hay cambio sorpresa.
 *
 * Devuelve centavos, o `null` cuando no hay excepción del alumno que aplicar
 * (recurrente no escolar, sin concepto de mensualidad, o tarifa de estructura)
 * — y entonces el emisor conserva el precio congelado, sin regresión.
 */
export async function tarifaMensualidadActual(
  facturaRecurrenteId: number,
): Promise<number | null> {
  const [matricula] = await db
    .select({
      id: adminEscolarMatriculas.id,
      teamId: adminEscolarMatriculas.teamId,
      conceptoId: adminEscolarMatriculas.conceptoMensualidadId,
    })
    .from(adminEscolarMatriculas)
    .where(eq(adminEscolarMatriculas.facturaRecurrenteId, facturaRecurrenteId))
    .limit(1);
  if (!matricula?.conceptoId) return null;

  const tarifa = await resolverTarifa(matricula.teamId, matricula.id, matricula.conceptoId);
  if (!tarifa || (tarifa.origen !== 'beca' && tarifa.origen !== 'estudiante')) return null;
  return tarifa.montoCentavos;
}

/**
 * ¿La mensualidad de ese mes ya se facturó a mano?
 *
 * La recurrente y el botón "Facturar" de la ficha llegan al mismo sitio por
 * caminos distintos, y hasta ahora no se miraban: si la secretaria facturaba
 * octubre el día 20, el cron del 25 emitía OTRA factura de octubre. La segunda
 * ni siquiera podía engancharse al cargo —`reflejarFacturaRecurrenteEnCargo` no
 * secuestra un cargo ya facturado— así que quedaba suelta, cobrándole dos veces
 * al padre sin que nada avisara.
 *
 * Se mira el CARGO y no las facturas del período recurrente porque la factura
 * manual no lleva `origenRecurrenteId`: por ahí son invisibles la una para la
 * otra. El cargo del mes es lo único que las dos tocan.
 */
export async function mesYaFacturadoAMano(
  facturaRecurrenteId: number,
  periodo: string,
): Promise<boolean> {
  const [anio, mes] = periodo.split('-').map(Number);
  if (!Number.isInteger(anio) || !Number.isInteger(mes)) return false;

  const [matricula] = await db
    .select({ id: adminEscolarMatriculas.id, teamId: adminEscolarMatriculas.teamId })
    .from(adminEscolarMatriculas)
    .where(eq(adminEscolarMatriculas.facturaRecurrenteId, facturaRecurrenteId))
    .limit(1);
  // Recurrente no escolar: no hay cargo que mirar y no hay nada que bloquear.
  if (!matricula) return false;

  const [yaFacturado] = await db
    .select({ id: adminEscolarCargos.id })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, matricula.teamId),
    ))
    .where(and(
      eq(adminEscolarCargos.matriculaId, matricula.id),
      eq(adminEscolarCargos.mes, mes),
      eq(adminEscolarCargos.anio, anio),
      eq(adminEscolarConceptosPago.tipo, 'mensualidad'),
      isNotNull(adminEscolarCargos.ecfDocumentId),
    ))
    .limit(1);

  return !!yaFacturado;
}

/**
 * Cada documento generado por una recurrente escolar crea (o completa) el
 * cargo de su mes. La factura continúa siendo única fuente de cobro; este cargo
 * solo la refleja en el perfil escolar.
 */
export async function reflejarFacturaRecurrenteEnCargo(args: {
  facturaRecurrenteId: number;
  documentoId: number;
  periodo: string;
  montoCentavos: number;
  fechaVencimiento: string | null;
}): Promise<void> {
  const [matricula] = await db
    .select({
      id: adminEscolarMatriculas.id,
      teamId: adminEscolarMatriculas.teamId,
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodoId: adminEscolarMatriculas.periodoId,
      conceptoId: adminEscolarMatriculas.conceptoMensualidadId,
      fechaInicio: adminEscolarPeriodos.fechaInicio,
      fechaFin: adminEscolarPeriodos.fechaFin,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
    .where(eq(adminEscolarMatriculas.facturaRecurrenteId, args.facturaRecurrenteId))
    .limit(1);

  // Recurrente no escolar: no hay nada que reflejar en Administración Escolar.
  if (!matricula?.conceptoId) return;

  const [anio, mes] = args.periodo.split('-').map(Number);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) ||
      !mesPerteneceAlPeriodo(matricula.fechaInicio, matricula.fechaFin, mes, anio)) {
    // La validación de creación/edición evita este caso. Nunca crear cargos
    // escolares fuera del calendario si existiera un plan legacy inconsistente.
    return;
  }

  // Enlaza un cargo existente a la factura del mes: la factura define el monto y
  // el saldo (luego `sincronizarSaldosDesdeFacturas` lo recalcula del ledger).
  const enlazar = (cargoId: number) => db.update(adminEscolarCargos)
    .set({
      montoCentavos: args.montoCentavos,
      saldoCentavos: args.montoCentavos,
      fechaVencimiento: args.fechaVencimiento,
      ecfDocumentId: args.documentoId,
      updatedAt: new Date(),
    })
    .where(eq(adminEscolarCargos.id, cargoId));

  // 1. Match exacto: cargo del mes con el MISMO concepto de mensualidad de la
  //    matrícula (el caso normal, creado por "Gestionar mensualidad").
  const [existente] = await db
    .select({ id: adminEscolarCargos.id, ecfDocumentId: adminEscolarCargos.ecfDocumentId })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.matriculaId, matricula.id),
      eq(adminEscolarCargos.conceptoId, matricula.conceptoId),
      eq(adminEscolarCargos.mes, mes),
      eq(adminEscolarCargos.anio, anio),
    ))
    .limit(1);

  if (existente) {
    // Idempotencia: cron/manual pueden intentar mismo período más de una vez.
    if (existente.ecfDocumentId === args.documentoId) return;
    // Cargo previo sin factura: reutilizarlo, ahora el documento queda atado al mes.
    if (existente.ecfDocumentId == null) await enlazar(existente.id);
    return;
  }

  // 2. Dedup guardado: no hay cargo con el concepto exacto, pero puede existir un
  //    cargo de mensualidad del MISMO mes creado a mano con OTRO concepto y SIN
  //    factura. Enlazarlo en vez de crear un segundo cargo de mensualidad (evita
  //    los duplicados del mismo mes). Guardas: solo concepto tipo 'mensualidad' y
  //    solo si NO tiene factura — nunca secuestra un cargo ya facturado ni uno de
  //    otro tipo (uniforme/actividad). En un colegio hay UNA mensualidad por mes,
  //    así que enlazar el huérfano del mes es lo correcto.
  const [huerfano] = await db
    .select({ id: adminEscolarCargos.id })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, matricula.teamId),
    ))
    .where(and(
      eq(adminEscolarCargos.matriculaId, matricula.id),
      eq(adminEscolarCargos.mes, mes),
      eq(adminEscolarCargos.anio, anio),
      eq(adminEscolarConceptosPago.tipo, 'mensualidad'),
      isNull(adminEscolarCargos.ecfDocumentId),
    ))
    .orderBy(adminEscolarCargos.id)
    .limit(1);

  if (huerfano) {
    await enlazar(huerfano.id);
    return;
  }

  // 3. No hay cargo previo del mes: crear uno nuevo con el concepto de la matrícula.
  await db.insert(adminEscolarCargos).values({
    teamId: matricula.teamId,
    estudianteId: matricula.estudianteId,
    matriculaId: matricula.id,
    periodoId: matricula.periodoId,
    conceptoId: matricula.conceptoId,
    mes,
    anio,
    montoCentavos: args.montoCentavos,
    saldoCentavos: args.montoCentavos,
    fechaVencimiento: args.fechaVencimiento,
    estado: 'pendiente',
    ecfDocumentId: args.documentoId,
  });
}
