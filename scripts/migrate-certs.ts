/**
 * Script one-time: cifra los certP12 / certPassword / dgiiToken existentes
 * en la tabla `teams` y escribe los valores cifrados en las nuevas columnas.
 *
 * Requisitos:
 *   1. CERT_MASTER_KEY configurada en .env
 *   2. Migración 0009_security.sql ya aplicada
 *
 * Ejecución:
 *   npx dotenv -e .env -- npx tsx scripts/migrate-certs.ts
 *
 * El script es idempotente: si ya está cifrado (cert_p12_ciphered != NULL)
 * lo omite. Seguro de ejecutar múltiples veces.
 *
 * Después de verificar que todo funciona, puedes crear una migración 0010
 * que haga DROP COLUMN cert_p12, cert_password, dgii_token.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { encryptField } from '../lib/crypto/cert';
import { P12Reader } from 'dgii-ecf';

// ─── Helpers de lectura del cert ──────────────────────────────────────────────

function parseCN(subject: string): string {
  const parts = subject.split(',');
  const cn    = parts.find(p => p.trim().startsWith('CN='));
  return cn ? cn.replace('CN=', '').trim() : subject;
}

function extractCertMetadata(certP12: string, certPassword: string) {
  try {
    const reader = new P12Reader(certPassword);
    const info   = reader.getCertificateInfoFromBase64(certP12);
    return {
      titular:     parseCN(info.subject),
      serial:      info.serialNumber,
      vencimiento: info.validTo instanceof Date ? info.validTo : new Date(String(info.validTo)),
    };
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL no configurada');

  if (!process.env.CERT_MASTER_KEY || process.env.CERT_MASTER_KEY.length !== 64) {
    throw new Error('CERT_MASTER_KEY no configurada o inválida (debe ser 64 chars hex)');
  }

  const sql = postgres(url, { max: 1 });
  console.log('🔐 Iniciando migración de certificados a cifrado AES-256-GCM…\n');

  // Obtener todos los teams con certP12 plain text y sin certP12Ciphered
  const rows = await sql<{
    id: number;
    name: string;
    cert_p12: string | null;
    cert_password: string | null;
    dgii_token: string | null;
    cert_p12_ciphered: string | null;
  }[]>`
    SELECT id, name, cert_p12, cert_password, dgii_token, cert_p12_ciphered
    FROM teams
    WHERE cert_p12 IS NOT NULL
      AND cert_p12_ciphered IS NULL
  `;

  console.log(`📋 Encontrados ${rows.length} teams con certP12 en texto plano.\n`);

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const row of rows) {
    try {
      const updates: Record<string, unknown> = {};

      // ── Cifrar P12 ──────────────────────────────────────────────────────
      if (row.cert_p12) {
        const p12Enc = encryptField(row.cert_p12);
        updates.cert_p12_ciphered = p12Enc.ciphered;
        updates.cert_p12_iv       = p12Enc.iv;
        updates.cert_p12_auth_tag = p12Enc.authTag;

        // Extraer metadatos
        const meta = extractCertMetadata(row.cert_p12, row.cert_password ?? '');
        if (meta) {
          updates.cert_titular     = meta.titular;
          updates.cert_serial      = meta.serial;
          updates.cert_vencimiento = meta.vencimiento;
        }

        // Borrar plain text
        updates.cert_p12 = null;
      }

      // ── Cifrar PIN ──────────────────────────────────────────────────────
      if (row.cert_password) {
        const pinEnc = encryptField(row.cert_password);
        updates.cert_pin_ciphered = pinEnc.ciphered;
        updates.cert_pin_iv       = pinEnc.iv;
        updates.cert_pin_auth_tag = pinEnc.authTag;
        // Borrar plain text
        updates.cert_password = null;
      }

      // ── Cifrar token DGII (si existe) ───────────────────────────────────
      if (row.dgii_token) {
        const tokenEnc = encryptField(row.dgii_token);
        updates.dgii_token_ciphered = tokenEnc.ciphered;
        updates.dgii_token_iv       = tokenEnc.iv;
        updates.dgii_token_auth_tag = tokenEnc.authTag;
        updates.dgii_token = null;
      }

      if (Object.keys(updates).length === 0) {
        skipped++;
        continue;
      }

      // Update con columnas explícitas (más seguro que sql.unsafe dinámico)
      await sql`
        UPDATE teams SET
          cert_p12_ciphered  = ${(updates.cert_p12_ciphered  as string)  ?? null},
          cert_p12_iv        = ${(updates.cert_p12_iv        as string)  ?? null},
          cert_p12_auth_tag  = ${(updates.cert_p12_auth_tag  as string)  ?? null},
          cert_pin_ciphered  = ${(updates.cert_pin_ciphered  as string)  ?? null},
          cert_pin_iv        = ${(updates.cert_pin_iv        as string)  ?? null},
          cert_pin_auth_tag  = ${(updates.cert_pin_auth_tag  as string)  ?? null},
          cert_titular       = ${(updates.cert_titular       as string)  ?? null},
          cert_serial        = ${(updates.cert_serial        as string)  ?? null},
          cert_vencimiento   = ${(updates.cert_vencimiento   as Date)    ?? null},
          dgii_token_ciphered = ${(updates.dgii_token_ciphered as string) ?? null},
          dgii_token_iv       = ${(updates.dgii_token_iv       as string) ?? null},
          dgii_token_auth_tag = ${(updates.dgii_token_auth_tag as string) ?? null},
          cert_p12           = NULL,
          cert_password      = NULL,
          dgii_token         = NULL,
          updated_at         = NOW()
        WHERE id = ${row.id}
      `;

      console.log(`  ✅ Team #${row.id} (${row.name}) migrado.`);
      migrated++;
    } catch (err) {
      console.error(`  ❌ Team #${row.id} (${row.name}) falló:`, err);
      errors++;
    }
  }

  console.log(`
────────────────────────────────────────
✅ Migrados:  ${migrated}
⏭️  Omitidos:  ${skipped}
❌ Errores:   ${errors}
────────────────────────────────────────
`);

  if (errors > 0) {
    console.warn('⚠️  Algunos teams fallaron. Revisa los errores y vuelve a ejecutar.');
    process.exit(1);
  }

  console.log('🎉 Migración completada. Los certificados ahora están cifrados con AES-256-GCM.');
  console.log('   Cuando todo esté verificado, crea una migración 0010 para hacer DROP de las columnas legacy.\n');
  await sql.end();
}

main().catch((err) => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
