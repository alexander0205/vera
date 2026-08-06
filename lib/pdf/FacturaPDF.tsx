/**
 * Template PDF de Factura Electrónica EmiteDO — estilo Alegra
 * Usa @react-pdf/renderer — solo en API routes (Node.js), nunca en client components.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { labelMetodo } from '@/lib/pagos/metodos';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ItemPDF {
  nombreItem:          string;
  descripcionItem?:    string;
  /** Referencia/beneficiario interno: nombre del niño (colegio), socio (gym), etc. */
  referencia?:         string;
  cantidadItem:        number;
  precioUnitarioItem:  number;   // en DOP
  descuentoMonto?:     number;
  descuentoPct?:       number;
  unidadMedida?:       string;
  tasaItbis?:          number;   // 0.18, 0.16, 0 = exento/undefined
  subtotalConItbis:    number;   // en DOP
  /** Beneficiario por línea (dependiente del cliente). */
  dependienteNombre?:  string | null;
}

export interface EmisorPDF {
  razonSocial:       string;
  nombreComercial?:  string;
  rnc:               string;
  direccion?:        string;
  telefono?:         string;
  sitioWeb?:         string;
  emailFacturacion?: string;
  logo?:             string;
  colorPrimario?:    string;
}

export interface CompradorPDF {
  razonSocial?: string;
  rnc?:         string;
  email?:       string;
  telefono?:    string;
}

export interface FacturaPDFData {
  encf:                   string;
  /** Código humano-legible único por empresa: F-YYYY-NNNNNN */
  codigo?:                string;
  tipoEcf:                string;
  tipoEcfNombre:          string;
  fechaEmision:           string;
  fechaVencimientoFactura?: string;
  fechaVencimientoNcf?:   string;
  sucursal?:              string;
  esBorrador?:            boolean;
  tipoPagoNombre:         string;
  moneda?:                string;
  estado:                 string;
  codigoSeguridad?:       string;
  trackId?:               string;
  fechaFirma?:            string;  // Fecha/hora de la firma digital (DGII lo exige visible)

  emisor:    EmisorPDF;
  comprador: CompradorPDF;
  items:     ItemPDF[];

  subtotal:    number;
  totalItbis:  number;
  montoTotal:  number;
  /** Saldo pendiente. 0 = pagada. Fallback a montoTotal si no se pasa. */
  saldo?:      number;

  qrDataUrl?:  string;
  pieFactura?: string | null;
  /** Se renderizan solo si tienen contenido. */
  terminosCondiciones?: string | null;
  notas?:               string | null;
  /** Beneficiario (dependiente del cliente). Se muestra bajo los datos del comprador. */
  dependienteNombre?:   string | null;
  /** Historial de pagos recibidos — se lista con su fecha si hay alguno. */
  pagos?: Array<{
    metodo:     string;
    montoDOP:   number;
    fecha?:     string | null;   // YYYY-MM-DD
    usuario?:   string;
    nota?:      string;
    referencia?: string;
  }>;
}

// ─── Monto en letras ──────────────────────────────────────────────────────────

function numeroALetras(n: number): string {
  const UNI = ['', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve',
    'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve'];
  const DEC = ['', '', 'Veinte', 'Treinta', 'Cuarenta', 'Cincuenta', 'Sesenta', 'Setenta', 'Ochenta', 'Noventa'];
  const CEN = ['', 'Cien', 'Doscientos', 'Trescientos', 'Cuatrocientos', 'Quinientos',
    'Seiscientos', 'Setecientos', 'Ochocientos', 'Novecientos'];

  function c(x: number): string {
    if (x === 0) return '';
    if (x < 20) return UNI[x];
    if (x < 30) return x === 20 ? 'Veinte' : 'Veinti' + UNI[x % 10].toLowerCase();
    if (x < 100) return DEC[Math.floor(x / 10)] + (x % 10 ? ' y ' + UNI[x % 10].toLowerCase() : '');
    if (x === 100) return 'Cien';
    return CEN[Math.floor(x / 100)] + (x % 100 ? ' ' + c(x % 100) : '');
  }

  const entero   = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let t = '';
  const mill = Math.floor(entero / 1_000_000);
  const mil  = Math.floor((entero % 1_000_000) / 1_000);
  const res  = entero % 1_000;
  if (mill) t += (mill === 1 ? 'Un millón' : c(mill) + ' millones') + ' ';
  if (mil)  t += (mil  === 1 ? 'Mil'       : c(mil)  + ' mil')      + ' ';
  if (res)  t += c(res);
  if (!t)   t  = 'Cero';
  return t.trim() + (centavos ? ` con ${centavos}/100` : '');
}

// ─── Formatter DOP ───────────────────────────────────────────────────────────

const fmt = (n: number) =>
  'RD$' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Labels desde la fuente única (lib/pagos/metodos). 'Pago' si viene vacío.
const metodoLabelPDF = (m: string) => (m ? labelMetodo(m) : 'Pago');

/** Fecha YYYY-MM-DD → dd/MM/yyyy (sin desfase de zona). */
const fmtFechaPDF = (f?: string | null) => {
  if (!f) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f;
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:        'Helvetica',
    fontSize:          9,
    backgroundColor:   '#ffffff',
    // paddingTop generoso para que el contenido normal no tape el header fijo.
    // El header fijo ocupa ~90pt (logo/nombre ~60 + margen 8 + divider 1 + gap).
    // En p.1 el buyer row aparece después del header; en p.2+ la tabla sigue
    // justo después del header repetido.
    paddingTop:        58,
    paddingBottom:     72,   // espacio para el footer absoluto
    paddingHorizontal: 40,
    color:             '#1a1a1a',
  },

  // ── Watermark ──
  watermark: {
    position: 'absolute',
    top:      280,
    left:     60,
    right:    60,
    alignItems: 'center',
  },
  watermarkText: {
    fontFamily:  'Helvetica-Bold',
    fontSize:    108,
    color:       '#e8e8e8',
    letterSpacing: 4,
    transform:   'rotate(-30deg)',
  },

  // ── Header (fixed) ──
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   4,
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    width:      104,
    height:     38,
    objectFit:  'contain',
    marginBottom: 4,
  },
  emisorNombre: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   13,
    color:      '#1a1a1a',
    marginBottom: 2,
  },
  emisorMeta: {
    fontSize:     8.5,
    color:        '#444444',
    marginBottom: 1.5,
  },
  emisorMetaLabel: {
    fontFamily: 'Helvetica-Bold',
  },

  headerRight: {
    alignItems: 'flex-end',
    minWidth:   190,
  },
  tipoNombre: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   11,
    color:      '#1a1a1a',
    textAlign:  'right',
    marginBottom: 2,
  },
  ncfLabel: {
    fontSize:     8,
    color:        '#555555',
    textAlign:    'right',
    marginBottom: 1,
  },
  codigoFactura: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     13,
    color:        '#1a1a1a',
    textAlign:    'right',
    marginBottom: 2,
  },
  ncfValue: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     13,
    color:        '#1a1a1a',
    textAlign:    'right',
    marginBottom: 2,
  },
  ncfVenc: {
    fontSize:  8,
    color:     '#555555',
    textAlign: 'right',
  },

  // ── Divider ──
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    marginBottom:      6,
  },

  // ── Buyer row ──
  buyerRow: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    backgroundColor:  '#f5f5f5',
    paddingVertical:  8,
    paddingHorizontal: 10,
    marginBottom:     12,
  },
  buyerLeft: {
    flex: 1,
  },
  buyerField: {
    fontSize:     8.5,
    color:        '#1a1a1a',
    marginBottom: 2,
  },
  buyerLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  buyerRight: {
    alignItems:  'flex-end',
    minWidth:    160,
  },
  monedaText: {
    fontSize:     8.5,
    color:        '#1a1a1a',
    marginBottom: 3,
  },
  valorRestanteLabel: {
    fontSize:   8.5,
    color:      '#1a1a1a',
    marginBottom: 1,
  },
  valorRestanteValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   10,
    color:      '#1a1a1a',
  },

  // ── Tabla ──
  tableHeader: {
    flexDirection:    'row',
    backgroundColor:  '#e8e8e8',
    paddingVertical:  5,
    paddingHorizontal: 4,
    marginBottom:     1,
  },
  thCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   8,
    color:      '#1a1a1a',
  },
  tableRow: {
    flexDirection:    'row',
    paddingVertical:  5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e8e8',
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  tdCell: {
    fontSize: 8.5,
    color:    '#1a1a1a',
  },
  tdBold: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   8.5,
    color:      '#1a1a1a',
  },
  tdGray: {
    fontSize: 8,
    color:    '#666666',
  },

  // column widths
  colCant:   { width: 52,  textAlign: 'left'  },
  colDesc:   { flex: 3,                       },
  colUnidad: { width: 56,  textAlign: 'left'  },
  colPrecio: { width: 56,  textAlign: 'right' },
  colDesc2:  { width: 50,  textAlign: 'right' },
  colImp:    { width: 46,  textAlign: 'right' },
  colValor:  { width: 64,  textAlign: 'right' },
  colNum:    { width: 20,  textAlign: 'left'  },

  // COMPRADOR section
  compLabel: {
    fontSize:     8,
    color:        '#0f766e',
    fontFamily:   'Helvetica-Bold',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  buyerNombre: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     10,
    color:        '#1a1a1a',
  },

  // MONTO TOTAL row
  montoTotalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop:      2,
    width:          220,
  },
  montoTotalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   9,
    color:      '#ffffff',
  },
  montoTotalValor: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   9,
    color:      '#ffffff',
    textAlign:  'right',
    minWidth:   80,
  },

  // ── Bloques TOTALES / PAGO ──
  bloqueTitulo: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   7.5,
    color:      '#888888',
    letterSpacing: 0.5,
    marginBottom: 2,
    width:      220,
  },
  pagoResumen: {
    marginTop:     8,
    paddingTop:    6,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    width:         220,
  },
  saldoLabel: { fontFamily: 'Helvetica-Bold', color: '#b91c1c' },
  saldoValor: { fontFamily: 'Helvetica-Bold', color: '#b91c1c' },

  // ── Post-table ──
  postTable: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginTop:      6,
    marginBottom:   8,
  },
  postTableLeft: {
    flex: 1,
  },
  totalLineas: {
    fontSize:     8.5,
    color:        '#1a1a1a',
    marginBottom: 3,
  },
  montoLetras: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     9,
    color:        '#1a1a1a',
  },
  postTableRight: {
    minWidth:   220,
    alignItems: 'flex-end',
  },
  totalesRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    width:          220,
  },
  totalesLabel: {
    fontSize: 8.5,
    color:    '#555555',
  },
  totalesValor: {
    fontSize:     8.5,
    color:        '#1a1a1a',
    textAlign:    'right',
    minWidth:     80,
  },
  totalFinalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    paddingTop:     4,
    marginTop:      2,
    width:          220,
  },
  totalFinalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   10,
    color:      '#1a1a1a',
  },
  totalFinalValor: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   10,
    color:      '#1a1a1a',
    textAlign:  'right',
    minWidth:   80,
  },
  totalItems: {
    fontSize:  8,
    color:     '#555555',
    textAlign: 'right',
    marginTop: 4,
    width:     220,
  },

  // ── Pagos recibidos ──
  pagosBlock:    { marginTop: 12 },
  pagosTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#1a1a1a', marginBottom: 3 },
  pagosHeadRow:  { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#cccccc', paddingBottom: 2, marginBottom: 1 },
  pagosRow:      { flexDirection: 'row', paddingVertical: 1.5 },
  pagosCellHead: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: '#666666' },
  pagosCell:     { fontSize: 7.5, color: '#333333' },
  pagosColFecha:  { width: 60 },
  pagosColMetodo: { flex: 1 },
  pagosColMonto:  { width: 90, textAlign: 'right' },

  // ── Términos / Notas ──
  notasBlock:  { marginTop: 12 },
  notasTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#1a1a1a', marginBottom: 2 },
  notasText:   { fontSize: 8, color: '#555555', lineHeight: 1.4, marginBottom: 6 },

  // ── Pie de factura ──
  pieFactura: {
    fontSize:   8,
    color:      '#888888',
    textAlign:  'center',
    marginTop:  10,
    paddingTop: 8,
    borderTopWidth:  0.5,
    borderTopColor:  '#dddddd',
  },

  // ── Footer absoluto ──
  footer: {
    position:   'absolute',
    bottom:     24,
    left:       40,
    right:      40,
    borderTopWidth:  0.5,
    borderTopColor:  '#cccccc',
    paddingTop:      8,
  },
  footerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
  },
  footerOriginal: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   8,
    color:      '#1a1a1a',
  },
  footerCenter: {
    flex:      1,
    textAlign: 'center',
  },
  footerCenterText: {
    fontSize:  7,
    color:     '#aaaaaa',
    textAlign: 'center',
  },
  footerQr: {
    alignItems: 'flex-end',
  },
  qrImage: {
    width:  56,
    height: 56,
  },
  qrLabel: {
    fontSize:  6,
    color:     '#aaaaaa',
    textAlign: 'center',
    marginTop: 2,
  },
  codigoSeguridad: {
    fontSize:     7,
    color:        '#555555',
    marginBottom: 2,
  },

  // ─── Footer estilo DGII (QR + bloque verificación a la izquierda) ─────────
  dgiiFooter: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
    paddingTop:    4,
  },
  dgiiQr: {
    width:  68,
    height: 68,
  },
  dgiiInfoBlock: {
    flex:         1,
    paddingLeft:  2,
  },
  dgiiLabel: {
    fontSize: 7.5,
    color:    '#444444',
    marginBottom: 2,
  },
  dgiiUrl: {
    fontSize:    8.5,
    fontFamily:  'Helvetica-Bold',
    color:       '#0f766e',
    marginBottom: 4,
  },
  dgiiCodigoSeguridad: {
    fontSize:    8,
    fontFamily:  'Helvetica-Bold',
    color:       '#1a1a1a',
    marginTop:   3,
  },
  dgiiFechaFirma: {
    fontSize:  7.5,
    color:     '#666666',
    marginTop: 1,
  },
  dgiiRightText: {
    flex:      1,
    fontSize:  7,
    color:     '#888888',
    textAlign: 'right',
    alignSelf: 'flex-end',
    paddingBottom: 2,
  },
  dgiiSecondaryRow: {
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.3,
    borderTopColor: '#e5e5e5',
  },
});

// ─── Componente ───────────────────────────────────────────────────────────────

export function FacturaPDF({ data }: { data: FacturaPDFData }) {
  const moneda      = data.moneda ?? 'DOP';
  const itemsFmt    = data.items;
  // Mostrar NCF solo cuando hay un e-NCF real (no BOR-… ni sin-ncf)
  const tieneEncf   = Boolean(data.encf) && !data.encf.startsWith('BOR-');

  // Columnas opcionales
  const tieneUnidad    = itemsFmt.some(i => i.unidadMedida);
  const tieneDescuento = itemsFmt.some(i => {
    const base = i.cantidadItem * i.precioUnitarioItem;
    const desc = i.descuentoMonto ?? (i.descuentoPct ? base * i.descuentoPct / 100 : 0);
    return desc > 0;
  });
  const tieneItbis = itemsFmt.some(i => (i.tasaItbis ?? 0) > 0);
  const totalDescuento = itemsFmt.reduce((s, i) => {
    const base = i.cantidadItem * i.precioUnitarioItem;
    const desc = i.descuentoMonto ?? (i.descuentoPct ? base * i.descuentoPct / 100 : 0);
    return s + desc;
  }, 0);

  // Agrupar por tasa de ITBIS para mostrar "Gravado ITBIS X%"
  const ratesMap = new Map<number, { base: number; itbis: number }>();
  for (const item of itemsFmt) {
    const tasa = item.tasaItbis ?? 0;
    if (tasa > 0) {
      const base = item.cantidadItem * item.precioUnitarioItem;
      const desc = item.descuentoMonto ?? (item.descuentoPct ? base * item.descuentoPct / 100 : 0);
      const neto = base - desc;
      const itbisAmt = neto * tasa;
      const existing = ratesMap.get(tasa) ?? { base: 0, itbis: 0 };
      ratesMap.set(tasa, { base: existing.base + neto, itbis: existing.itbis + itbisAmt });
    }
  }
  const ratesArray = Array.from(ratesMap.entries());

  // ── Totales fiscales (no mezclar con la situación de pago) ──
  const subtotalGravado = ratesArray.reduce((s, [, v]) => s + v.base, 0);
  const subtotalExento  = itemsFmt.reduce((s, i) => {
    const tasa = i.tasaItbis ?? 0;
    if (tasa > 0) return s;
    const base = i.cantidadItem * i.precioUnitarioItem;
    const desc = i.descuentoMonto ?? (i.descuentoPct ? base * i.descuentoPct / 100 : 0);
    return s + (base - desc);
  }, 0);

  // ── Situación de pago (separada de los totales fiscales) ──
  const saldoPendiente = data.saldo ?? data.montoTotal;
  const montoPagado    = Math.max(0, data.montoTotal - saldoPendiente);
  const hayPendiente   = saldoPendiente > 0.005;
  // Condición: Contado/Crédito + "Pago parcial" si abonó algo pero falta saldo.
  const esParcial      = montoPagado > 0.005 && hayPendiente;
  const condicionPago  = esParcial
    ? `${data.tipoPagoNombre} · Pago parcial`
    : data.tipoPagoNombre;
  // Formas de pago usadas (distintos métodos del historial).
  const formasPago = data.pagos && data.pagos.length > 0
    ? [...new Set(data.pagos.map(p => metodoLabelPDF(p.metodo)))].join(' / ')
    : null;

  return (
    <Document
      title={`Factura ${data.encf}`}
      author={data.emisor.razonSocial}
      subject="Comprobante Fiscal Electrónico"
    >
      <Page size="A4" style={S.page}>

        {/* ── Header (fixed → se repite en cada página) ── */}
        <View style={S.header} fixed>
          {/* Izquierda: logo/nombre + metadatos */}
          <View style={S.headerLeft}>
            {data.emisor.logo ? (
              <Image style={S.logo} src={data.emisor.logo} />
            ) : (
              <Text style={S.emisorNombre}>
                {data.emisor.nombreComercial ?? data.emisor.razonSocial}
              </Text>
            )}
            {data.emisor.logo && (
              <Text style={S.emisorNombre}>
                {data.emisor.nombreComercial ?? data.emisor.razonSocial}
              </Text>
            )}
            {data.sucursal && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>Sucursal: </Text>{data.sucursal}
              </Text>
            )}
            {data.fechaVencimientoFactura && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>Vencimiento de la factura </Text>{data.fechaVencimientoFactura}
              </Text>
            )}
            {data.emisor.rnc && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>RNC: </Text>{data.emisor.rnc}
              </Text>
            )}
            {data.emisor.direccion && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>Dirección: </Text>{data.emisor.direccion}
              </Text>
            )}
            {data.emisor.telefono && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>Tel: </Text>{data.emisor.telefono}
              </Text>
            )}
          </View>

          {/* Derecha: tipo + codigo (13pt) + NCF grande + fecha + pago */}
          <View style={S.headerRight}>
            <Text style={S.tipoNombre}>{data.tipoEcfNombre.toUpperCase()}</Text>
            {data.codigo && (
              <Text style={S.codigoFactura}>{data.codigo}</Text>
            )}
            {tieneEncf && (
              <Text style={S.ncfValue}>{data.encf}</Text>
            )}
            <Text style={S.ncfVenc}>Fecha: {data.fechaEmision}</Text>
            <Text style={S.ncfVenc}>Pago: {data.tipoPagoNombre}</Text>
            {data.fechaVencimientoNcf && (
              <Text style={S.ncfVenc}>Vencimiento NCF: {data.fechaVencimientoNcf}</Text>
            )}
          </View>
        </View>

        {/* ── Línea divisora (fixed junto al header) ── */}
        <View style={S.divider} fixed />

        {/* ── Datos del cliente (solo página 1 — sin fixed) ── */}
        <View style={S.buyerRow}>
          <View style={S.buyerLeft}>
            <Text style={S.compLabel}>CLIENTE</Text>
            <Text style={S.buyerNombre}>
              {data.comprador.razonSocial || 'Consumidor Final'}
            </Text>
            {data.comprador.rnc ? (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>RNC/Cédula: </Text>{data.comprador.rnc}
              </Text>
            ) : null}
            {data.comprador.telefono ? (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>Tel: </Text>{data.comprador.telefono}
              </Text>
            ) : null}
            {data.comprador.email ? (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>Email: </Text>{data.comprador.email}
              </Text>
            ) : null}
          </View>
          <View style={S.buyerRight}>
            <Text style={S.buyerField}>
              <Text style={S.buyerLabel}>Moneda: </Text>{moneda}
            </Text>
            {(() => {
              const saldo = data.saldo ?? data.montoTotal;
              if (saldo <= 0) {
                return <Text style={[S.valorRestanteLabel, { color: '#16a34a', fontFamily: 'Helvetica-Bold' }]}>PAGADA</Text>;
              }
              return (
                <Text style={S.buyerField}>
                  <Text style={S.buyerLabel}>Saldo: </Text>{fmt(saldo)}
                </Text>
              );
            })()}
          </View>
        </View>

        {/* ── Tabla de ítems ── */}
        {/* Encabezado de columnas (fixed → se repite en cada página) */}
        <View style={S.tableHeader} fixed>
          <Text style={[S.thCell, S.colNum]}>#</Text>
          <Text style={[S.thCell, S.colDesc]}>DESCRIPCION</Text>
          {tieneUnidad && <Text style={[S.thCell, S.colUnidad]}>UNIDAD</Text>}
          <Text style={[S.thCell, S.colCant]}>CANT</Text>
          <Text style={[S.thCell, S.colPrecio]}>PRECIO</Text>
          {tieneItbis && <Text style={[S.thCell, S.colImp]}>ITBIS</Text>}
          <Text style={[S.thCell, S.colValor]}>TOTAL</Text>
        </View>

        {/* Filas */}
        {itemsFmt.map((item, idx) => {
          const tasa   = item.tasaItbis ?? 0;
          const base   = item.cantidadItem * item.precioUnitarioItem;
          const desc   = item.descuentoMonto ?? (item.descuentoPct ? base * item.descuentoPct / 100 : 0);
          const neto   = base - desc;
          const valor  = neto + neto * tasa;
          const impStr = tasa > 0 ? `${(tasa * 100).toFixed(0)}%` : 'Exento';
          const descStr = desc > 0 ? fmt(desc) : '';

          const itbisAmt = neto * tasa;
          return (
            <View key={idx} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}>
              <Text style={[S.tdCell, S.colNum]}>{idx + 1}</Text>
              <View style={S.colDesc}>
                <Text style={S.tdBold}>
                  {item.dependienteNombre ? `${item.dependienteNombre} - ${item.nombreItem}` : item.nombreItem}
                </Text>
                {item.referencia ? <Text style={S.tdGray}>Ref: {item.referencia}</Text> : null}
                {item.descripcionItem ? <Text style={S.tdGray}>{item.descripcionItem}</Text> : null}
              </View>
              {tieneUnidad && <Text style={[S.tdCell, S.colUnidad]}>{item.unidadMedida ?? ''}</Text>}
              <Text style={[S.tdCell, S.colCant]}>{item.cantidadItem}</Text>
              <Text style={[S.tdCell, S.colPrecio]}>{fmt(item.precioUnitarioItem)}</Text>
              {tieneItbis && <Text style={[S.tdCell, S.colImp]}>{itbisAmt > 0 ? fmt(itbisAmt) : 'Exento'}</Text>}
              <Text style={[S.tdCell, S.colValor]}>{fmt(valor)}</Text>
            </View>
          );
        })}

        {/* ── Post-tabla: lineas + totales ── */}
        <View style={S.postTable}>
          <View style={S.postTableLeft} />

          <View style={S.postTableRight}>
            {/* ── TOTALES (solo fiscal) ── */}
            <Text style={S.bloqueTitulo}>TOTALES</Text>
            {subtotalGravado > 0 && (
              <View style={S.totalesRow}>
                <Text style={S.totalesLabel}>Subtotal gravado:</Text>
                <Text style={S.totalesValor}>{fmt(subtotalGravado)}</Text>
              </View>
            )}
            {subtotalExento > 0 && (
              <View style={S.totalesRow}>
                <Text style={S.totalesLabel}>Subtotal exento:</Text>
                <Text style={S.totalesValor}>{fmt(subtotalExento)}</Text>
              </View>
            )}
            {ratesArray.map(([tasa, { itbis }]) => (
              <View style={S.totalesRow} key={tasa}>
                <Text style={S.totalesLabel}>ITBIS {(tasa * 100).toFixed(0)}%:</Text>
                <Text style={S.totalesValor}>{fmt(itbis)}</Text>
              </View>
            ))}
            <View style={S.montoTotalRow}>
              <Text style={S.montoTotalLabel}>Total factura:</Text>
              <Text style={S.montoTotalValor}>{fmt(data.montoTotal)}</Text>
            </View>

            {/* ── PAGO (situación de cobro, separada del total fiscal) ── */}
            {(hayPendiente || montoPagado > 0.005) && (
              <View style={S.pagoResumen}>
                <Text style={S.bloqueTitulo}>PAGO</Text>
                <View style={S.totalesRow}>
                  <Text style={S.totalesLabel}>Condición:</Text>
                  <Text style={S.totalesValor}>{condicionPago}</Text>
                </View>
                {formasPago && (
                  <View style={S.totalesRow}>
                    <Text style={S.totalesLabel}>Forma de pago:</Text>
                    <Text style={S.totalesValor}>{formasPago}</Text>
                  </View>
                )}
                <View style={S.totalesRow}>
                  <Text style={S.totalesLabel}>Monto pagado:</Text>
                  <Text style={S.totalesValor}>{fmt(montoPagado)}</Text>
                </View>
                {hayPendiente && (
                  <View style={S.totalesRow}>
                    <Text style={[S.totalesLabel, S.saldoLabel]}>Balance pendiente:</Text>
                    <Text style={[S.totalesValor, S.saldoValor]}>{fmt(saldoPendiente)}</Text>
                  </View>
                )}
                {hayPendiente && data.fechaVencimientoFactura && (
                  <View style={S.totalesRow}>
                    <Text style={S.totalesLabel}>Fecha de vencimiento:</Text>
                    <Text style={S.totalesValor}>{data.fechaVencimientoFactura}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── Pagos recibidos (historial con fecha) ── */}
        {data.pagos && data.pagos.length > 0 && (
          <View style={S.pagosBlock}>
            <Text style={S.pagosTitle}>PAGOS RECIBIDOS</Text>
            {/* Encabezado */}
            <View style={S.pagosHeadRow}>
              <Text style={[S.pagosCellHead, S.pagosColFecha]}>FECHA</Text>
              <Text style={[S.pagosCellHead, S.pagosColMetodo]}>MÉTODO</Text>
              <Text style={[S.pagosCellHead, S.pagosColMonto]}>MONTO</Text>
            </View>
            {data.pagos.map((p, i) => (
              <View key={i} style={S.pagosRow}>
                <Text style={[S.pagosCell, S.pagosColFecha]}>{fmtFechaPDF(p.fecha)}</Text>
                <Text style={[S.pagosCell, S.pagosColMetodo]}>
                  {metodoLabelPDF(p.metodo)}{p.referencia ? ` · ${p.referencia}` : ''}
                </Text>
                <Text style={[S.pagosCell, S.pagosColMonto]}>{fmt(p.montoDOP)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Términos y condiciones / Notas (solo si existen) ── */}
        {(data.terminosCondiciones?.trim() || data.notas?.trim()) && (
          <View style={S.notasBlock}>
            {data.terminosCondiciones?.trim() && (
              <>
                <Text style={S.notasTitle}>TÉRMINOS Y CONDICIONES:</Text>
                <Text style={S.notasText}>{data.terminosCondiciones}</Text>
              </>
            )}
            {data.notas?.trim() && (
              <>
                <Text style={S.notasTitle}>NOTAS:</Text>
                <Text style={S.notasText}>{data.notas}</Text>
              </>
            )}
          </View>
        )}

        {/* ── Pie de factura (solo si existe) ── */}
        {data.pieFactura?.trim() && (
          <Text style={S.pieFactura}>{data.pieFactura}</Text>
        )}

        {/* ── Footer ──
           Solo se muestra el bloque DGII (QR + verificación) cuando el e-CF fue
           emitido y tiene codigoSeguridad o urlVerificacion.
           Si la factura no tiene eCF, el footer queda en blanco. */}
        <View style={S.footer} fixed>
          {(data.codigoSeguridad || data.qrDataUrl) && (
            <>
              <View style={S.dgiiFooter}>
                {/* Izquierda: QR */}
                {data.qrDataUrl ? (
                  <Image style={S.dgiiQr} src={data.qrDataUrl} />
                ) : (
                  <View style={S.dgiiQr} />
                )}

                {/* Centro: bloque verificación URL */}
                <View style={S.dgiiInfoBlock}>
                  <Text style={S.dgiiLabel}>Verifique este comprobante en el portal de la DGII:</Text>
                  <Text style={S.dgiiUrl}>ecf.dgii.gov.do</Text>
                </View>

                {/* Derecha: texto validez */}
                <Text style={S.dgiiRightText}>
                  Este comprobante fiscal electrónico (e-CF) tiene plena validez
                </Text>
              </View>

              {/* Row 2: Código Seguridad + Fecha Firma debajo del QR */}
              {(data.codigoSeguridad || data.fechaFirma) && (
                <View style={S.dgiiSecondaryRow}>
                  {data.codigoSeguridad && (
                    <Text style={S.dgiiCodigoSeguridad}>Código de Seguridad: {data.codigoSeguridad}</Text>
                  )}
                  {data.fechaFirma && (
                    <Text style={S.dgiiFechaFirma}>Fecha de Firma Digital: {data.fechaFirma}</Text>
                  )}
                </View>
              )}
            </>
          )}
        </View>

      </Page>
    </Document>
  );
}
