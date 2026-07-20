/** Puente escuela -> motor de facturación recurrente. Sin cron paralelo. */

import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { mesPerteneceAlPeriodo } from './periodo-utils';

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
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
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
