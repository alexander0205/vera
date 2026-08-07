/**
 * Prueba del motor de mora conectado a la DB (Paso 4 del handoff).
 * Crea una factura de prueba controlada en el team 2, corre los 6 escenarios
 * llamando al motor REAL (generarNotaDebitoMora), verifica montos y limpia todo.
 * SOLO contra la rama Neon de prueba.
 */
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); dotenv.config();
import { generarNotaDebitoMora } from '@/lib/cobranza/nota-debito-mora';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
const TEAM = 2;
const MONTO_FACTURA = 100000; // RD$1,000.00

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✅' : '❌'} ${label} → got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// Config del team: parte de un baseline conocido y aplica overrides.
async function setConfig(o: Partial<{
  modo: string; pct: number; montoCents: number; gracia: number;
  per: number; compuesta: boolean; tope: number; max: number;
}>) {
  await sql`UPDATE teams SET
    recargo_mora_activo = true,
    recargo_mora_modo = ${o.modo ?? 'porcentaje'},
    recargo_mora_porcentaje = ${o.pct ?? 0},
    recargo_mora_monto_cents = ${o.montoCents ?? 0},
    recargo_mora_dias_gracia = ${o.gracia ?? 0},
    recargo_mora_periodicidad_dias = ${o.per ?? 0},
    recargo_mora_compuesta = ${o.compuesta ?? false},
    recargo_mora_tope_bps = ${o.tope ?? 0},
    recargo_mora_max_periodos = ${o.max ?? 0}
   WHERE id = ${TEAM}`;
}
async function setLimite(diasAtras: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - diasAtras);
  const iso = d.toISOString().slice(0, 10);
  await sql`UPDATE ecf_documents SET fecha_limite_pago = ${iso} WHERE id = ${facturaId}`;
  return iso;
}
async function clearMoras() {
  const notas = await sql`SELECT id FROM ecf_documents WHERE mora_origen_id = ${facturaId}`;
  for (const n of notas) await sql`DELETE FROM pagos_recibidos WHERE ecf_document_id = ${n.id}`;
  await sql`DELETE FROM ecf_documents WHERE mora_origen_id = ${facturaId}`;
}
async function moras() {
  return sql`SELECT id, monto_total, mora_periodo,
    coalesce((SELECT SUM(monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = ecf_documents.id),0) AS pagado
    FROM ecf_documents WHERE mora_origen_id = ${facturaId} ORDER BY id`;
}

let facturaId: number;
let saved: any;

(async () => {
  console.log(`→ Base: ${new URL(process.env.POSTGRES_URL!).host}\n`);

  // Guardar config actual del team 2 para restaurarla al final.
  [saved] = await sql`SELECT recargo_mora_activo, recargo_mora_modo, recargo_mora_porcentaje,
    recargo_mora_monto_cents, recargo_mora_dias_gracia, recargo_mora_periodicidad_dias,
    recargo_mora_compuesta, recargo_mora_tope_bps, recargo_mora_max_periodos
    FROM teams WHERE id = ${TEAM}`;

  // Crear factura de prueba (crédito, se vencerá según cada escenario).
  const encf = `TESTMORA-${Date.now().toString(36).toUpperCase()}`;
  const [f] = await sql`INSERT INTO ecf_documents
    (team_id, encf, tipo_ecf, estado, monto_total, total_itbis, tipo_pago,
     razon_social_comprador, rnc_comprador, fecha_emision)
    VALUES (${TEAM}, ${encf}, '31', 'EMITIDO', ${MONTO_FACTURA}, 0, 2,
     'CLIENTE PRUEBA MORA', '00000000000', NOW())
    RETURNING id`;
  facturaId = f.id;
  console.log(`Factura de prueba id=${facturaId} monto=RD$${MONTO_FACTURA / 100}\n`);

  try {
    // ── T1: primer cargo (porcentaje simple) ────────────────────────────────
    await clearMoras();
    await setConfig({ modo: 'porcentaje', pct: 1000, per: 0 }); // 10%, una vez
    const limiteT1 = await setLimite(40);
    const r1 = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    check('T1 aplica+monto (10% de 1000 = 100)', r1.ok && r1.montoCentavos, 10000);
    const m1 = await moras();
    check('T1 mora_periodo = fecha límite', m1[0]?.mora_periodo?.toISOString?.().slice(0,10) ?? String(m1[0]?.mora_periodo), limiteT1);

    // ── T2: correr de nuevo el mismo día → no duplica ────────────────────────
    const r2 = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    check('T2 no duplica (reason ya_existe)', !r2.ok && r2.reason, 'ya_existe');
    check('T2 sigue habiendo 1 sola nota', (await moras()).length, 1);

    // ── T3: cobro mensual + base compuesta → capitaliza ──────────────────────
    await clearMoras();
    await setConfig({ modo: 'porcentaje', pct: 1000, per: 30, compuesta: true });
    await setLimite(40); // devengados = floor(40/30)+1 = 2
    const r3a = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    check('T3 período 1 = 100 (base 1000)', r3a.ok && r3a.montoCentavos, 10000);
    const r3b = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    check('T3 período 2 CAPITALIZA = 110 (base 1000+100)', r3b.ok && r3b.montoCentavos, 11000);
    const r3c = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    check('T3 período 3 aún no toca', !r3c.ok && r3c.reason, 'ya_existe');

    // ── T4: pagar la primera mora → el siguiente cargo NO la capitaliza ──────
    // Fecha límite FIJA 70 días atrás → 3 períodos devengados, claves distintas.
    await clearMoras();
    await setConfig({ modo: 'porcentaje', pct: 1000, per: 30, compuesta: true });
    await setLimite(70); // devengados = floor(70/30)+1 = 3
    const t4a = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p1 = 100
    const t4b = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p2 = 110 (capitaliza p1)
    check('T4 p1 = 100', t4a.ok && t4a.montoCentavos, 10000);
    check('T4 p2 capitaliza = 110', t4b.ok && t4b.montoCentavos, 11000);
    const notasT4 = await moras(); // [p1=10000, p2=11000]
    await sql`INSERT INTO pagos_recibidos (team_id, ecf_document_id, monto_centavos, metodo, fecha_pago)
      VALUES (${TEAM}, ${notasT4[0].id}, ${notasT4[0].monto_total}, 'efectivo', NOW())`;
    const r4 = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p3
    // moraImpaga = solo p2 (11000), p1 pagada → base 1000+110 = 1110 → 10% = 111
    check('T4 p3 excluye la mora pagada = 111', r4.ok && r4.montoCentavos, 11100);

    // ── T5: tope → recorta el último cargo y luego deja de cobrar ────────────
    // Fecha límite FIJA 100 días atrás → 4 períodos devengados, claves distintas.
    await clearMoras();
    await setConfig({ modo: 'porcentaje', pct: 1000, per: 30, compuesta: false, tope: 2500 });
    await setLimite(100); // devengados = floor(100/30)+1 = 4. tope = 25% de 1000 = 250.
    const t5a = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p1 acum0 → 100
    const t5b = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p2 acum100 → 100
    const t5c = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p3 acum200 margen50 → RECORTA
    const t5d = await generarNotaDebitoMora(facturaId, { origen: 'cron' }); // p4 acum250 margen0 → para
    check('T5 p1 = 100', t5a.ok && t5a.montoCentavos, 10000);
    check('T5 p2 = 100', t5b.ok && t5b.montoCentavos, 10000);
    check('T5 p3 RECORTADO al tope = 50', t5c.ok && t5c.montoCentavos, 5000);
    check('T5 p4 tope_alcanzado (deja de cobrar)', !t5d.ok && t5d.reason, 'tope_alcanzado');

    // ── T6: modo fijo → ignora el saldo ──────────────────────────────────────
    await clearMoras();
    await setConfig({ modo: 'fijo', montoCents: 50000, per: 0 }); // RD$500 fijo
    await setLimite(40);
    const r6 = await generarNotaDebitoMora(facturaId, { origen: 'cron' });
    check('T6 modo fijo = 500 (ignora el saldo)', r6.ok && r6.montoCentavos, 50000);

  } catch (e) {
    console.error('\n💥 ERROR en un escenario:', e);
    fail++;
  } finally {
    // ── Limpieza total ───────────────────────────────────────────────────────
    await clearMoras();
    await sql`DELETE FROM ecf_documents WHERE id = ${facturaId}`;
    await sql`UPDATE teams SET
      recargo_mora_activo = ${saved.recargo_mora_activo},
      recargo_mora_modo = ${saved.recargo_mora_modo},
      recargo_mora_porcentaje = ${saved.recargo_mora_porcentaje},
      recargo_mora_monto_cents = ${saved.recargo_mora_monto_cents},
      recargo_mora_dias_gracia = ${saved.recargo_mora_dias_gracia},
      recargo_mora_periodicidad_dias = ${saved.recargo_mora_periodicidad_dias},
      recargo_mora_compuesta = ${saved.recargo_mora_compuesta},
      recargo_mora_tope_bps = ${saved.recargo_mora_tope_bps},
      recargo_mora_max_periodos = ${saved.recargo_mora_max_periodos}
     WHERE id = ${TEAM}`;
    console.log(`\n🧹 Limpieza hecha (factura ${facturaId} borrada, config del team 2 restaurada).`);
    console.log(`\n===== RESULTADO: ${pass} PASS / ${fail} FAIL =====`);
    await sql.end();
    process.exit(fail > 0 ? 1 : 0);
  }
})();
