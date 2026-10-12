/**
 * Verificación sintética Nivel 4.3. Crea compra gravada en team 9, comprueba
 * 1105 base + 1104 crédito fiscal / 2101 total e idempotencia; limpia todo y
 * restaura el régimen que el team tenía antes de empezar.
 */
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { generarAsientoCompra } from '@/lib/contabilidad/asientos';

const TEAM = 9;

(async () => {
  const previo = (await db.execute(sql`
    SELECT activa, regimen_itbis AS "regimenItbis"
    FROM contabilidad_config WHERE team_id = ${TEAM}
  `)) as unknown as Array<{ activa: boolean; regimenItbis: 'exento' | 'gravado' }>;
  if (!previo[0]?.activa) throw new Error('Team 9 no tiene contabilidad activa; no se puede verificar el asiento.');

  const cuentas = (await db.execute(sql`
    SELECT codigo, id FROM contabilidad_cuentas
    WHERE team_id = ${TEAM} AND activa AND imputable AND codigo IN ('1104', '1105', '2101')
  `)) as unknown as Array<{ codigo: string; id: number }>;
  if (cuentas.length !== 3) throw new Error('Faltan cuentas 1104, 1105 o 2101 en team 9.');
  const cuentaPorCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));

  let compraId: number | null = null;
  let asientoId: number | null = null;
  try {
    await db.execute(sql`
      UPDATE contabilidad_config SET regimen_itbis = 'gravado' WHERE team_id = ${TEAM}
    `);
    const compra = (await db.execute(sql`
      INSERT INTO compras_locales
        (team_id, proveedor_nombre, fecha, itbis_cents, monto_total, notas)
      VALUES (${TEAM}, 'ZZZ-TEST ITBIS (borrar)', CURRENT_DATE, 18000, 118000, 'Verificación sintética nivel 4.3')
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    compraId = compra[0].id;

    const primera = await generarAsientoCompra(TEAM, compraId, null);
    if (!primera.creado || !primera.asientoId) throw new Error(`Primera generación falló: ${JSON.stringify(primera)}`);
    asientoId = primera.asientoId;

    const lineasRaw = (await db.execute(sql`
      SELECT cuenta_id AS "cuentaId", debe_cents AS "debeCents", haber_cents AS "haberCents"
      FROM contabilidad_asiento_lineas WHERE asiento_id = ${asientoId} ORDER BY orden
    `)) as unknown as Array<{ cuentaId: number; debeCents: number; haberCents: number }>;
    // PostgreSQL entrega bigint como string: normalizar antes de comparar.
    const lineas = lineasRaw.map((l) => ({
      cuentaId: Number(l.cuentaId), debeCents: Number(l.debeCents), haberCents: Number(l.haberCents),
    }));
    const esperado = [
      { cuentaId: cuentaPorCodigo.get('1105'), debeCents: 100000, haberCents: 0 },
      { cuentaId: cuentaPorCodigo.get('1104'), debeCents: 18000, haberCents: 0 },
      { cuentaId: cuentaPorCodigo.get('2101'), debeCents: 0, haberCents: 118000 },
    ];
    if (JSON.stringify(lineas) !== JSON.stringify(esperado)) {
      throw new Error(`Líneas inesperadas: ${JSON.stringify(lineas)}`);
    }
    const segunda = await generarAsientoCompra(TEAM, compraId, null);
    if (segunda.creado || segunda.motivo !== 'ya-tiene-asiento') {
      throw new Error(`Idempotencia falló: ${JSON.stringify(segunda)}`);
    }
    console.log('✓ Gravado: Debe 1105 RD$1,000 + Debe 1104 RD$180 / Haber 2101 RD$1,180.');
    console.log('✓ Segunda corrida: 0 asientos (idempotencia).');
  } finally {
    if (asientoId) {
      await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id = ${asientoId}`);
      await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id = ${asientoId}`);
    }
    if (compraId) await db.execute(sql`DELETE FROM compras_locales WHERE id = ${compraId}`);
    if (previo[0]) {
      await db.execute(sql`
        UPDATE contabilidad_config SET regimen_itbis = ${previo[0].regimenItbis} WHERE team_id = ${TEAM}
      `);
    }
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
