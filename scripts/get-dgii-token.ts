/**
 * Script utilitario: obtener token DGII para un team
 *
 * Uso básico (usa el ambiente configurado en BD):
 *   npx tsx scripts/get-dgii-token.ts
 *
 * Forzar ambiente sin tocar la BD:
 *   AMBIENTE=eCF      npx tsx scripts/get-dgii-token.ts
 *   AMBIENTE=TesteCF  npx tsx scripts/get-dgii-token.ts
 *   AMBIENTE=CerteCF  npx tsx scripts/get-dgii-token.ts
 *
 * Especificar otro team:
 *   TEAM_ID=3 AMBIENTE=eCF npx tsx scripts/get-dgii-token.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { db } from '../lib/db/drizzle';
import { teams } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { getDgiiAuth } from '../lib/dgii/auth';
import { DgiiSigner } from '../lib/dgii/signer';
import { decryptField, isEncrypted } from '../lib/crypto/cert';
import type { DgiiEnvironment } from '../lib/dgii/client';

async function main() {
  const teamId   = Number(process.env.TEAM_ID ?? 1);
  const ambienteOverride = process.env.AMBIENTE as DgiiEnvironment | undefined;

  // ── Cargar team ───────────────────────────────────────────────────────────
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    console.error(`❌ No existe un team con id=${teamId}`);
    process.exit(1);
  }

  const ambienteEfectivo: DgiiEnvironment =
    ambienteOverride ?? 'TesteCF';

  console.log(`\n🏢 Team    : ${team.name} (id=${team.id})`);
  console.log(`🌐 Ambiente: ${ambienteEfectivo}${ambienteOverride ? ' (override via AMBIENTE)' : ' (default TesteCF)'}`);

  if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
    console.error('\n❌ Este team no tiene certificado P12 configurado.');
    console.error('   Súbelo en el dashboard → Configuración → Certificado.');
    process.exit(1);
  }

  // ── Autenticar ────────────────────────────────────────────────────────────
  console.log('\n⏳ Autenticando contra la DGII...');

  let token: string;
  let expiresAt: Date;

  if (ambienteOverride && ambienteOverride !== 'TesteCF') {
    // Override de ambiente — autenticar directamente con el signer
    // sin pasar por getDgiiAuth (que usaría el ambiente de la BD)
    const p12Base64 = decryptField({
      ciphered: team.certP12Ciphered!,
      iv:       team.certP12Iv!,
      authTag:  team.certP12AuthTag!,
    });
    const pin = decryptField({
      ciphered: team.certPinCiphered!,
      iv:       team.certPinIv!,
      authTag:  team.certPinAuthTag!,
    });

    const signer = new DgiiSigner({
      p12Buffer:   Buffer.from(p12Base64, 'base64'),
      password:    pin,
      environment: ambienteOverride,
    });

    ({ token, expiresAt } = await signer.authenticate());
  } else {
    // Sin override — reutiliza token cacheado en BD si sigue vigente
    ({ token, expiresAt } = await getDgiiAuth(teamId));
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  const minutosRestantes = Math.floor((expiresAt.getTime() - Date.now()) / 60_000);
  const ambienteLower    = ambienteEfectivo.toLowerCase();

  console.log('\n✅ Token obtenido correctamente');
  console.log(`⏰ Expira : ${expiresAt.toISOString()} (en ~${minutosRestantes} minutos)\n`);
  console.log('─'.repeat(80));
  console.log(token);
  console.log('─'.repeat(80));

  console.log('\n📋 Curls listos para copiar:\n');

  console.log('# Directorio completo:');
  console.log(`curl -X GET \\`);
  console.log(`  'https://ecf.dgii.gov.do/${ambienteLower}/consultadirectorio/api/consultas/listado' \\`);
  console.log(`  -H 'accept: application/json' \\`);
  console.log(`  -H 'Authorization: Bearer ${token}'\n`);

  console.log('# Directorio por RNC (cambia el RNC):');
  console.log(`curl -X GET \\`);
  console.log(`  'https://ecf.dgii.gov.do/${ambienteLower}/consultadirectorio/api/consultas/obtenerdirectorioporrnc?RNC=131880681' \\`);
  console.log(`  -H 'accept: application/json' \\`);
  console.log(`  -H 'Authorization: Bearer ${token}'\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message ?? err);
  process.exit(1);
});
