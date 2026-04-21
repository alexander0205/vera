/**
 * Script de prueba: envío real de e-CF tipo 31 contra TesteCF
 *
 * Qué hace:
 *   1. Carga el cert del team id=1 de la BD
 *   2. Autentica contra TesteCF (semilla → JWT)
 *   3. Construye un e-CF tipo 31 (Crédito Fiscal) de prueba
 *   4. Valida el XML antes de enviarlo
 *   5. Firma el XML con XMLDSig RSA-SHA256
 *   6. Envía a POST /recepcion/api/facturaselectronicas
 *   7. Recibe trackId → hace polling hasta Aceptado/Rechazado
 *   8. Guarda el XML firmado en /tmp para inspección
 *
 * Uso:
 *   npx dotenv -e .env -- npx tsx scripts/test-ecf-envio.ts
 *
 * Para probar otro tipo:
 *   TIPO_ECF=32 npx dotenv -e .env -- npx tsx scripts/test-ecf-envio.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from 'fs';
import path from 'path';
import { db } from '../lib/db/drizzle';
import { teams } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptField, isEncrypted } from '../lib/crypto/cert';
import { DgiiSigner } from '../lib/dgii/signer';
import { DgiiClient, type DgiiEnvironment, type EstadoDgii } from '../lib/dgii/client';
import { buildEcfXml, type EcfData } from '../lib/dgii/xml-builder';

// ─── Configuración del e-CF de prueba ────────────────────────────────────────

const TIPO_ECF = (process.env.TIPO_ECF ?? '31') as string;

// Secuencia de prueba — en testecf no importa el número real
const ENCF_PRUEBA: Record<string, string> = {
  '31': 'E310000000001',
  '32': 'E320000000001',
  '33': 'E330000000001',
  '34': 'E340000000001',
};

// ─── Polling de estado ────────────────────────────────────────────────────────

async function esperarEstadoFinal(
  client: DgiiClient,
  trackId: string,
  maxIntentos = 15,
  intervaloMs = 3000
): Promise<{ estado: EstadoDgii; mensajes?: { codigo: string; descripcion: string }[] }> {
  console.log(`\n   Consultando estado (máx ${maxIntentos} intentos cada ${intervaloMs / 1000}s)...`);

  for (let i = 1; i <= maxIntentos; i++) {
    await new Promise(r => setTimeout(r, intervaloMs));

    try {
      const resp = await client.consultarEstado(trackId);
      const estado = resp.estado as EstadoDgii;
      console.log(`   Intento ${i}/${maxIntentos} → estado: ${estado}`);

      if (estado !== 'En Proceso') {
        return { estado, mensajes: resp.mensajes };
      }
    } catch (err: any) {
      console.log(`   Intento ${i}/${maxIntentos} → error al consultar: ${err?.message}`);
    }
  }

  return { estado: 'En Proceso' }; // timeout
}

// ─── e-CF de prueba según tipo ────────────────────────────────────────────────

function buildDatosPrueba(
  rnc: string,
  razonSocial: string,
  tipo: string
): EcfData {
  const hoy = new Date();
  const vencimiento = new Date(hoy.getFullYear(), 11, 31); // 31-12 del año en curso
  const encf = ENCF_PRUEBA[tipo] ?? `E${tipo}0000000001`;

  const base: EcfData = {
    tipoEcf: tipo,
    encf,
    rncEmisor: rnc,
    razonSocialEmisor: razonSocial,
    direccionEmisor: 'C/ Prueba #1, Santo Domingo, RD',
    fechaEmision: hoy,
    fechaVencimientoSecuencia: vencimiento,
    tipoPago: 1, // Contado
    items: [
      {
        numeroLinea: 1,
        nombreItem: 'Servicio de prueba EmiteDo',
        indicadorBienoServicio: 2,
        cantidadItem: 1,
        unidadMedidaItem: 'Unidad',
        precioUnitarioItem: 1000.00,
        montoItem: 1000.00,
        tasaItbis: 0.18,
        montoItbis: 180.00,
      },
    ],
    montoGravadoTotal: 1000.00,
    montoGravadoI1: 1000.00,
    itbis1: 180.00,
    totalItbis: 180.00,
    montoTotal: 1180.00,
  };

  // Tipo 31 (Crédito Fiscal B2B) requiere RNC comprador
  if (tipo === '31') {
    base.rncComprador = '130862346'; // RNC de prueba DGII
    base.razonSocialComprador = 'EMPRESA DE PRUEBA SA';
  }

  // Tipos 33/34 (Notas) requieren referencia
  if (tipo === '33' || tipo === '34') {
    base.ncfModificado = 'E310000000001';
    base.fechaNcfModificado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    base.codigoModificacion = '1'; // 1 = Descuento
  }

  return base;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  ENVÍO E-CF TIPO ${TIPO_ECF} — TesteCF (prueba real)              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1) Cargar team y descifrar cert ───────────────────────────────────────
  const [team] = await db.select().from(teams).where(eq(teams.id, 1)).limit(1);
  if (!team) throw new Error('Team id=1 no encontrado');

  console.log(`✔ Team: ${team.name} | RNC: ${team.rnc}`);

  if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
    console.error('✖ Certificado no configurado. Ejecuta scripts/migrate-certs.ts primero.');
    process.exit(1);
  }

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

  console.log(`✔ Cert descifrado — titular: ${team.certTitular ?? 'desconocido'}`);

  // ── 2) Autenticar ─────────────────────────────────────────────────────────
  const env: DgiiEnvironment = 'TesteCF';
  const signer = new DgiiSigner({
    p12Buffer: Buffer.from(p12b64, 'base64'),
    password: pin,
    environment: env,
  });

  console.log('\n── Autenticando contra TesteCF...');
  const { token, expiresAt } = await signer.authenticate();
  console.log(`✔ Token JWT obtenido — expira: ${expiresAt.toISOString()}`);

  const client = new DgiiClient(env);
  client.setToken(token, expiresAt);

  // ── 3) Construir XML ──────────────────────────────────────────────────────
  const rnc = team.rnc!;
  const razonSocial = team.razonSocial ?? team.name;
  const datos = buildDatosPrueba(rnc, razonSocial, TIPO_ECF);

  console.log(`\n── Construyendo e-CF tipo ${TIPO_ECF}...`);
  const xmlSinFirmar = buildEcfXml(datos);
  console.log(`✔ XML generado — ${xmlSinFirmar.length} bytes`);

  // Guardar XML sin firmar para inspección
  const tmpDir = '/tmp/emitedo-test';
  fs.mkdirSync(tmpDir, { recursive: true });
  const xmlPath = path.join(tmpDir, `ecf-${TIPO_ECF}-sin-firma.xml`);
  fs.writeFileSync(xmlPath, xmlSinFirmar, 'utf8');
  console.log(`   Guardado en: ${xmlPath}`);

  // ── 4) Firmar XML ─────────────────────────────────────────────────────────
  console.log('\n── Firmando XML (XMLDSig RSA-SHA256)...');
  const xmlFirmado = signer.signXml(xmlSinFirmar, 'ECF');
  const codigoSeguridad = signer.extractSecurityCode(xmlFirmado);

  console.log(`✔ XML firmado — ${xmlFirmado.length} bytes`);
  console.log(`✔ Código de seguridad: ${codigoSeguridad}`);

  // Guardar XML firmado
  const xmlFirmadoPath = path.join(tmpDir, `ecf-${TIPO_ECF}-firmado.xml`);
  fs.writeFileSync(xmlFirmadoPath, xmlFirmado, 'utf8');
  console.log(`   Guardado en: ${xmlFirmadoPath}`);

  // ── 5) Enviar a DGII TesteCF ──────────────────────────────────────────────
  const encf = datos.encf;
  console.log(`\n── Enviando ${encf} a TesteCF...`);

  let trackId: string;
  let estadoInicial: string;

  try {
    const resp = await client.enviarEcf(xmlFirmado, rnc, encf);
    trackId = resp.trackId;
    estadoInicial = resp.estado;
    console.log(`✔ Recibido por DGII`);
    console.log(`   trackId:  ${trackId}`);
    console.log(`   estado:   ${estadoInicial}`);
  } catch (err: any) {
    console.error(`\n✖ DGII rechazó el envío: ${err?.message ?? err}`);
    console.error('   Revisa el XML en:', xmlFirmadoPath);
    process.exit(4);
  }

  // ── 6) Polling hasta estado final ─────────────────────────────────────────
  console.log('\n── Esperando respuesta final de DGII...');
  const { estado, mensajes } = await esperarEstadoFinal(client, trackId);

  // ── 7) Resultado ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));

  if (estado === 'Aceptado' || estado === 'AceptadoCondicional') {
    console.log(`\n  ✅  ${estado.toUpperCase()}`);
    console.log(`      eNCF:             ${encf}`);
    console.log(`      Código seguridad: ${codigoSeguridad}`);
    if (estado === 'AceptadoCondicional' && mensajes?.length) {
      console.log('\n  ⚠️  Advertencias:');
      mensajes.forEach(m => console.log(`      [${m.codigo}] ${m.descripcion}`));
    }
  } else if (estado === 'Rechazado') {
    console.log(`\n  ❌  RECHAZADO`);
    if (mensajes?.length) {
      console.log('\n  Motivos:');
      mensajes.forEach(m => console.log(`      [${m.codigo}] ${m.descripcion}`));
    }
    console.log('\n  Inspecciona el XML en:', xmlFirmadoPath);
  } else {
    console.log(`\n  ⏳  Timeout — último estado: ${estado}`);
    console.log(`      Consulta manualmente: GET /recepcion/api/trackid/${trackId}`);
  }

  console.log('\n' + '═'.repeat(64) + '\n');
  process.exit(estado === 'Rechazado' ? 1 : 0);
}

main().catch(err => {
  console.error('\n✖ Error fatal:', err);
  process.exit(99);
});
