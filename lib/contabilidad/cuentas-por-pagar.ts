import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { generarAsientoPagoProveedor } from './asientos';

export interface CuentaPorPagar {
  id: number; proveedorNombre: string | null; proveedorRnc: string | null; referenciaEncf: string | null;
  fecha: string; fechaVencimiento: string | null; montoTotal: number; pagado: number; saldo: number;
  estadoPago: string; vencida: boolean; diasVencido: number;
}

export async function listarCuentasPorPagar(teamId: number) {
  const rows = await db.execute(sql`
    WITH cartera AS (
      SELECT c.id, c.proveedor_nombre AS "proveedorNombre", c.proveedor_rnc AS "proveedorRnc",
        c.referencia_encf AS "referenciaEncf", to_char(c.fecha,'YYYY-MM-DD') AS fecha,
        to_char(c.fecha_vencimiento,'YYYY-MM-DD') AS "fechaVencimiento", c.monto_total AS "montoTotal",
        c.estado_pago AS "estadoPago", coalesce((SELECT sum(p.monto_cents) FROM pagos_proveedores p WHERE p.compra_id=c.id),0) AS pagado
      FROM compras_locales c WHERE c.team_id=${teamId} AND c.forma_pago='credito'
    ) SELECT *, greatest(0, "montoTotal"-pagado) AS saldo,
      ("fechaVencimiento" IS NOT NULL AND "fechaVencimiento"::date < (now() AT TIME ZONE 'America/Santo_Domingo')::date) AS vencida,
      greatest(0, (now() AT TIME ZONE 'America/Santo_Domingo')::date - "fechaVencimiento"::date) AS "diasVencido"
    FROM cartera WHERE "montoTotal"-pagado > 0 ORDER BY vencida DESC, "fechaVencimiento" ASC NULLS LAST, fecha ASC
  `);
  const cuentas = (rows as unknown as Array<Record<string, unknown>>).map(r => ({
    ...r, id:Number(r.id), montoTotal:Number(r.montoTotal), pagado:Number(r.pagado), saldo:Number(r.saldo), diasVencido:Number(r.diasVencido),
  })) as CuentaPorPagar[];
  return { cuentas, totales: {
    pendiente: cuentas.reduce((s,c)=>s+c.saldo,0), vencido: cuentas.filter(c=>c.vencida).reduce((s,c)=>s+c.saldo,0),
    count: cuentas.length, countVencidas: cuentas.filter(c=>c.vencida).length,
  }};
}

export class PagoProveedorError extends Error {}

export async function registrarPagoProveedor(input: { teamId:number; compraId:number; montoCents:number; metodo:string; fechaPago:string; referencia?:string|null; notas?:string|null; userId:number }) {
  if (!Number.isSafeInteger(input.montoCents) || input.montoCents <= 0) throw new PagoProveedorError('Monto de pago inválido.');
  const pago = await db.transaction(async tx => {
    const compras = await tx.execute(sql`SELECT monto_total FROM compras_locales WHERE id=${input.compraId} AND team_id=${input.teamId} AND forma_pago='credito' FOR UPDATE`);
    const compra = (compras as unknown as { monto_total:number }[])[0];
    if (!compra) throw new PagoProveedorError('Compra a crédito no encontrada.');
    const sums = await tx.execute(sql`SELECT coalesce(sum(monto_cents),0) AS pagado FROM pagos_proveedores WHERE compra_id=${input.compraId} AND team_id=${input.teamId}`);
    const saldo = Number((sums as unknown as { pagado:number }[])[0].pagado);
    if (input.montoCents > Number(compra.monto_total) - saldo) throw new PagoProveedorError('El pago excede saldo pendiente.');
    const filas = await tx.execute(sql`INSERT INTO pagos_proveedores (team_id,compra_id,monto_cents,metodo,fecha_pago,referencia,notas,created_by)
      VALUES (${input.teamId},${input.compraId},${input.montoCents},${input.metodo},${input.fechaPago},${input.referencia??null},${input.notas??null},${input.userId}) RETURNING id`);
    const id = (filas as unknown as {id:number}[])[0].id;
    const restante = Number(compra.monto_total) - saldo - input.montoCents;
    await tx.execute(sql`UPDATE compras_locales SET estado_pago=${restante===0?'PAGADA':'PARCIAL'} WHERE id=${input.compraId}`);
    return { id, saldoNuevo: restante };
  });
  const asiento = await generarAsientoPagoProveedor(input.teamId, pago.id, input.userId);
  return { ...pago, asiento };
}
