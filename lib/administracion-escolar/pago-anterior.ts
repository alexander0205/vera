/**
 * Un pago que la familia ya hizo antes de que el colegio usara Zero, anotado
 * sobre su cargo durante la migración.
 *
 * Regla de Alex: todo cobro va atado a una factura. Así que anotar «agosto lo
 * pagó» es lo mismo que hace «Cuenta por cobrar histórica»: una factura
 * HISTÓRICA (no va a la DGII, `tipoEcf` '00') por el monto del cargo, a nombre
 * del responsable de pago, con el NCF que tenía en papel si lo tiene, y su pago
 * encima. Después el cargo se ata a esa factura y su saldo sale de ella, como
 * cualquier cargo facturado.
 *
 * Si la factura ya existe en Zero (vino de Alegra, por ejemplo), no se crea
 * otra: se dice cuál es para vincularla.
 */

import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarConceptosPago, adminEscolarEstudiantes, clients, ecfDocuments,
} from '@/lib/db/schema';
import { registrarPago } from '@/lib/db/queries';
import { METODOS_PAGO_SET } from '@/lib/pagos/metodos';
import { sincronizarSaldosDesdeFacturas } from './queries';

export class PagoAnteriorError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

export async function registrarPagoAnterior(teamId: number, userId: number, cargoId: number, entrada: {
  pagadoCentavos: number;
  fechaPago: string;
  metodo: string;
  /** El NCF completo, ya armado. `null` = sin comprobante. */
  ncf: string | null;
}) {
  const { pagadoCentavos, fechaPago, metodo } = entrada;
  if (!Number.isInteger(pagadoCentavos) || pagadoCentavos <= 0) {
    throw new PagoAnteriorError(400, 'Escribe cuánto pagó.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) throw new PagoAnteriorError(400, 'Fecha de pago inválida.');
  if (!METODOS_PAGO_SET.has(metodo)) throw new PagoAnteriorError(400, 'Forma de pago inválida.');
  const ncf = entrada.ncf?.trim().toUpperCase() || null;
  if (ncf && !/^(B\d{10}|E\d{12})$/.test(ncf)) throw new PagoAnteriorError(400, 'El NCF no está completo.');

  const [cargo] = await db.select({
      id: adminEscolarCargos.id,
      estudianteId: adminEscolarCargos.estudianteId,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      concepto: adminEscolarConceptosPago.nombre,
      clientId: adminEscolarEstudiantes.facturarAClientId,
      alumno: adminEscolarEstudiantes.nombres,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, adminEscolarCargos.estudianteId))
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);
  if (!cargo) throw new PagoAnteriorError(404, 'Cargo no encontrado.');
  if (cargo.estado === 'anulado') throw new PagoAnteriorError(409, 'Este mes no se cobra (está anulado).');
  if (cargo.ecfDocumentId != null) throw new PagoAnteriorError(409, 'Este mes ya tiene factura: el pago se anota en ella.');
  // Un cargo con un abono suelto encima no se puede cubrir con una factura de su monto entero.
  if (cargo.saldoCentavos !== cargo.montoCentavos) {
    throw new PagoAnteriorError(409, 'Este mes ya tiene algo cobrado fuera de una factura: corrígelo en su ficha.');
  }
  if (pagadoCentavos > cargo.montoCentavos) {
    throw new PagoAnteriorError(400, 'Pagó más de lo que cuesta el mes. Anota el resto en el mes que corresponda.');
  }
  if (!cargo.clientId) throw new PagoAnteriorError(400, 'Falta el responsable de pago: ponlo en «Familia».');

  // El mismo comprobante no se registra dos veces. Alegra entró con «ALG-».
  if (ncf) {
    const [ya] = await db.select({ id: ecfDocuments.id, encf: ecfDocuments.encf })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        inArray(ecfDocuments.encf, [ncf, `ALG-${ncf}`]),
        ne(ecfDocuments.estado, 'ANULADO'),
      ))
      .limit(1);
    if (ya) throw new PagoAnteriorError(409, `La factura ${ncf} ya está en Zero: usa «Vincular factura».`);
  }

  const [cliente] = await db.select({ rnc: clients.rnc, razonSocial: clients.razonSocial, email: clients.email })
    .from(clients).where(and(eq(clients.id, cargo.clientId), eq(clients.teamId, teamId))).limit(1);
  if (!cliente) throw new PagoAnteriorError(400, 'El responsable de pago ya no existe en Contactos.');

  const mes = cargo.mes ? `${MESES[cargo.mes - 1]}${cargo.anio ? ` ${cargo.anio}` : ''}` : '';
  const [doc] = await db.insert(ecfDocuments).values({
    teamId,
    clientId: cargo.clientId,
    encf: ncf ?? `HIST-${teamId}-${Date.now().toString(36).toUpperCase()}`,
    tipoEcf: '00',
    estado: 'HISTORICA',
    rncComprador: cliente.rnc,
    razonSocialComprador: cliente.razonSocial,
    emailComprador: cliente.email,
    montoTotal: cargo.montoCentavos,
    totalItbis: 0,
    tipoPago: 2,
    // Mediodía: `new Date('YYYY-MM-DD')` es medianoche UTC y en RD sale el día antes.
    fechaEmision: new Date(`${fechaPago}T12:00:00`),
    fechaLimitePago: cargo.fechaVencimiento ?? fechaPago,
    notas: `Pago anterior a Zero: ${cargo.concepto}${mes ? ` de ${mes}` : ''} (${cargo.alumno}). Anotado en la migración.`,
  }).returning({ id: ecfDocuments.id, encf: ecfDocuments.encf });

  try {
    await registrarPago({
      teamId,
      ecfDocumentId: doc.id,
      montoCentavos: pagadoCentavos,
      metodo,
      fechaPago,
      notas: 'Pago anterior a Zero (migración)',
      createdBy: userId,
    });
    await db.update(adminEscolarCargos)
      .set({ ecfDocumentId: doc.id, updatedAt: new Date() })
      .where(and(eq(adminEscolarCargos.id, cargo.id), eq(adminEscolarCargos.teamId, teamId)));
  } catch (err) {
    // A medias no: una factura histórica sin su pago ni su cargo es deuda inventada.
    await db.update(adminEscolarCargos).set({ ecfDocumentId: null, updatedAt: new Date() })
      .where(and(eq(adminEscolarCargos.id, cargo.id), eq(adminEscolarCargos.ecfDocumentId, doc.id)));
    await db.update(ecfDocuments).set({ estado: 'ANULADO' })
      .where(and(eq(ecfDocuments.id, doc.id), eq(ecfDocuments.teamId, teamId)));
    throw err;
  }

  await sincronizarSaldosDesdeFacturas(teamId, cargo.estudianteId);
  return { ecfDocumentId: doc.id, encf: doc.encf };
}
