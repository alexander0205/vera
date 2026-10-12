/**
 * Siembra escenarios de cartera para probar cuentas por cobrar.
 *
 * Uso:
 *   npx tsx scripts/seed-cartera-escenarios.ts <teamId>            → siembra
 *   npx tsx scripts/seed-cartera-escenarios.ts <teamId> --limpiar  → solo borra
 *
 * Todo lo creado lleva el prefijo SEEDCXC en `encf` y `codigo`, así que es
 * identificable y borrable sin tocar datos reales. Sembrar es idempotente:
 * limpia lo suyo antes de volver a insertar.
 *
 * Cubre: al día, vence hoy, vencidas a varios plazos, sin fecha, pago parcial,
 * ND de mora (activa / anulada / ya cobrada), factura saldada que solo arrastra
 * mora, las 5 variantes de nota de crédito, y documentos excluidos de cartera.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

const PREFIJO = 'SEEDCXC';

async function limpiar(teamId: number) {
  // Orden importa: todo lo que referencia ecf_documents por FK debe irse antes,
  // o el DELETE final falla. cobranza_* se agregó en la migración 0082.
  const docsSeed = sql`
    SELECT id FROM ecf_documents
    WHERE team_id = ${teamId} AND (encf LIKE ${PREFIJO + '%'} OR codigo LIKE ${PREFIJO + '%'})
  `;
  await db.execute(sql`DELETE FROM cobranza_eventos      WHERE ecf_document_id IN (${docsSeed})`);
  await db.execute(sql`DELETE FROM cobranza_seguimiento  WHERE ecf_document_id IN (${docsSeed})`);
  await db.execute(sql`DELETE FROM pagos_recibidos       WHERE ecf_document_id IN (${docsSeed})`);
  const borrados = await db.execute(sql`
    DELETE FROM ecf_documents
    WHERE team_id = ${teamId} AND (encf LIKE ${PREFIJO + '%'} OR codigo LIKE ${PREFIJO + '%'})
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return borrados.length;
}

(async () => {
  const host = (process.env.POSTGRES_URL ?? '').match(/@([^/]+)/)?.[1] ?? '???';
  const teamId = Number(process.argv[2]);
  const soloLimpiar = process.argv.includes('--limpiar');

  if (!Number.isFinite(teamId)) {
    console.error('Falta el teamId.  Uso: npx tsx scripts/seed-cartera-escenarios.ts <teamId> [--limpiar]');
    process.exit(1);
  }

  const [t] = await db.execute(sql`SELECT id, razon_social FROM teams WHERE id = ${teamId}`) as unknown as Array<{ id: number; razon_social: string | null }>;
  if (!t) { console.error(`El team ${teamId} no existe.`); process.exit(1); }

  console.log(`\n🔌 ${host}`);
  console.log(`📌 team ${teamId} — ${t.razon_social ?? '(sin nombre)'}\n`);

  const n = await limpiar(teamId);
  console.log(`Limpieza: ${n} documentos con prefijo ${PREFIJO} borrados`);
  if (soloLimpiar) { console.log('\n✔ Solo limpieza. Nada sembrado.\n'); process.exit(0); }

  const hoy = (await db.execute(sql`SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS d`) as unknown as Array<{ d: string }>)[0].d;

  async function doc(o: {
    slug: string; tipoEcf?: string; estado?: string; estadoPago?: string;
    monto: number; diasVence?: number | null; cliente?: string; rnc?: string; email?: string;
    moraOrigenId?: number; ncfModificado?: string; origenDocumentoId?: number;
    codigoModificacion?: number; creditoGeneradoCents?: number;
  }): Promise<number> {
    const encf = `${PREFIJO}-${o.slug}`;
    // El parámetro de días necesita ::int explícito — sin él pg falla con
    // "operator is not unique: date + unknown".
    const fechaLimite = o.diasVence === null || o.diasVence === undefined
      ? null
      : sql`to_char((now() AT TIME ZONE 'America/Santo_Domingo')::date + ${o.diasVence}::int, 'YYYY-MM-DD')`;
    const r = await db.execute(sql`
      INSERT INTO ecf_documents (
        team_id, encf, codigo, tipo_ecf, estado, estado_pago,
        monto_total, total_itbis, fecha_emision, fecha_limite_pago,
        razon_social_comprador, rnc_comprador, email_comprador, tipo_pago,
        mora_origen_id, ncf_modificado, origen_documento_id,
        codigo_modificacion, credito_generado_cents
      ) VALUES (
        ${teamId}, ${encf}, ${encf}, ${o.tipoEcf ?? '31'},
        ${o.estado ?? 'ACEPTADO'}, ${o.estadoPago ?? 'PENDIENTE'},
        ${o.monto}, 0, now() - interval '60 days', ${fechaLimite ?? null},
        ${o.cliente ?? '[PRUEBA] Cliente Cartera'}, ${o.rnc ?? '131000000'},
        -- .invalid es un TLD reservado por IANA: nunca resuelve, así que probar
        -- recordatorios con estos datos no puede alcanzar a nadie real.
        ${o.email ?? null}, 2,
        ${o.moraOrigenId ?? null}, ${o.ncfModificado ?? null}, ${o.origenDocumentoId ?? null},
        ${o.codigoModificacion ?? null}, ${o.creditoGeneradoCents ?? null}
      ) RETURNING id
    `) as unknown as Array<{ id: number }>;
    return r[0].id;
  }

  async function pago(docId: number, cents: number) {
    await db.execute(sql`
      INSERT INTO pagos_recibidos (team_id, ecf_document_id, monto_centavos, metodo, fecha_pago)
      VALUES (${teamId}, ${docId}, ${cents}, 'efectivo', ${hoy}::date)
    `);
  }

  // ── Vencimientos, para cubrir todas las cubetas de antigüedad ────────────
  await doc({ slug: 'ALDIA',    monto: 100_00, diasVence: 10 });
  await doc({ slug: 'HOY',      monto: 200_00, diasVence: 0 });
  await doc({ slug: 'VENC1',    monto: 300_00, diasVence: -1 });    // cubeta 1-30
  await doc({ slug: 'VENC45',   monto: 400_00, diasVence: -45, email: 'cartera1@ejemplo.invalid' });   // cubeta 31-60
  await doc({ slug: 'VENC75',   monto: 450_00, diasVence: -75 });   // cubeta 61-90
  await doc({ slug: 'VENC100',  monto: 500_00, diasVence: -100, email: 'cartera2@ejemplo.invalid' });  // cubeta 90+
  await doc({ slug: 'SINFECHA', monto: 600_00, diasVence: null });

  // ── Pago parcial ─────────────────────────────────────────────────────────
  const parcial = await doc({ slug: 'PARCIAL', monto: 1000_00, estadoPago: 'PARCIAL', diasVence: -5 });
  await pago(parcial, 400_00);

  // ── Mora ─────────────────────────────────────────────────────────────────
  // OJO: ecf_documents_mora_activa_unica_idx permite UNA sola ND de mora
  // no-anulada por factura padre. Las ANULADAS sí pueden convivir.
  const conMora = await doc({ slug: 'CONMORA', monto: 1000_00, diasVence: -30 });
  await doc({ slug: 'NDMORA1',    tipoEcf: '33', monto: 50_00,  diasVence: -30, moraOrigenId: conMora });
  await doc({ slug: 'NDMORAANUL', tipoEcf: '33', monto: 999_00, estado: 'ANULADO', diasVence: -30, moraOrigenId: conMora });

  const moraPagada = await doc({ slug: 'MORAPAGADA', monto: 800_00, diasVence: -25 });
  const ndPagada = await doc({ slug: 'NDMORAPAG', tipoEcf: '33', monto: 20_00, estadoPago: 'PAGADA', diasVence: -25, moraOrigenId: moraPagada });
  await pago(ndPagada, 20_00);

  // Factura saldada que sigue en cartera solo por su mora
  const saldada = await doc({ slug: 'SALDADAMORA', monto: 500_00, estadoPago: 'PARCIAL', diasVence: -20 });
  await pago(saldada, 500_00);
  await doc({ slug: 'NDSALDADA', tipoEcf: '33', monto: 75_00, diasVence: -20, moraOrigenId: saldada });

  // ── Notas de crédito: las 5 variantes ────────────────────────────────────
  const ncId = await doc({ slug: 'CONNCID', monto: 1000_00, diasVence: -10 });
  await doc({ slug: 'NCPORID', tipoEcf: '34', monto: 300_00, origenDocumentoId: ncId, codigoModificacion: 3 });

  // Por ncf_modificado: el padre necesita un e-NCF real (empieza con E)
  const ncEncf = await doc({ slug: 'CONNCENCF', monto: 1000_00, diasVence: -10 });
  await db.execute(sql`UPDATE ecf_documents SET encf = 'E310000099001' WHERE id = ${ncEncf}`);
  await doc({ slug: 'NCPORENCF', tipoEcf: '34', monto: 250_00, ncfModificado: 'E310000099001', codigoModificacion: 3 });

  const ncCod2 = await doc({ slug: 'CONNCCOD2', monto: 1000_00, diasVence: -10 });
  await doc({ slug: 'NCCOD2', tipoEcf: '34', monto: 900_00, origenDocumentoId: ncCod2, codigoModificacion: 2 });

  const ncAnul = await doc({ slug: 'CONNCANUL', monto: 1000_00, diasVence: -10 });
  await doc({ slug: 'NCANUL', tipoEcf: '34', monto: 900_00, estado: 'ANULADO', origenDocumentoId: ncAnul, codigoModificacion: 3 });

  const ncNuevo = await doc({ slug: 'CONNCNUEVO', monto: 1000_00, diasVence: -10 });
  await doc({ slug: 'NCNUEVO', tipoEcf: '34', monto: 900_00, origenDocumentoId: ncNuevo, codigoModificacion: 3, creditoGeneradoCents: 900_00 });

  const ncExceso = await doc({ slug: 'CONNCEXCESO', monto: 500_00, diasVence: -10 });
  await doc({ slug: 'NCEXCESO', tipoEcf: '34', monto: 800_00, origenDocumentoId: ncExceso, codigoModificacion: 3 });

  // ── Excluidos de cartera ─────────────────────────────────────────────────
  await doc({ slug: 'ANULADA',   monto: 700_00, estado: 'ANULADO',   diasVence: -10 });
  await doc({ slug: 'RECHAZADA', monto: 700_00, estado: 'RECHAZADO', diasVence: -10 });
  const pagada = await doc({ slug: 'PAGADA', monto: 700_00, estadoPago: 'PAGADA', diasVence: -10 });
  await pago(pagada, 700_00);

  // ── Segundo cliente, para búsqueda y agrupación ──────────────────────────
  await doc({ slug: 'OTROCLI', monto: 850_00, diasVence: -7, cliente: '[PRUEBA] Ferreteria Zuleta SRL', rnc: '401555777', email: 'zuleta@ejemplo.invalid' });

  const total = await db.execute(sql`
    SELECT COUNT(*) AS n FROM ecf_documents
    WHERE team_id = ${teamId} AND (encf LIKE ${PREFIJO + '%'} OR codigo LIKE ${PREFIJO + '%'})
  `) as unknown as Array<{ n: string }>;

  console.log(`✅ Sembrados. Documentos con prefijo ${PREFIJO}: ${total[0].n}`);
  console.log(`\nPara borrarlos:  npx tsx scripts/seed-cartera-escenarios.ts ${teamId} --limpiar\n`);
  process.exit(0);
})().catch(e => { console.error('\n❌ FALLÓ:', e); process.exit(1); });
