/**
 * GET /api/pdf/demo?tipo=borrador   → PDF con watermark BORRADOR
 * GET /api/pdf/demo?tipo=emitido    → PDF emitido (sin watermark)
 * GET /api/pdf/demo                 → emitido por defecto
 *
 * Solo para desarrollo — genera un PDF de muestra con datos ficticios.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import QRCode from 'qrcode';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';

// ─── Datos ficticios ──────────────────────────────────────────────────────────

const EMISOR_DEMO = {
  razonSocial:      'Tecnología Empresarial Dominicana, S.R.L.',
  nombreComercial:  'TechDO',
  rnc:              '1-30-12345-6',
  direccion:        'Av. Winston Churchill #1099, Torre BHD, Piso 14, Santo Domingo',
  telefono:         '809-555-0100',
  sitioWeb:         'www.techdo.com.do',
  emailFacturacion: 'facturacion@techdo.com.do',
  colorPrimario:    '#1e40af',
};

const COMPRADOR_DEMO = {
  razonSocial: 'Supermercados Nacional, S.A.',
  rnc:         '1-01-56789-0',
  email:       'cuentaspagar@nacional.com.do',
  telefono:    '809-555-0200',
};

const ITEMS_DEMO: FacturaPDFData['items'] = [
  {
    nombreItem:         'Licencia anual Software ERP Empresarial',
    descripcionItem:    'Suite completa: contabilidad, RRHH, inventario y facturación electrónica',
    cantidadItem:       1,
    precioUnitarioItem: 180000,
    tasaItbis:          0.18,
    subtotalConItbis:   212400,
    unidadMedida:       'Licencia',
  },
  {
    nombreItem:         'Módulo adicional e-Commerce',
    descripcionItem:    'Integración tienda en línea con pasarela de pagos local',
    cantidadItem:       1,
    precioUnitarioItem: 45000,
    tasaItbis:          0.18,
    subtotalConItbis:   53100,
    unidadMedida:       'Módulo',
  },
  {
    nombreItem:         'Horas de implementación y configuración',
    descripcionItem:    'Levantamiento de requerimientos, instalación y pruebas UAT',
    cantidadItem:       40,
    precioUnitarioItem: 3500,
    tasaItbis:          0.18,
    subtotalConItbis:   165200,
    unidadMedida:       'Hora',
  },
  {
    nombreItem:         'Capacitación usuarios finales',
    descripcionItem:    'Talleres presenciales — grupo hasta 15 personas por sesión',
    cantidadItem:       3,
    precioUnitarioItem: 18000,
    tasaItbis:          0.18,
    subtotalConItbis:   63720,
    unidadMedida:       'Sesión',
  },
  {
    nombreItem:         'Migración de datos históricos',
    descripcionItem:    'Importación desde sistema legacy: clientes, productos, facturas 2022-2024',
    cantidadItem:       1,
    precioUnitarioItem: 28000,
    descuentoMonto:     5000,
    tasaItbis:          0.18,
    subtotalConItbis:   27140,
    unidadMedida:       'Servicio',
  },
  {
    nombreItem:         'Soporte técnico prioritario — 12 meses',
    descripcionItem:    'SLA 4h respuesta, acceso directo a ingeniero asignado',
    cantidadItem:       12,
    precioUnitarioItem: 4500,
    tasaItbis:          0.18,
    subtotalConItbis:   63720,
    unidadMedida:       'Mes',
  },
  {
    nombreItem:         'Certificado Digital DGII (p12)',
    descripcionItem:    'Gestión y renovación del certificado para emisión de e-CF',
    cantidadItem:       1,
    precioUnitarioItem: 3800,
    tasaItbis:          0,
    subtotalConItbis:   3800,
    unidadMedida:       'Servicio',
  },
  {
    nombreItem:         'Servidor dedicado VPS — Tier 2',
    descripcionItem:    '8 vCPU · 16 GB RAM · 200 GB NVMe — hosting en datacenter RD',
    cantidadItem:       1,
    precioUnitarioItem: 22000,
    tasaItbis:          0.18,
    subtotalConItbis:   25960,
    unidadMedida:       'Mes',
  },
  {
    nombreItem:         'Dominio .com.do — renovación 2 años',
    descripcionItem:    '',
    cantidadItem:       2,
    precioUnitarioItem: 1800,
    tasaItbis:          0,
    subtotalConItbis:   3600,
    unidadMedida:       'Año',
  },
  {
    nombreItem:         'Consultoría fiscal e-CF Norma 08-2018',
    descripcionItem:    'Revisión de secuencias, tipos de comprobante y configuración DGII',
    cantidadItem:       5,
    precioUnitarioItem: 8000,
    descuentoMonto:     4000,
    tasaItbis:          0.18,
    subtotalConItbis:   47200,
    unidadMedida:       'Hora',
  },
  {
    nombreItem:         'Mantenimiento preventivo base de datos',
    descripcionItem:    'Optimización, backups automatizados y monitoreo 24/7',
    cantidadItem:       6,
    precioUnitarioItem: 5500,
    tasaItbis:          0.18,
    subtotalConItbis:   39006,
    unidadMedida:       'Mes',
  },
  {
    nombreItem:         'Material didáctico impreso',
    descripcionItem:    'Manuales de usuario y guías rápidas (juego completo)',
    cantidadItem:       15,
    precioUnitarioItem: 350,
    tasaItbis:          0,
    subtotalConItbis:   5250,
    unidadMedida:       'Juego',
  },
];

// Totales calculados a mano para los datos demo
const SUBTOTAL   = 349200;
const ITBIS      = 66348;
const MONTO_TOTAL = SUBTOTAL + ITBIS;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get('tipo') ?? 'emitido';
  const esBorrador = tipo === 'borrador';

  const encf  = esBorrador ? 'BORRADOR-1748123456789' : 'E310000000042';
  const estado = esBorrador ? 'BORRADOR' : 'ACEPTADO';

  const qrText = `https://dgii.gov.do/e-CF?encf=${encf}&rnc=${EMISOR_DEMO.rnc}`;
  const qrDataUrl = await QRCode.toDataURL(qrText, {
    width: 128, margin: 1, errorCorrectionLevel: 'M',
  });

  const pdfData: FacturaPDFData = {
    encf,
    tipoEcf:       '31',
    tipoEcfNombre: 'Factura de Crédito Fiscal',
    fechaEmision:  '15 de abril de 2026',
    fechaVencimientoFactura: '15 de mayo de 2026',
    fechaVencimientoNcf:     '31 de diciembre de 2026',
    sucursal:      'Oficina Central — Santo Domingo',
    tipoPagoNombre: 'Crédito',
    moneda:         'DOP',
    estado,
    esBorrador,
    codigoSeguridad: esBorrador ? undefined : 'A1B2C3',
    trackId:         esBorrador ? undefined : 'TRK-202604-00042',

    emisor:    EMISOR_DEMO,
    comprador: COMPRADOR_DEMO,

    items: ITEMS_DEMO,

    subtotal:   SUBTOTAL,
    totalItbis: ITBIS,
    montoTotal: MONTO_TOTAL,

    qrDataUrl,
    pieFactura: 'Condiciones: pago a 30 días fecha factura. ' +
      'Esta factura es un Comprobante Fiscal Electrónico (e-CF) válido ' +
      'para propósitos tributarios en la República Dominicana conforme ' +
      'a la Norma General 08-2018 de la DGII.',
  };

  const pdfBuffer = await renderToBuffer(
    createElement(FacturaPDF, { data: pdfData }) as any
  );

  const filename = esBorrador ? 'factura-borrador-demo.pdf' : 'factura-emitida-demo.pdf';

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
