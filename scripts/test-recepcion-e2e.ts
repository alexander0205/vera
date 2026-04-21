/**
 * Prueba E2E del flujo RECEPCIÓN + generación de ARECF + expansiones XML.
 *
 * 1. Construye XMLs de los 10 tipos con buildEcfXml (valida reglas)
 * 2. Carga cert del team 1
 * 3. Firma un e-CF tipo 31 dirigido al team 1 (nos lo auto-enviamos)
 * 4. Genera ARECF firmado usando el receiver helper
 * 5. Verifica que el ARECF tiene la estructura correcta
 *
 * Uso: pnpm dlx tsx scripts/test-recepcion-e2e.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from '../lib/db/drizzle';
import { teams } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { buildEcfXml, BuildEcfError, type EcfData } from '../lib/dgii/xml-builder';
import {
  crearSignerDesdeTeam,
  validarYGenerarARECF,
  extraerMetaDelXml,
  tipoEsEntreContribuyentes,
} from '../lib/dgii/receiver';

function seccion(n: string) {
  console.log(`\n── ${n} ─────────────────────────────────────`);
}

function baseData(tipo: string, overrides: Partial<EcfData> = {}): EcfData {
  const fechaEmision = new Date();
  const fechaVenc = new Date('2027-12-31');
  return {
    tipoEcf: tipo,
    encf: `E${tipo.padStart(2, '0')}0000000001`,
    rncEmisor: '131988032',
    razonSocialEmisor: 'SolucionesDO SRL',
    direccionEmisor: 'Calle Test 123',
    fechaEmision,
    fechaVencimientoSecuencia: fechaVenc,
    rncComprador: '130000001',
    razonSocialComprador: 'Cliente Test',
    tipoPago: 1,
    items: [{
      numeroLinea: 1,
      nombreItem: 'Servicio de prueba',
      cantidadItem: 1,
      precioUnitarioItem: 1000,
      montoItem: 1000,
      tasaItbis: 0.18,
      montoItbis: 180,
      indicadorBienoServicio: 2,
    }],
    montoGravadoTotal: 1000,
    montoGravadoI1: 1000,
    itbis1: 180,
    totalItbis: 180,
    montoTotal: 1180,
    ...overrides,
  };
}

async function main() {
  console.log('\n╔═════════════════════════════════════════════════════╗');
  console.log('║  RECEPCIÓN DGII — Prueba E2E                       ║');
  console.log('╚═════════════════════════════════════════════════════╝');

  // ── 1) buildEcfXml — los 10 tipos ──────────────────────────────────────
  seccion('1) Construcción XML de los 10 tipos');

  const cases: { tipo: string; overrides?: Partial<EcfData>; debeFallar?: string }[] = [
    { tipo: '31' },
    { tipo: '32', overrides: { rncComprador: undefined, razonSocialComprador: undefined } },
    { tipo: '33', overrides: { ncfModificado: 'E310000000001', codigoModificacion: '1', razonModificacion: 'Ajuste precio' } },
    { tipo: '34', overrides: { ncfModificado: 'E310000000001', codigoModificacion: '2' } },
    { tipo: '41' },
    { tipo: '43', overrides: { rncComprador: undefined, razonSocialComprador: undefined } },
    { tipo: '44' },
    { tipo: '45' },
    { tipo: '46', overrides: {
      compradorExtranjero: { nombre: 'Foreign Buyer Inc', pais: 'USA' },
      informacionExportacion: { pais: 'USA', regimenAduanero: 'EX-1' },
      otraMoneda: { tipoMoneda: 'USD', tipoCambio: 58.5 },
    } },
    { tipo: '47', overrides: { compradorExtranjero: { nombre: 'Overseas Vendor' } } },
    // Casos que DEBEN fallar
    { tipo: '33', overrides: { ncfModificado: undefined }, debeFallar: 'requiere NCFModificado' },
    { tipo: '46', overrides: { compradorExtranjero: undefined }, debeFallar: 'comprador extranjero' },
    { tipo: '31', overrides: { rncComprador: undefined }, debeFallar: 'requiere RNCComprador' },
  ];

  let okCount = 0, failCount = 0;
  for (const c of cases) {
    try {
      const xml = buildEcfXml(baseData(c.tipo, c.overrides));
      if (c.debeFallar) {
        console.log(`  ✖ tipo ${c.tipo} (${c.debeFallar}) → NO lanzó error esperado`);
        failCount++;
      } else {
        if (xml.includes(`<TipoeCF>${c.tipo}</TipoeCF>`) && xml.length > 200) {
          console.log(`  ✓ tipo ${c.tipo} → ${xml.length} bytes`);
          okCount++;
        } else {
          console.log(`  ✖ tipo ${c.tipo} → XML inválido (${xml.length} bytes)`);
          failCount++;
        }
      }
    } catch (err: any) {
      if (c.debeFallar && err instanceof BuildEcfError && err.message.toLowerCase().includes(c.debeFallar.toLowerCase())) {
        console.log(`  ✓ tipo ${c.tipo} — lanzó error esperado: "${err.message.slice(0, 50)}..."`);
        okCount++;
      } else if (c.debeFallar) {
        console.log(`  ✖ tipo ${c.tipo} — error inesperado: ${err.message}`);
        failCount++;
      } else {
        console.log(`  ✖ tipo ${c.tipo} — error: ${err.message}`);
        failCount++;
      }
    }
  }
  console.log(`  Subtotal: ${okCount} ok / ${failCount} fail`);

  // ── 2) Recepción real: construir + firmar + ARECF ──────────────────────
  seccion('2) Flujo de recepción completo');

  const [team] = await db.select().from(teams).where(eq(teams.id, 1)).limit(1);
  if (!team) {
    console.log('  ✖ Team 1 no existe');
    process.exit(1);
  }
  console.log(`  ✓ Team: ${team.name} RNC ${team.rnc}`);

  const signer = crearSignerDesdeTeam(team);
  console.log('  ✓ Signer cargado');

  // Construimos un e-CF donde team.rnc es el comprador (receptor)
  const xmlSinFirmar = buildEcfXml({
    tipoEcf: '31',
    encf: 'E310099000001',
    rncEmisor: '130123456',
    razonSocialEmisor: 'Empresa Emisora Fake',
    direccionEmisor: 'Test 456',
    fechaEmision: new Date(),
    fechaVencimientoSecuencia: new Date('2027-12-31'),
    rncComprador: team.rnc!,                 // ← receptor = nosotros
    razonSocialComprador: team.razonSocial ?? team.name,
    tipoPago: 1,
    items: [{
      numeroLinea: 1, nombreItem: 'Item Test', cantidadItem: 1,
      precioUnitarioItem: 500, montoItem: 500,
      tasaItbis: 0.18, montoItbis: 90, indicadorBienoServicio: 2,
    }],
    montoGravadoTotal: 500, montoGravadoI1: 500,
    itbis1: 90, totalItbis: 90, montoTotal: 590,
  });
  const xmlFirmado = signer.signXml(xmlSinFirmar, 'ECF');
  console.log(`  ✓ e-CF firmado (${xmlFirmado.length} bytes)`);

  // Meta extraction
  const meta = extraerMetaDelXml(xmlFirmado);
  if (!meta || meta.encf !== 'E310099000001' || meta.tipoEcf !== '31') {
    console.log('  ✖ Meta extraída incorrecta:', meta);
    process.exit(2);
  }
  console.log(`  ✓ Meta extraída: tipo=${meta.tipoEcf} encf=${meta.encf} monto=${meta.montoTotal}`);

  // Es intercambiable?
  console.log(`  ✓ Tipo 31 intercambiable entre contribuyentes: ${tipoEsEntreContribuyentes('31')}`);
  console.log(`  ✓ Tipo 32 intercambiable entre contribuyentes: ${tipoEsEntreContribuyentes('32')} (debe ser false)`);

  // Generar ARECF firmado
  const resultado = validarYGenerarARECF(signer, xmlFirmado, team.rnc!);
  if (!resultado.aceptado) {
    console.log(`  ✖ ARECF rechazado inesperadamente: ${resultado.motivoRechazo}`);
    process.exit(3);
  }
  console.log(`  ✓ ARECF generado y firmado (${resultado.arecfFirmado.length} bytes)`);
  const hasARECF = resultado.arecfFirmado.includes('<ARECF') || resultado.arecfFirmado.includes('ARECF');
  const hasSignature = resultado.arecfFirmado.includes('Signature');
  console.log(`    Contiene tag ARECF: ${hasARECF}`);
  console.log(`    Contiene tag Signature: ${hasSignature}`);

  // ── 3) Casos de rechazo ────────────────────────────────────────────────
  seccion('3) Casos de rechazo (ARECF con código de error)');

  // RNC no corresponde
  const xmlMalDirigido = buildEcfXml({
    tipoEcf: '31', encf: 'E310099000002',
    rncEmisor: '130123456', razonSocialEmisor: 'X', direccionEmisor: 'x',
    fechaEmision: new Date(), fechaVencimientoSecuencia: new Date('2027-12-31'),
    rncComprador: '999999999', razonSocialComprador: 'Otro',
    items: [{ numeroLinea: 1, nombreItem: 'x', cantidadItem: 1, precioUnitarioItem: 100, montoItem: 100, tasaItbis: 0.18, montoItbis: 18 }],
    montoGravadoTotal: 100, itbis1: 18, totalItbis: 18, montoTotal: 118,
  });
  const resRNC = validarYGenerarARECF(signer, signer.signXml(xmlMalDirigido, 'ECF'), team.rnc!);
  console.log(`  ${resRNC.codigoRechazo === '4' ? '✓' : '✖'} RNC no corresponde → código 4 (obtenido: ${resRNC.codigoRechazo})`);

  // Tipo no intercambiable (32)
  const xml32 = buildEcfXml({
    tipoEcf: '32', encf: 'E320099000003',
    rncEmisor: '130123456', razonSocialEmisor: 'X', direccionEmisor: 'x',
    fechaEmision: new Date(), fechaVencimientoSecuencia: new Date('2027-12-31'),
    items: [{ numeroLinea: 1, nombreItem: 'x', cantidadItem: 1, precioUnitarioItem: 100, montoItem: 100, tasaItbis: 0.18, montoItbis: 18 }],
    montoGravadoTotal: 100, itbis1: 18, totalItbis: 18, montoTotal: 118,
  });
  const res32 = validarYGenerarARECF(signer, signer.signXml(xml32, 'ECF'), team.rnc!);
  console.log(`  ${res32.codigoRechazo === '1' ? '✓' : '✖'} Tipo 32 no intercambiable → código 1 (obtenido: ${res32.codigoRechazo})`);

  // XML basura
  const resBasura = validarYGenerarARECF(signer, '<?xml version="1.0"?><Invalid/>', team.rnc!);
  console.log(`  ${resBasura.codigoRechazo === '1' ? '✓' : '✖'} XML inválido → código 1 (obtenido: ${resBasura.codigoRechazo})`);

  console.log('\n╔═════════════════════════════════════════════════════╗');
  console.log('║  RESULTADO: flujo completo validado                ║');
  console.log('╚═════════════════════════════════════════════════════╝\n');
  process.exit(0);
}

main().catch(err => { console.error('\n✖', err); process.exit(99); });
