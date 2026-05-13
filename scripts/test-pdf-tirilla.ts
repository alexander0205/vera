/**
 * Genera muestras de PDF de factura en formato grande y tirilla
 * para los principales tipos de e-CF (31, 32, 33, 34).
 *
 * Uso:
 *   npx tsx scripts/test-pdf-tirilla.ts
 *
 * Salida en /tmp/factura-<tipo>-<formato>.pdf
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { writeFileSync } from 'fs';
import QRCode from 'qrcode';
import { FacturaPDF, type FacturaPDFData } from '../lib/pdf/FacturaPDF';
import { FacturaTirillaPDF } from '../lib/pdf/FacturaTirillaPDF';

const TIPOS: Array<{ codigo: string; nombre: string }> = [
  { codigo: '31', nombre: 'Factura Fiscal' },
  { codigo: '32', nombre: 'Factura de Consumo' },
  { codigo: '33', nombre: 'Nota de Débito' },
  { codigo: '34', nombre: 'Nota de Crédito' },
];

async function buildData(tipo: string, nombre: string): Promise<FacturaPDFData> {
  const qrDataUrl = await QRCode.toDataURL(
    `https://dgii.gov.do/e-CF?encf=E${tipo}0000000123&rnc=130123456`,
    { width: 128, margin: 1, errorCorrectionLevel: 'M' },
  );
  return {
    encf: `E${tipo}0000000123`,
    tipoEcf: tipo,
    tipoEcfNombre: nombre,
    fechaEmision: '12 de mayo de 2026',
    tipoPagoNombre: 'Contado',
    estado: 'ACEPTADO',
    codigoSeguridad: 'BkWwtU',
    trackId: 'TRACK20260512abc123',
    fechaFirma: '12/05/2026 14:32',
    moneda: 'DOP',
    emisor: {
      razonSocial: 'YISRAEL TECHNOLOGY LLC',
      nombreComercial: 'EmiteDO',
      rnc: '130123456',
      direccion: '1309 Coffeen Avenue STE 18941, Sheridan, WY 82801',
      telefono: '(809) 555-0100',
      sitioWeb: 'www.emitedo.com',
      emailFacturacion: 'facturacion@emitedo.com',
      colorPrimario: '#0f766e',
    },
    comprador: {
      razonSocial: 'ACME COMPANY SRL',
      rnc: '130456789',
      email: 'contabilidad@acme.do',
      telefono: '(809) 555-0200',
    },
    items: [
      { nombreItem: 'Producto de prueba',     cantidadItem: 2, precioUnitarioItem: 1000.00, tasaItbis: 0.18, subtotalConItbis: 2360.00 },
      { nombreItem: 'Servicio consultoría TI', cantidadItem: 5, precioUnitarioItem: 500.00,  tasaItbis: 0.18, subtotalConItbis: 2950.00 },
      { nombreItem: 'Item exento',             cantidadItem: 1, precioUnitarioItem: 250.00,  tasaItbis: 0,    subtotalConItbis: 250.00 },
    ],
    subtotal: 4750.00,
    totalItbis: 810.00,
    montoTotal: 5560.00,
    qrDataUrl,
    pieFactura: 'Gracias por su compra. Comprobante válido como factura fiscal electrónica.',
  };
}

async function main() {
  for (const { codigo, nombre } of TIPOS) {
    const data = await buildData(codigo, nombre);

    // Grande
    const bufG = await renderToBuffer(
      createElement(FacturaPDF, { data }) as any,
    );
    const fileG = `/tmp/factura-${codigo}-grande.pdf`;
    writeFileSync(fileG, bufG);
    console.log(`✓ ${fileG} (${bufG.length} bytes)`);

    // Tirilla
    const bufT = await renderToBuffer(
      createElement(FacturaTirillaPDF, { data }) as any,
    );
    const fileT = `/tmp/factura-${codigo}-tirilla.pdf`;
    writeFileSync(fileT, bufT);
    console.log(`✓ ${fileT} (${bufT.length} bytes)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
