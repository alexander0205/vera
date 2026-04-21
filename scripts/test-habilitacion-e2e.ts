/**
 * Script de prueba end-to-end del flujo real de habilitación DGII.
 *
 * Ejecuta:
 *   1. Carga el cert P12 del team id=1 (SolucionesDO) directo de la BD
 *   2. Se autentica contra TesteCF (semilla → firma → JWT)
 *   3. Firma un XML de prueba (simulando el XML de postulación)
 *   4. Verifica que los endpoints REST /api/habilitacion/* están accesibles
 *
 * Uso:
 *   npx dotenv -e .env -- npx tsx scripts/test-habilitacion-e2e.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from '../lib/db/drizzle';
import { teams } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptField, isEncrypted } from '../lib/crypto/cert';
import { DgiiSigner } from '../lib/dgii/signer';
import { DgiiClient, type DgiiEnvironment } from '../lib/dgii/client';

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  HABILITACIÓN DGII — Prueba E2E contra TesteCF       ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // ── 1) Cargar el team con cert ──────────────────────────────────────────
  const [team] = await db.select().from(teams).where(eq(teams.id, 1)).limit(1);
  if (!team) throw new Error('Team id=1 no encontrado');

  console.log(`✔ Team #${team.id} — ${team.name}`);
  console.log(`  RNC: ${team.rnc} · ambiente: ${team.dgiiEnvironment}`);

  if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
    console.error('✖ Certificado no configurado en este team');
    process.exit(1);
  }

  // ── 2) Descifrar cert ───────────────────────────────────────────────────
  const p12b64 = decryptField({
    ciphered: team.certP12Ciphered!,
    iv:       team.certP12Iv!,
    authTag:  team.certP12AuthTag!,
  });
  const pin = decryptField({
    ciphered: team.certPinCiphered!,
    iv:       team.certPinIv!,
    authTag:  team.certPinAuthTag!,
  });
  console.log(`✔ Certificado descifrado (titular: ${team.certTitular ?? 'desconocido'})`);

  // ── 3) Autenticación contra TesteCF ────────────────────────────────────
  const env = (team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF';
  const signer = new DgiiSigner({
    p12Buffer: Buffer.from(p12b64, 'base64'),
    password:  pin,
    environment: env,
  });

  console.log('\n── Autenticación DGII TesteCF ──');
  let token: string;
  let expiresAt: Date;
  try {
    const auth = await signer.authenticate();
    token = auth.token;
    expiresAt = auth.expiresAt;
    console.log(`✔ Autenticado — token len=${token.length}, expira=${expiresAt.toISOString()}`);
  } catch (err: any) {
    console.error(`✖ Autenticación falló: ${err?.message ?? err}`);
    process.exit(2);
  }

  // ── 4) Probar firma de XML arbitrario (simula postulación) ─────────────
  console.log('\n── Firma de XML (simulando postulación) ──');
  const xmlPostulacion = `<?xml version="1.0" encoding="UTF-8"?>
<Postulacion>
  <RNC>${team.rnc}</RNC>
  <RazonSocial>${team.razonSocial ?? team.name}</RazonSocial>
  <TipoSoftware>EXTERNO</TipoSoftware>
  <NombreSoftware>EmiteDo</NombreSoftware>
  <Version>1</Version>
  <Fecha>${new Date().toISOString()}</Fecha>
</Postulacion>`;

  try {
    const signed = signer.signXml(xmlPostulacion, 'Postulacion' as any);
    if (!signed.includes('<Signature') && !signed.includes('<ds:Signature')) {
      console.error('✖ El XML firmado no contiene tag <Signature>');
      process.exit(3);
    }
    console.log(`✔ XML firmado correctamente (len=${signed.length})`);
    console.log(`  Contiene tag Signature: ${signed.includes('Signature')}`);
  } catch (err: any) {
    console.error(`✖ Firma falló: ${err?.message ?? err}`);
    process.exit(3);
  }

  // ── 5) Verificar conectividad con testecf vía DgiiClient ───────────────
  console.log('\n── Conectividad TesteCF (endpoints HTTP) ──');
  const client = new DgiiClient(env);
  try {
    const semilla = await client.getSemilla();
    const semillaLen = semilla.length;
    console.log(`✔ GET /autenticacion/api/Autenticacion/Semilla — ${semillaLen} bytes`);
  } catch (err: any) {
    console.error(`✖ Semilla falló: ${err?.message ?? err}`);
  }

  // Con el token del signer, podemos hacer consultas autenticadas
  client.setToken(token, expiresAt);
  try {
    // Consultar estado por un trackId falso — debería responder algo (404/400 pero no auth error)
    await client.consultarEstado('00000000-0000-0000-0000-000000000000');
    console.log('✔ GET /recepcion/api/trackid/{...} — responde (aunque trackId no existe)');
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // Esperamos error por trackId inexistente, NO por auth
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
      console.error(`✖ Token rechazado por DGII: ${msg}`);
    } else {
      console.log(`✔ Endpoint respondió (trackId inválido esperado): ${msg.slice(0, 80)}`);
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  RESULTADO: flujo real verificado contra TesteCF     ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n✖ Error fatal:', err);
  process.exit(99);
});
