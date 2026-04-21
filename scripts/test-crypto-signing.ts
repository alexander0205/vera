/**
 * Test integral: cifrado + firma digital
 *
 * Ejercita TODA la pipeline sin necesitar el servidor HTTP ni cookies de auth:
 *   1. Roundtrip AES-256-GCM (encrypt → decrypt)
 *   2. Lectura del cert cifrado desde la BD
 *   3. Carga del P12 con DgiiSigner
 *   4. Firma de un XML de prueba (DGII TesteCF)
 *   5. Extracción del código de seguridad (6 chars)
 *   6. Verificación de que audit_logs acepta inserciones
 *
 * Ejecución:
 *   npx dotenv -e .env -- npx tsx scripts/test-crypto-signing.ts
 */

import 'dotenv/config';
import postgres from 'postgres';
import { encryptField, decryptField } from '../lib/crypto/cert';
import { DgiiSigner } from '../lib/dgii/signer';

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m ';

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`${FAIL}  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XML mínimo válido para TesteCF (tipo 31 — Factura de Crédito Fiscal)
// ─────────────────────────────────────────────────────────────────────────────
const TEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>31</TipoeCF>
      <eNCF>E310000000001</eNCF>
      <FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>
      <IndicadorEnvioDiferido>0</IndicadorEnvioDiferido>
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>1</TipoPago>
      <TotalPaginas>1</TotalPaginas>
    </IdDoc>
    <Emisor>
      <RNCEmisor>131988032</RNCEmisor>
      <RazonSocialEmisor>SolucionesDO SRL</RazonSocialEmisor>
      <FechaEmision>17-04-2026</FechaEmision>
    </Emisor>
    <Comprador>
      <RNCComprador>101649281</RNCComprador>
      <RazonSocialComprador>EMPRESA TEST SA</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>1000.00</MontoGravadoTotal>
      <MontoGravadoI1>1000.00</MontoGravadoI1>
      <MontoExento>0.00</MontoExento>
      <ITBIS1>180.00</ITBIS1>
      <TotalITBIS>180.00</TotalITBIS>
      <MontoTotal>1180.00</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <NombreItem>Servicio de prueba</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <CantidadItem>1</CantidadItem>
      <UnidadMedidaItem>UNI</UnidadMedidaItem>
      <PrecioUnitarioItem>1000.00</PrecioUnitarioItem>
      <DescuentoMonto>0.00</DescuentoMonto>
      <TablaSubDescuento/>
      <OtrasCostas/>
      <TablaImpAdic/>
      <MontoItem>1000.00</MontoItem>
      <ITBIS1>180.00</ITBIS1>
    </Item>
  </DetallesItems>
</ECF>`;

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1m🔐 EmiteDO — Test integral: cifrado + firma\x1b[0m\n');

  // ── 1. CERT_MASTER_KEY presente ──────────────────────────────────────────
  console.log('\x1b[1m[1] Configuración\x1b[0m');
  ok('CERT_MASTER_KEY configurada (64 chars hex)',
    !!process.env.CERT_MASTER_KEY && process.env.CERT_MASTER_KEY.length === 64);
  ok('POSTGRES_URL configurada',
    !!process.env.POSTGRES_URL);

  // ── 2. Roundtrip AES-256-GCM ─────────────────────────────────────────────
  console.log('\n\x1b[1m[2] Roundtrip AES-256-GCM\x1b[0m');

  const testCases = [
    'texto plano simple',
    'base64+/==padding==',
    '¡Acentos y ñ! €',
    'A'.repeat(5000),            // base64 de P12 grande
  ];

  for (const plain of testCases) {
    try {
      const enc       = encryptField(plain);
      const decrypted = decryptField(enc);

      ok(`Roundtrip OK (${plain.length} chars)`, decrypted === plain);

      // Verificar que IV y ciphertext son distintos entre llamadas
      const enc2 = encryptField(plain);
      ok('IV único por operación (no reutiliza)',
        enc.iv !== enc2.iv && enc.ciphered !== enc2.ciphered);
    } catch (e) {
      ok(`Roundtrip (${plain.length} chars)`, false, String(e));
    }

    break; // solo la primera para brevedad; itera si necesitas
  }

  // Todos los casos
  for (const plain of testCases) {
    const enc  = encryptField(plain);
    const back = decryptField(enc);
    ok(`Roundtrip "${plain.slice(0, 20)}${plain.length > 20 ? '…' : ''}"`, back === plain);
  }

  // Verificar que tampering del authTag falla
  try {
    const enc = encryptField('dato sensible');
    decryptField({ ...enc, authTag: 'ffffffffffffffffffffffffffffffff' });
    ok('Tamper de authTag lanza error', false, 'Debería haber lanzado');
  } catch {
    ok('Tamper de authTag lanza error (integridad GCM)', true);
  }

  // ── 3. Leer cert cifrado desde BD ────────────────────────────────────────
  console.log('\n\x1b[1m[3] Lectura del certificado desde BD\x1b[0m');

  const sql = postgres(process.env.POSTGRES_URL!, { max: 1 });

  const rows = await sql<{
    id: number;
    name: string;
    cert_p12:          string | null;
    cert_p12_ciphered: string | null;
    cert_p12_iv:       string | null;
    cert_p12_auth_tag: string | null;
    cert_pin_ciphered: string | null;
    cert_pin_iv:       string | null;
    cert_pin_auth_tag: string | null;
    cert_titular:      string | null;
    cert_serial:       string | null;
    cert_vencimiento:  Date   | null;
    dgii_environment:  string | null;
  }[]>`
    SELECT id, name,
           cert_p12, cert_p12_ciphered, cert_p12_iv, cert_p12_auth_tag,
           cert_pin_ciphered, cert_pin_iv, cert_pin_auth_tag,
           cert_titular, cert_serial, cert_vencimiento,
           dgii_environment
    FROM teams
    WHERE cert_p12_ciphered IS NOT NULL
    LIMIT 1
  `;

  ok('Existe al menos 1 team con cert cifrado en BD', rows.length > 0);
  if (rows.length === 0) {
    console.log('\x1b[33m⚠ No hay certs cifrados — ejecuta scripts/migrate-certs.ts primero\x1b[0m');
    await sql.end();
    process.exit(1);
  }

  const team = rows[0];
  console.log(`${INFO} Team: #${team.id} "${team.name}"`);
  console.log(`${INFO} cert_p12 (plain text): ${team.cert_p12 ? '⚠ TODAVÍA EXISTE (pendiente limpieza)' : 'NULL ✅'}`);
  console.log(`${INFO} cert_titular: ${team.cert_titular}`);
  console.log(`${INFO} cert_serial:  ${team.cert_serial}`);
  console.log(`${INFO} cert_vence:   ${team.cert_vencimiento?.toISOString().slice(0,10)}`);
  console.log(`${INFO} ambiente:     ${team.dgii_environment}`);

  ok('cert_p12 (plain) es NULL (ya migrado)', team.cert_p12 === null);
  ok('cert_p12_ciphered tiene datos',  !!team.cert_p12_ciphered);
  ok('cert_p12_iv tiene datos',        !!team.cert_p12_iv);
  ok('cert_p12_auth_tag tiene datos',  !!team.cert_p12_auth_tag);
  ok('cert_titular extraído',          !!team.cert_titular);
  ok('cert_serial extraído',           !!team.cert_serial);

  // ── 4. Descifrar P12 ─────────────────────────────────────────────────────
  console.log('\n\x1b[1m[4] Descifrado del P12\x1b[0m');

  let p12Base64: string;
  let certPin: string;

  try {
    p12Base64 = decryptField({
      ciphered: team.cert_p12_ciphered!,
      iv:       team.cert_p12_iv!,
      authTag:  team.cert_p12_auth_tag!,
    });
    ok('Descifrado de P12 exitoso', true);
    ok('P12 es base64 válido (length > 100)', p12Base64.length > 100);
  } catch (e) {
    ok('Descifrado de P12', false, String(e));
    await sql.end();
    process.exit(1);
  }

  try {
    certPin = decryptField({
      ciphered: team.cert_pin_ciphered!,
      iv:       team.cert_pin_iv!,
      authTag:  team.cert_pin_auth_tag!,
    });
    ok('Descifrado del PIN exitoso', true);
    ok('PIN tiene longitud > 0', certPin.length > 0);
    console.log(`${INFO} PIN (primeros 2 chars): ${certPin.slice(0,2)}${'*'.repeat(Math.max(0, certPin.length - 2))}`);
  } catch (e) {
    ok('Descifrado del PIN', false, String(e));
    await sql.end();
    process.exit(1);
  }

  // ── 5. Cargar P12 en DgiiSigner ──────────────────────────────────────────
  console.log('\n\x1b[1m[5] Carga del certificado en DgiiSigner\x1b[0m');

  let signer: DgiiSigner;
  try {
    const p12Buffer = Buffer.from(p12Base64, 'base64');
    signer = new DgiiSigner({
      p12Buffer,
      password:    certPin,
      environment: (team.dgii_environment as 'TesteCF' | 'CerteCF' | 'eCF') ?? 'TesteCF',
    });
    ok('DgiiSigner instanciado sin errores', true);
  } catch (e) {
    ok('DgiiSigner instanciado', false, String(e));
    await sql.end();
    process.exit(1);
  }

  // ── 6. Firma del XML ─────────────────────────────────────────────────────
  console.log('\n\x1b[1m[6] Firma XML (XMLDSig RSA-SHA256)\x1b[0m');

  let signedXml: string;
  try {
    signedXml = signer.signXml(TEST_XML, 'ECF');
    ok('signXml retornó sin errores', true);
    ok('XML firmado contiene <Signature',    signedXml.includes('<Signature'));
    ok('XML firmado contiene <SignatureValue', signedXml.includes('<SignatureValue'));
    ok('XML firmado contiene <DigestValue',  signedXml.includes('<DigestValue'));
    console.log(`${INFO} Tamaño XML original: ${TEST_XML.length} chars`);
    console.log(`${INFO} Tamaño XML firmado:  ${signedXml.length} chars`);
  } catch (e) {
    ok('signXml', false, String(e));
    await sql.end();
    process.exit(1);
  }

  // ── 7. Código de seguridad ───────────────────────────────────────────────
  console.log('\n\x1b[1m[7] Código de seguridad (6 chars)\x1b[0m');

  try {
    const secCode = signer.extractSecurityCode(signedXml);
    ok('Código de seguridad extraído', !!secCode);
    ok('Código de seguridad tiene 6 chars', secCode.length === 6);
    console.log(`${INFO} Código de seguridad: \x1b[1m${secCode}\x1b[0m`);
  } catch (e) {
    ok('Código de seguridad', false, String(e));
  }

  // ── 8. Audit log ─────────────────────────────────────────────────────────
  console.log('\n\x1b[1m[8] Audit log (INSERT en audit_logs)\x1b[0m');

  try {
    await sql`
      INSERT INTO audit_logs (team_id, actor, action, resource, metadata)
      VALUES (
        ${team.id},
        'test@script',
        'CERT_ACCESS_FOR_SIGN',
        ${team.cert_serial},
        ${'{"source":"scripts/test-crypto-signing.ts","test":true}'}
      )
    `;
    ok('INSERT en audit_logs exitoso', true);

    const count = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM audit_logs WHERE actor = 'test@script'
    `;
    ok('Fila visible en audit_logs', (count[0]?.c ?? 0) > 0);

    // Limpiar entrada de test
    await sql`DELETE FROM audit_logs WHERE actor = 'test@script'`;
    ok('Limpieza de entrada de test OK', true);
  } catch (e) {
    ok('Audit log', false, String(e));
  }

  // ── 9. Rate limit distribuido ────────────────────────────────────────────
  console.log('\n\x1b[1m[9] Rate limiter distribuido (Postgres)\x1b[0m');

  try {
    // Limpiar posibles entradas previas de este test
    await sql`DELETE FROM rate_limits WHERE key = 'test:rl:1'`;

    // Primera llamada
    const r1 = await sql<{ count: number; reset_at: Date }[]>`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES ('test:rl:1', 1, NOW() + INTERVAL '1 minute')
      ON CONFLICT (key) DO UPDATE
        SET count    = CASE WHEN rate_limits.reset_at < NOW() THEN 1 ELSE rate_limits.count + 1 END,
            reset_at = CASE WHEN rate_limits.reset_at < NOW() THEN NOW() + INTERVAL '1 minute' ELSE rate_limits.reset_at END
      RETURNING count, reset_at
    `;
    ok('Primera petición: count=1', Number(r1[0].count) === 1);

    // Segunda llamada (mismo key)
    const r2 = await sql<{ count: number; reset_at: Date }[]>`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES ('test:rl:1', 1, NOW() + INTERVAL '1 minute')
      ON CONFLICT (key) DO UPDATE
        SET count    = CASE WHEN rate_limits.reset_at < NOW() THEN 1 ELSE rate_limits.count + 1 END,
            reset_at = CASE WHEN rate_limits.reset_at < NOW() THEN NOW() + INTERVAL '1 minute' ELSE rate_limits.reset_at END
      RETURNING count, reset_at
    `;
    ok('Segunda petición: count=2 (incrementa)', Number(r2[0].count) === 2);

    await sql`DELETE FROM rate_limits WHERE key = 'test:rl:1'`;
    ok('Limpieza de rate_limits OK', true);
  } catch (e) {
    ok('Rate limiter', false, String(e));
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`\x1b[1mResultados: ${PASS} ${passed}   ${FAIL} ${failed}\x1b[0m`);
  console.log('─'.repeat(50) + '\n');

  await sql.end();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\x1b[31m💥 Error fatal:\x1b[0m', err);
  process.exit(1);
});
