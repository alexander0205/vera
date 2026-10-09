/**
 * Solicitudes de pago a proveedores con aprobación.
 *
 * Quien arma la lista de pagos (secretaria) solicita; el dueño aprueba o rechaza
 * mirando lo disponible; luego se registra el pago de siempre
 * (`registrarPagoProveedor`) y la solicitud queda «pagada» enlazada a ese pago.
 *
 *   solicitado → aprobado → pagado
 *        ↘ rechazado / cancelado
 *
 * Una solicitud no mueve dinero ni asienta nada por sí sola.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cuentasDeSalida } from '@/lib/contabilidad/config';
import { PagoProveedorError, registrarPagoProveedor } from '@/lib/contabilidad/cuentas-por-pagar';

export const ESTADOS_SOLICITUD = ['solicitado', 'aprobado', 'rechazado', 'cancelado', 'pagando', 'pagado'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Tope de solicitudes abiertas (solicitadas o aprobadas) por empresa. */
export const SOLICITUDES_ABIERTAS_MAX = 500;
/** Filas que devuelve el listado. */
export const SOLICITUDES_LISTA_MAX = 300;

export class SolicitudPagoError extends Error {
  constructor(mensaje: string, readonly status = 422) { super(mensaje); }
}

const aNumero = (v: unknown) => (v == null ? 0 : Number(v));

export interface SolicitudPago {
  id: number;
  compraId: number;
  proveedor: string | null;
  referencia: string | null;
  montoCents: number;
  metodo: string;
  cuentaSalidaId: number | null;
  cuentaSalida: string | null;
  nota: string | null;
  estado: EstadoSolicitud;
  solicitadaPor: string | null;
  solicitadaAt: string;
  resueltaPor: string | null;
  resueltaAt: string | null;
  motivo: string | null;
  /** Lo que le falta por pagar a esa compra. */
  saldoCompraCents: number;
}

export interface ListadoSolicitudes {
  solicitudes: SolicitudPago[];
  /** Suma de lo pedido y de lo aprobado que aún no se paga. */
  pendientesCents: number;
  aprobadasCents: number;
  /** Saldo de las cajas y bancos de los que se puede pagar, para decidir. */
  disponible: { cuentaId: number; codigo: string; nombre: string; saldoCents: number }[];
}

export async function listarSolicitudes(teamId: number, estado?: EstadoSolicitud): Promise<ListadoSolicitudes> {
  const filtro = estado ? sql`AND s.estado = ${estado}` : sql``;
  const filas = await db.execute(sql`
    SELECT s.id, s.compra_id AS "compraId", c.proveedor_nombre AS proveedor, c.referencia_encf AS referencia,
           s.monto_cents AS monto, s.metodo, s.cuenta_salida_id AS "cuentaSalidaId",
           (cu.codigo || ' ' || cu.nombre) AS "cuentaSalida", s.nota, s.estado,
           u1.name AS "solicitadaPor", s.solicitada_at AS "solicitadaAt", u2.name AS "resueltaPor",
           s.resuelta_at AS "resueltaAt", s.motivo,
           GREATEST(0, (c.monto_total - c.itbis_retenido_cents - c.isr_retenido_cents)
             - COALESCE((SELECT sum(p.monto_cents) FROM pagos_proveedores p WHERE p.compra_id = c.id), 0)) AS saldo
    FROM pagos_solicitudes s
    JOIN compras_locales c ON c.id = s.compra_id AND c.team_id = ${teamId}
    LEFT JOIN contabilidad_cuentas cu ON cu.id = s.cuenta_salida_id
    LEFT JOIN users u1 ON u1.id = s.solicitada_por
    LEFT JOIN users u2 ON u2.id = s.resuelta_por
    WHERE s.team_id = ${teamId} ${filtro}
    ORDER BY CASE s.estado WHEN 'solicitado' THEN 0 WHEN 'aprobado' THEN 1 WHEN 'pagando' THEN 2 ELSE 3 END, s.id DESC
    LIMIT ${SOLICITUDES_LISTA_MAX}
  `) as unknown as Record<string, unknown>[];

  const solicitudes = filas.map((f): SolicitudPago => ({
    id: aNumero(f.id), compraId: aNumero(f.compraId), proveedor: (f.proveedor as string) ?? null, referencia: (f.referencia as string) ?? null,
    montoCents: aNumero(f.monto), metodo: String(f.metodo), cuentaSalidaId: f.cuentaSalidaId == null ? null : aNumero(f.cuentaSalidaId),
    cuentaSalida: (f.cuentaSalida as string) ?? null, nota: (f.nota as string) ?? null, estado: f.estado as EstadoSolicitud,
    solicitadaPor: (f.solicitadaPor as string) ?? null, solicitadaAt: new Date(f.solicitadaAt as string).toISOString(),
    resueltaPor: (f.resueltaPor as string) ?? null, resueltaAt: f.resueltaAt ? new Date(f.resueltaAt as string).toISOString() : null,
    motivo: (f.motivo as string) ?? null, saldoCompraCents: aNumero(f.saldo),
  }));

  const [abiertas] = await db.execute(sql`
    SELECT COALESCE(sum(monto_cents) FILTER (WHERE estado = 'solicitado'), 0)::bigint AS pedido,
           COALESCE(sum(monto_cents) FILTER (WHERE estado IN ('aprobado', 'pagando')), 0)::bigint AS aprobado
    FROM pagos_solicitudes WHERE team_id = ${teamId}`) as unknown as { pedido: unknown; aprobado: unknown }[];

  const { cuentas } = await cuentasDeSalida(teamId);
  const saldos = cuentas.length === 0 ? [] : await db.execute(sql`
    SELECT l.cuenta_id AS id, COALESCE(sum(l.debe_cents - l.haber_cents), 0)::bigint AS saldo
    FROM contabilidad_asiento_lineas l
    WHERE l.team_id = ${teamId} AND l.cuenta_id IN (${sql.join(cuentas.map((c) => sql`${c.id}`), sql`, `)})
    GROUP BY l.cuenta_id`) as unknown as { id: number; saldo: unknown }[];
  const saldoDe = new Map(saldos.map((s) => [aNumero(s.id), aNumero(s.saldo)]));

  return {
    solicitudes,
    pendientesCents: aNumero(abiertas?.pedido),
    aprobadasCents: aNumero(abiertas?.aprobado),
    disponible: cuentas.map((c) => ({ cuentaId: c.id, codigo: c.codigo, nombre: c.nombre, saldoCents: saldoDe.get(c.id) ?? 0 })),
  };
}

export interface NuevaSolicitud {
  teamId: number;
  userId: number;
  compraId: number;
  montoCents: number;
  metodo: string;
  cuentaSalidaId: number | null;
  nota: string | null;
}

/** Crea la solicitud. Lo ya pedido o aprobado de esa compra descuenta del saldo que se puede pedir. */
export async function crearSolicitud(i: NuevaSolicitud): Promise<number> {
  if (!Number.isSafeInteger(i.montoCents) || i.montoCents <= 0) throw new SolicitudPagoError('Monto inválido.', 400);
  if (i.cuentaSalidaId) {
    const { cuentas } = await cuentasDeSalida(i.teamId);
    if (!cuentas.some((c) => c.id === i.cuentaSalidaId)) throw new SolicitudPagoError('De esa cuenta no puede salir dinero: elige una de caja o banco.', 400);
  }
  return db.transaction(async (tx) => {
    const compras = await tx.execute(sql`
      SELECT (monto_total - itbis_retenido_cents - isr_retenido_cents) AS neto, estado
      FROM compras_locales WHERE id = ${i.compraId} AND team_id = ${i.teamId} AND forma_pago = 'credito' FOR UPDATE`) as unknown as { neto: unknown; estado: string }[];
    const compra = compras[0];
    if (!compra) throw new SolicitudPagoError('Compra a crédito no encontrada.', 404);
    if (compra.estado !== 'registrada') throw new SolicitudPagoError('La compra está anulada.');

    const [{ pagado }] = await tx.execute(sql`SELECT COALESCE(sum(monto_cents), 0)::bigint AS pagado FROM pagos_proveedores WHERE compra_id = ${i.compraId} AND team_id = ${i.teamId}`) as unknown as { pagado: unknown }[];
    const [{ abierto, total }] = await tx.execute(sql`
      SELECT COALESCE(sum(monto_cents) FILTER (WHERE compra_id = ${i.compraId}), 0)::bigint AS abierto, count(*)::int AS total
      FROM pagos_solicitudes WHERE team_id = ${i.teamId} AND estado IN ('solicitado', 'aprobado', 'pagando')`) as unknown as { abierto: unknown; total: unknown }[];
    if (aNumero(total) >= SOLICITUDES_ABIERTAS_MAX) throw new SolicitudPagoError(`Hay ${SOLICITUDES_ABIERTAS_MAX} solicitudes abiertas: resuelve algunas primero.`, 409);
    const libre = aNumero(compra.neto) - aNumero(pagado) - aNumero(abierto);
    if (i.montoCents > libre) {
      throw new SolicitudPagoError(libre <= 0
        ? 'Esa compra ya tiene solicitudes por todo su saldo.'
        : `Solo se puede pedir hasta el saldo libre de la compra (${(libre / 100).toFixed(2)}): el resto ya está pedido o pagado.`, 409);
    }
    const [fila] = await tx.execute(sql`
      INSERT INTO pagos_solicitudes (team_id, compra_id, monto_cents, metodo, cuenta_salida_id, nota, solicitada_por)
      VALUES (${i.teamId}, ${i.compraId}, ${i.montoCents}, ${i.metodo}, ${i.cuentaSalidaId}, ${i.nota}, ${i.userId}) RETURNING id`) as unknown as { id: number }[];
    return fila.id;
  });
}

/** Pasa de un estado a otro solo si sigue en el esperado: dos personas no resuelven la misma solicitud. */
async function transicion(teamId: number, id: number, desde: EstadoSolicitud[], a: EstadoSolicitud, userId: number, motivo: string | null): Promise<void> {
  const filas = await db.execute(sql`
    UPDATE pagos_solicitudes SET estado = ${a}, resuelta_por = ${userId}, resuelta_at = NOW(), motivo = COALESCE(${motivo}, motivo)
    WHERE id = ${id} AND team_id = ${teamId} AND estado IN (${sql.join(desde.map((d) => sql`${d}`), sql`, `)})
    RETURNING id`) as unknown as { id: number }[];
  if (filas.length === 0) throw new SolicitudPagoError('La solicitud no existe o ya no está en un estado que permita esto. Actualiza la lista.', 409);
}

export const aprobarSolicitud = (teamId: number, id: number, userId: number) => transicion(teamId, id, ['solicitado'], 'aprobado', userId, null);
export const rechazarSolicitud = (teamId: number, id: number, userId: number, motivo: string | null) => transicion(teamId, id, ['solicitado'], 'rechazado', userId, motivo);
export const cancelarSolicitud = (teamId: number, id: number, userId: number) => transicion(teamId, id, ['solicitado', 'aprobado'], 'cancelado', userId, null);

/** Registra el pago de una solicitud aprobada. Si el pago falla, vuelve a aprobada. */
export async function pagarSolicitud(teamId: number, id: number, userId: number, fechaPago: string): Promise<{ pagoId: number }> {
  const [s] = await db.execute(sql`
    UPDATE pagos_solicitudes SET estado = 'pagando'
    WHERE id = ${id} AND team_id = ${teamId} AND estado = 'aprobado'
    RETURNING compra_id AS "compraId", monto_cents AS monto, metodo, cuenta_salida_id AS "cuentaId", nota`) as unknown as
    { compraId: number; monto: unknown; metodo: string; cuentaId: number | null; nota: string | null }[];
  if (!s) throw new SolicitudPagoError('La solicitud no está aprobada o ya se pagó. Actualiza la lista.', 409);
  let pago: Awaited<ReturnType<typeof registrarPagoProveedor>>;
  try {
    pago = await registrarPagoProveedor({
      teamId, compraId: s.compraId, montoCents: aNumero(s.monto), metodo: s.metodo, fechaPago,
      referencia: `Solicitud #${id}`, notas: s.nota, cuentaSalidaId: s.cuentaId, userId,
    });
  } catch (e) {
    await db.execute(sql`UPDATE pagos_solicitudes SET estado = 'aprobado' WHERE id = ${id} AND estado = 'pagando'`);
    if (e instanceof PagoProveedorError) throw new SolicitudPagoError(e.message);
    throw e;
  }
  // El pago ya está hecho: si esta marca falla la solicitud se queda en «pagando»
  // (no se vuelve a ofrecer para pagar) y el pago sigue visible en la compra.
  await db.execute(sql`UPDATE pagos_solicitudes SET estado = 'pagado', pago_id = ${pago.id} WHERE id = ${id}`);
  return { pagoId: pago.id };
}
