/**
 * Verifica los 3 fixes aplicados:
 *   - Tipo 32g (≥250k): FechaVencimientoSecuencia eliminada (IDDOC_CONFIG fv=false)
 *   - Tipo 41:  tarifa forzada a 0.18 → MontoGravadoI1 coherente con IndicadorFacturacion=1
 *   - Tipo 47:  IndicadorBienoServicio forzado a 2 (Servicio)
 *
 * Uso:
 *   npx tsx scripts/test-fix-32-41-47.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { db } from '../lib/db/drizzle';
import { teams } from '../lib/db/schema';
import { TEST_CONTRIBUYENTE } from '../lib/config/test-data';
import { eq } from 'drizzle-orm';
import { decryptField, isEncrypted } from '../lib/crypto/cert';
import { DgiiSigner } from '../lib/dgii/signer';
import { DgiiClient, type DgiiEnvironment, type EstadoDgii } from '../lib/dgii/client';
import { buildEcfXml, type EcfData } from '../lib/dgii/xml-builder';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(): string {
  return String(Math.floor(1 + Math.random() * 9_999_999)).padStart(10, '0');
}

async function poll(
  client: DgiiClient,
  trackId: string,
  label: string,
  maxIntentos = 20,
  intervaloMs = 4000,
): Promise<{ estado: EstadoDgii; mensajes: string }> {
  for (let i = 1; i <= maxIntentos; i++) {
    await new Promise(r => setTimeout(r, intervaloMs));
    try {
      const resp = await client.consultarEstado(trackId);
      const estado = resp.estado as EstadoDgii;
      const msg = (resp.mensajes ?? []).map((m: { codigo?: string; descripcion?: string; valor?: string }) => m.descripcion ?? m.valor ?? '').join(' | ');
      console.log(`   [${label}] intento ${i} → ${estado} ${msg ? `(${msg})` : ''}`);
      if (estado !== 'En Proceso') return { estado, mensajes: msg };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`   [${label}] intento ${i} → error: ${msg}`);
    }
  }
  return { estado: 'En Proceso', mensajes: 'timeout' };
}

// ─── Datos de prueba por tipo ─────────────────────────────────────────────────

function datos32g(rnc: string, razonSocial: string): EcfData {
  const hoy = new Date();
  return {
    tipoEcf: '32',
    encf: `E32${rand()}`,
    rncEmisor: rnc,
    razonSocialEmisor: razonSocial,
    direccionEmisor: 'C/ Prueba #1, Santo Domingo, RD',
    fechaEmision: hoy,
    fechaVencimientoSecuencia: new Date(hoy.getFullYear(), 11, 31),
    tipoPago: 1,
    items: [{
      numeroLinea: 1,
      nombreItem: 'Producto Test 32g ≥250k',
      indicadorBienoServicio: 1, // bien
      cantidadItem: 1,
      precioUnitarioItem: 260000,
      montoItem: 260000,
      tasaItbis: 0.16,
    }],
    montoGravadoTotal: 260000,
    montoGravadoI2: 260000,
    itbis2: 41600,
    totalItbis: 41600,
    montoTotal: 301600,
  };
}

function datos41(rnc: string, razonSocial: string): EcfData {
  const hoy = new Date();
  return {
    tipoEcf: '41',
    encf: `E41${rand()}`,
    rncEmisor: rnc,
    razonSocialEmisor: razonSocial,
    direccionEmisor: 'C/ Prueba #1, Santo Domingo, RD',
    fechaEmision: hoy,
    fechaVencimientoSecuencia: new Date(hoy.getFullYear(), 11, 31),
    rncComprador: TEST_CONTRIBUYENTE.rnc,
    razonSocialComprador: TEST_CONTRIBUYENTE.razonSocial,
    tipoPago: 1,
    items: [{
      numeroLinea: 1,
      nombreItem: 'Servicio Test 41 Compras',
      indicadorBienoServicio: 2, // servicio
      cantidadItem: 1,
      precioUnitarioItem: 232,
      montoItem: 232,
      tasaItbis: 0.18, // ← forzado a 18% (el fix)
    }],
    montoGravadoTotal: 232,
    montoGravadoI1: 232,   // ← ahora va a I1, no I2
    itbis1: 41.76,
    totalItbis: 41.76,
    montoTotal: 273.76,
  };
}

function datos47(rnc: string, razonSocial: string): EcfData {
  const hoy = new Date();
  return {
    tipoEcf: '47',
    encf: `E47${rand()}`,
    rncEmisor: rnc,
    razonSocialEmisor: razonSocial,
    direccionEmisor: 'C/ Prueba #1, Santo Domingo, RD',
    fechaEmision: hoy,
    fechaVencimientoSecuencia: new Date(hoy.getFullYear(), 11, 31),
    tipoPago: 1,
    compradorExtranjero: { nombre: 'Comprador Exterior', identificacion: 'EXT00000001' },
    items: [{
      numeroLinea: 1,
      nombreItem: 'Servicio al Exterior Test 47',
      indicadorBienoServicio: 2, // ← forzado a servicio (el fix)
      cantidadItem: 1,
      precioUnitarioItem: 269.12,
      montoItem: 269.12,
      tasaItbis: 0,
    }],
    montoGravadoTotal: 0,
    montoExento: 269.12,
    totalItbis: 0,
    montoTotal: 269.12,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   TEST: fixes tipo 32g · 41 · 47 — contra TesteCF             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const [team] = await db.select().from(teams).where(eq(teams.id, 1)).limit(1);
  if (!team) { console.error('Team id=1 no encontrado'); process.exit(1); }

  console.log(`✔ Team: ${team.name} | RNC: ${team.rnc}`);

  if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
    console.error('✖ Certificado no configurado'); process.exit(1);
  }

  const p12b64 = decryptField({ ciphered: team.certP12Ciphered!, iv: team.certP12Iv!, authTag: team.certP12AuthTag! });
  const pin    = decryptField({ ciphered: team.certPinCiphered!, iv: team.certPinIv!, authTag: team.certPinAuthTag! });

  const env: DgiiEnvironment = 'TesteCF';
  const signer = new DgiiSigner({ p12Buffer: Buffer.from(p12b64, 'base64'), password: pin, environment: env });

  console.log('\n── Autenticando contra TesteCF...');
  const { token, expiresAt } = await signer.authenticate();
  console.log(`✔ Token obtenido — expira: ${expiresAt.toISOString()}`);
  const client = new DgiiClient(env);
  client.setToken(token, expiresAt);

  const rnc          = team.rnc!;
  const razonSocial  = team.razonSocial ?? team.name;
  const resultados: Record<string, string> = {};

  // ── Tipo 32g ──────────────────────────────────────────────────────────────
  console.log('\n══ TIPO 32g (≥250k) — fix: sin FechaVencimientoSecuencia ══');
  try {
    const xml32 = buildEcfXml(datos32g(rnc, razonSocial));

    // Verificar que FechaVencimientoSecuencia NO está en el XML
    if (xml32.includes('FechaVencimientoSecuencia')) {
      console.error('✖ El XML aún contiene FechaVencimientoSecuencia — fix no aplicado!');
      resultados['32g'] = 'ERROR_BUILD';
    } else {
      console.log('✔ XML no contiene FechaVencimientoSecuencia ✓');
      const firmado32 = signer.signXml(xml32, 'ECF');
      console.log('✔ XML firmado');
      const { trackId } = await client.enviarEcf(firmado32, rnc, datos32g(rnc, razonSocial).encf);
      console.log(`✔ Enviado — trackId: ${trackId}`);
      const { estado, mensajes } = await poll(client, trackId, '32g');
      resultados['32g'] = estado;
      if (mensajes) console.log(`   Mensajes DGII: ${mensajes}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✖ Error: ${msg}`);
    resultados['32g'] = `ERROR: ${msg}`;
  }

  // ── Tipo 41 ───────────────────────────────────────────────────────────────
  console.log('\n══ TIPO 41 (Compras) — fix: tarifa 18%, MontoGravadoI1 ══');
  try {
    const xml41 = buildEcfXml(datos41(rnc, razonSocial));

    // Verificar que usa MontoGravadoI1 no I2
    if (!xml41.includes('MontoGravadoI1')) {
      console.error('✖ XML no contiene MontoGravadoI1 — fix no aplicado!');
      resultados['41'] = 'ERROR_BUILD';
    } else if (xml41.includes('MontoGravadoI2') && !xml41.includes('MontoGravadoI1')) {
      console.error('✖ XML usa MontoGravadoI2 en lugar de I1!');
      resultados['41'] = 'ERROR_BUILD';
    } else {
      console.log('✔ XML contiene MontoGravadoI1 ✓ (ITBIS al 18%)');
      const firmado41 = signer.signXml(xml41, 'ECF');
      console.log('✔ XML firmado');
      const { trackId } = await client.enviarEcf(firmado41, rnc, datos41(rnc, razonSocial).encf);
      console.log(`✔ Enviado — trackId: ${trackId}`);
      const { estado, mensajes } = await poll(client, trackId, '41');
      resultados['41'] = estado;
      if (mensajes) console.log(`   Mensajes DGII: ${mensajes}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✖ Error: ${msg}`);
    resultados['41'] = `ERROR: ${msg}`;
  }

  // ── Tipo 47 ───────────────────────────────────────────────────────────────
  console.log('\n══ TIPO 47 (Pagos Exterior) — fix: IndicadorBienoServicio=2 ══');
  try {
    const xml47 = buildEcfXml(datos47(rnc, razonSocial));

    // Verificar IndicadorBienoServicio=2
    if (!xml47.includes('<IndicadorBienoServicio>2</IndicadorBienoServicio>')) {
      console.error('✖ XML no contiene IndicadorBienoServicio=2 — fix no aplicado!');
      resultados['47'] = 'ERROR_BUILD';
    } else {
      console.log('✔ XML contiene IndicadorBienoServicio=2 ✓');
      const firmado47 = signer.signXml(xml47, 'ECF');
      console.log('✔ XML firmado');
      const { trackId } = await client.enviarEcf(firmado47, rnc, datos47(rnc, razonSocial).encf);
      console.log(`✔ Enviado — trackId: ${trackId}`);
      const { estado, mensajes } = await poll(client, trackId, '47');
      resultados['47'] = estado;
      if (mensajes) console.log(`   Mensajes DGII: ${mensajes}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✖ Error: ${msg}`);
    resultados['47'] = `ERROR: ${msg}`;
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RESUMEN                                                       ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  for (const [tipo, estado] of Object.entries(resultados)) {
    const ok = estado === 'Aceptado' || estado === 'AceptadoCondicional';
    console.log(`║  Tipo ${tipo.padEnd(4)} → ${ok ? '✅' : '❌'} ${estado.padEnd(40)}║`);
  }
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const todosOk = Object.values(resultados).every(e => e === 'Aceptado' || e === 'AceptadoCondicional');
  process.exit(todosOk ? 0 : 1);
}

main().catch(err => {
  console.error('\n✖ Error fatal:', err);
  process.exit(99);
});
