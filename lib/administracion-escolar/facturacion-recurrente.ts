/** Puente escuela -> motor de facturación recurrente. Sin cron paralelo. */

import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
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
    if (existente.ecfDocumentId == null) {
      await db.update(adminEscolarCargos)
        .set({
          montoCentavos: args.montoCentavos,
          saldoCentavos: args.montoCentavos,
          fechaVencimiento: args.fechaVencimiento,
          ecfDocumentId: args.documentoId,
          updatedAt: new Date(),
        })
        .where(eq(adminEscolarCargos.id, existente.id));
    }
    return;
  }

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
