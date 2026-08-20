import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { generarAsientoCompra } from '@/lib/contabilidad/asientos';
import { registrarPagoProveedor } from '@/lib/contabilidad/cuentas-por-pagar';

const TEAM = 9;
(async () => {
  let compraId: number | null = null, asientoCompra: number | null = null, asientoPago: number | null = null;
  try {
    const c = (await db.execute(sql`INSERT INTO compras_locales (team_id,proveedor_nombre,fecha,monto_total,forma_pago,metodo_pago,fecha_vencimiento,estado_pago) VALUES (${TEAM},'ZZZ-TEST CxP (borrar)',CURRENT_DATE,100000,'credito','efectivo',CURRENT_DATE+30,'PENDIENTE') RETURNING id`)) as unknown as {id:number}[];
    compraId = c[0].id;
    const compra = await generarAsientoCompra(TEAM, compraId, null);
    if (!compra.creado || !compra.asientoId) throw new Error(`Asiento compra: ${JSON.stringify(compra)}`);
    asientoCompra = compra.asientoId;
    const pago = await registrarPagoProveedor({ teamId:TEAM, compraId, montoCents:40000, metodo:'efectivo', fechaPago:new Date().toISOString().slice(0,10), userId:4 });
    if (!pago.asiento.creado || !pago.asiento.asientoId) throw new Error(`Asiento pago: ${JSON.stringify(pago)}`);
    asientoPago = pago.asiento.asientoId;
    const estado = (await db.execute(sql`SELECT estado_pago,monto_total-(SELECT coalesce(sum(monto_cents),0) FROM pagos_proveedores WHERE compra_id=${compraId}) AS saldo FROM compras_locales WHERE id=${compraId}`)) as unknown as {estado_pago:string;saldo:number}[];
    if (estado[0].estado_pago !== 'PARCIAL' || Number(estado[0].saldo) !== 60000) throw new Error(`Saldo: ${JSON.stringify(estado[0])}`);
    console.log('✓ CxP: compra RD$1,000; pago RD$400; saldo RD$600; estado PARCIAL.');
  } finally {
    for (const id of [asientoPago, asientoCompra]) if (id) { await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id=${id}`); await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id=${id}`); }
    if (compraId) {
      await db.execute(sql`DELETE FROM pagos_proveedores WHERE compra_id=${compraId}`);
      await db.execute(sql`DELETE FROM compras_locales WHERE id=${compraId}`);
    }
    await (db as unknown as {$client:{end:()=>Promise<void>}}).$client.end();
  }
})().catch(e=>{console.error(e);process.exit(1)});
