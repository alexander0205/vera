/**
 * scripts/investigar-1103.ts — SOLO LECTURA. Mide por qué la cuenta CxC (1103)
 * queda con saldo invertido (acreedor) en un team ya barrido.
 *
 * Hipótesis (nivel 2.3 del plan): `generarAsientoPago` acredita CxC por TODO
 * pago con monto>0, pero `generarAsientoFactura` salta las facturas no asentables
 * (no-venta, estado, sin monto, sin cuenta). El pago acredita sin que exista el
 * débito → CxC acreedor. En un team 100% barrido, lo que quede es ESTRUCTURAL.
 *
 *   npx tsx scripts/investigar-1103.ts [teamId]   (default 9)
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

const teamId = Number(process.argv[2] ?? 9);

async function main() {
  const [cfg] = (await db.execute(sql`
    SELECT cuenta_por_cobrar_id AS id FROM contabilidad_config WHERE team_id = ${teamId}
  `)) as unknown as Array<{ id: number | null }>;
  if (!cfg?.id) { console.log(`Team ${teamId} sin cuenta_por_cobrar configurada`); process.exit(0); }
  const cxcId = cfg.id;

  const [cuenta] = (await db.execute(sql`
    SELECT codigo, nombre, naturaleza FROM contabilidad_cuentas WHERE id = ${cxcId}
  `)) as unknown as Array<{ codigo: string; nombre: string; naturaleza: string }>;

  // 1. Saldo neto de la cuenta CxC.
  const [saldo] = (await db.execute(sql`
    SELECT SUM(debe_cents) AS debe, SUM(haber_cents) AS haber,
           SUM(debe_cents) - SUM(haber_cents) AS saldo, COUNT(*) AS lineas
    FROM contabilidad_asiento_lineas
    WHERE team_id = ${teamId} AND cuenta_id = ${cxcId}
  `)) as unknown as Array<Record<string, string>>;

  console.log(`\n=== Team ${teamId} · cuenta ${cuenta.codigo} ${cuenta.nombre} (${cuenta.naturaleza}) ===`);
  const s = Number(saldo.saldo);
  console.log(`  débitos:  ${(Number(saldo.debe) / 100).toFixed(2)}`);
  console.log(`  créditos: ${(Number(saldo.haber) / 100).toFixed(2)}`);
  console.log(`  saldo:    ${(s / 100).toFixed(2)}  → ${s < 0 ? 'INVERTIDO (acreedor)' : 'normal (deudor)'}`);
  console.log(`  líneas:   ${saldo.lineas}`);

  // 2. Pagos asentados cuya FACTURA no tiene asiento, por razón.
  const orfanos = (await db.execute(sql`
    SELECT
      CASE
        WHEN p.ecf_document_id IS NULL THEN 'pago sin factura vinculada'
        WHEN d.id IS NULL              THEN 'factura inexistente'
        WHEN d.estado NOT IN ('ACEPTADO','ACEPTADO_CONDICIONAL','EN_PROCESO') THEN 'estado no-venta: ' || d.estado
        WHEN d.tipo_ecf NOT IN ('31','32','33','44','45') THEN 'tipo no-venta: ' || d.tipo_ecf
        WHEN d.monto_total <= 0        THEN 'monto_total <= 0'
        ELSE 'INESPERADO (parece asentable)'
      END AS razon,
      COUNT(*) AS pagos,
      SUM(p.monto_centavos) AS acreditado_cents
    FROM pagos_recibidos p
    JOIN contabilidad_asientos ap
      ON ap.team_id = p.team_id AND ap.origen_tipo = 'pago' AND ap.origen_id = p.id
    LEFT JOIN ecf_documents d ON d.id = p.ecf_document_id
    LEFT JOIN contabilidad_asientos af
      ON af.team_id = ${teamId} AND af.origen_tipo = 'factura' AND af.origen_id = d.id
    WHERE p.team_id = ${teamId}
      AND af.id IS NULL
    GROUP BY razon
    ORDER BY acreditado_cents DESC
  `)) as unknown as Array<{ razon: string; pagos: string; acreditado_cents: string }>;

  console.log(`\n--- Pagos asentados SIN débito de factura (la causa de la inversión) ---`);
  let totalOrfano = 0, totalPagos = 0;
  for (const o of orfanos) {
    const c = Number(o.acreditado_cents);
    totalOrfano += c; totalPagos += Number(o.pagos);
    console.log(`  ${o.razon.padEnd(34)} · ${String(o.pagos).padStart(4)} pagos · RD$${(c / 100).toFixed(2)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(34)} · ${String(totalPagos).padStart(4)} pagos · RD$${(totalOrfano / 100).toFixed(2)}`);
  console.log(`\n  El crédito huérfano (RD$${(totalOrfano / 100).toFixed(2)}) es lo que empuja 1103 hacia acreedor.`);
  console.log(`  Saldo sin esos pagos: RD$${((s + totalOrfano) / 100).toFixed(2)} (debería ser >= 0).`);

  // 3. El linchpin: de los borradores con pago huérfano, ¿cuántos CUENTA la
  //    cartera como CxC? (misma condición del CTE: excluye solo el borrador que
  //    reserva un e-NCF real E<12 dígitos). Si la cartera los cuenta, lo
  //    consistente es que contabilidad les haga el débito (Opción A).
  const borr = (await db.execute(sql`
    SELECT
      CASE WHEN d.encf ~ '^E[0-9]{12}$' THEN 'reserva e-NCF real (cartera EXCLUYE)'
           ELSE 'borrador legítimo BOR-/vacío (cartera CUENTA)' END AS clase,
      d.estado_pago,
      COUNT(*) AS pagos, SUM(p.monto_centavos) AS cents
    FROM pagos_recibidos p
    JOIN contabilidad_asientos ap
      ON ap.team_id = p.team_id AND ap.origen_tipo = 'pago' AND ap.origen_id = p.id
    JOIN ecf_documents d ON d.id = p.ecf_document_id
    LEFT JOIN contabilidad_asientos af
      ON af.team_id = ${teamId} AND af.origen_tipo = 'factura' AND af.origen_id = d.id
    WHERE p.team_id = ${teamId} AND af.id IS NULL AND d.estado = 'BORRADOR'
    GROUP BY clase, d.estado_pago
    ORDER BY cents DESC
  `)) as unknown as Array<{ clase: string; estado_pago: string; pagos: string; cents: string }>;

  console.log(`\n--- Borradores con pago huérfano: ¿la cartera los cuenta? ---`);
  for (const b of borr) {
    console.log(`  ${b.clase.padEnd(46)} estado_pago=${(b.estado_pago ?? '∅').padEnd(10)} · ${String(b.pagos).padStart(4)} pagos · RD$${(Number(b.cents) / 100).toFixed(2)}`);
  }

  // 4. Radio de impacto de la Opción A: cuántos borradores LEGÍTIMOS (venta,
  //    monto>0, no reserva e-NCF) se asentarían en total, y cuántos NO tienen
  //    cobro (esos serían ingreso NUEVO reconocido, no solo fixear el orfano).
  const radio = (await db.execute(sql`
    SELECT
      CASE WHEN EXISTS (
        SELECT 1 FROM pagos_recibidos p
        JOIN contabilidad_asientos ap
          ON ap.team_id = p.team_id AND ap.origen_tipo = 'pago' AND ap.origen_id = p.id
        WHERE p.ecf_document_id = d.id
      ) THEN 'con cobro asentado (fixea huérfano)'
        ELSE 'sin cobro (ingreso NUEVO)' END AS clase,
      COUNT(*) AS facturas,
      SUM(d.monto_total) AS cents
    FROM ecf_documents d
    WHERE d.team_id = ${teamId} AND d.estado = 'BORRADOR'
      AND d.tipo_ecf IN ('31','32','33','44','45') AND d.monto_total > 0
      AND NOT (d.encf ~ '^E[0-9]{12}$')
    GROUP BY clase
  `)) as unknown as Array<{ clase: string; facturas: string; cents: string }>;

  console.log(`\n--- Radio de impacto Opción A (borradores legítimos a asentar) ---`);
  for (const r of radio) {
    console.log(`  ${r.clase.padEnd(40)} · ${String(r.facturas).padStart(4)} facturas · RD$${(Number(r.cents) / 100).toFixed(2)}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
