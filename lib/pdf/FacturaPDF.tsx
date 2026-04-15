/**
 * Template PDF de Factura Electrónica EmiteDO — estilo Alegra
 * Usa @react-pdf/renderer — solo en API routes (Node.js), nunca en client components.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ItemPDF {
  nombreItem:          string;
  descripcionItem?:    string;
  cantidadItem:        number;
  precioUnitarioItem:  number;   // en DOP
  descuentoMonto?:     number;
  descuentoPct?:       number;
  unidadMedida?:       string;
  tasaItbis?:          number;   // 0.18, 0.16, 0 = exento/undefined
  subtotalConItbis:    number;   // en DOP
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
  firma?:            string;
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

  emisor:    EmisorPDF;
  comprador: CompradorPDF;
  items:     ItemPDF[];

  subtotal:    number;
  totalItbis:  number;
  montoTotal:  number;

  qrDataUrl?:  string;
  pieFactura?: string | null;
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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:        'Helvetica',
    fontSize:          9,
    backgroundColor:   '#ffffff',
    paddingTop:        36,
    paddingBottom:     56,
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

  // ── Header ──
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   12,
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    width:      130,
    height:     50,
    objectFit:  'contain',
    marginBottom: 6,
  },
  emisorNombre: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   16,
    color:      '#1a1a1a',
    marginBottom: 3,
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
  ncfValue: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     16,
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
    marginBottom:      10,
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
  colCant:   { width: 34,  textAlign: 'left'  },
  colDesc:   { flex: 3,                       },
  colUnidad: { width: 56,  textAlign: 'left'  },
  colPrecio: { width: 56,  textAlign: 'right' },
  colDesc2:  { width: 50,  textAlign: 'right' },
  colImp:    { width: 46,  textAlign: 'right' },
  colValor:  { width: 64,  textAlign: 'right' },

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
    minWidth:   190,
    alignItems: 'flex-end',
  },
  totalesRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    width:          190,
  },
  totalesLabel: {
    fontSize: 8.5,
    color:    '#555555',
  },
  totalesValor: {
    fontSize:     8.5,
    color:        '#1a1a1a',
    textAlign:    'right',
    minWidth:     70,
  },
  totalFinalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    paddingTop:     4,
    marginTop:      2,
    width:          190,
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
    minWidth:   70,
  },
  totalItems: {
    fontSize:  8,
    color:     '#555555',
    textAlign: 'right',
    marginTop: 4,
    width:     190,
  },

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
});

// ─── Componente ───────────────────────────────────────────────────────────────

export function FacturaPDF({ data }: { data: FacturaPDFData }) {
  const moneda   = data.moneda ?? 'DOP';
  const itemsFmt = data.items;
  const totalItems = itemsFmt.reduce((s, i) => s + i.cantidadItem, 0);

  return (
    <Document
      title={`Factura ${data.encf}`}
      author={data.emisor.razonSocial}
      subject="Comprobante Fiscal Electrónico"
    >
      <Page size="A4" style={S.page}>

        {/* ── Watermark BORRADOR ── */}
        {(data.esBorrador || data.estado === 'BORRADOR') && (
          <View style={S.watermark} fixed>
            <Text style={S.watermarkText}>BORRADOR</Text>
          </View>
        )}

        {/* ── Header ── */}
        <View style={S.header}>
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
            <Text style={S.emisorMeta}>
              <Text style={S.emisorMetaLabel}>Fecha de creación: </Text>{data.fechaEmision}
            </Text>
            {data.fechaVencimientoFactura && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>Vencimiento de la factura </Text>{data.fechaVencimientoFactura}
              </Text>
            )}
            {data.emisor.rnc && (
              <Text style={S.emisorMeta}>
                <Text style={S.emisorMetaLabel}>RNC emisor: </Text>{data.emisor.rnc}
              </Text>
            )}
          </View>

          {/* Derecha: tipo + NCF */}
          <View style={S.headerRight}>
            <Text style={S.tipoNombre}>{data.tipoEcfNombre}</Text>
            <Text style={S.ncfLabel}>NCF</Text>
            <Text style={S.ncfValue}>{data.encf}</Text>
            {data.fechaVencimientoNcf && (
              <Text style={S.ncfVenc}>Vencimiento NCF: {data.fechaVencimientoNcf}</Text>
            )}
          </View>
        </View>

        {/* ── Línea divisora ── */}
        <View style={S.divider} />

        {/* ── Datos del comprador ── */}
        <View style={S.buyerRow}>
          <View style={S.buyerLeft}>
            {data.comprador.razonSocial ? (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>Cliente: </Text>{data.comprador.razonSocial}
              </Text>
            ) : (
              <Text style={S.buyerField}><Text style={S.buyerLabel}>Cliente: </Text>Consumidor Final</Text>
            )}
            <Text style={S.buyerField}>
              <Text style={S.buyerLabel}>RNC: </Text>{data.comprador.rnc ?? ''}
            </Text>
            <Text style={S.buyerField}>
              <Text style={S.buyerLabel}>Teléfono: </Text>{data.comprador.telefono ?? ''}
            </Text>
            {data.comprador.email && (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>Email: </Text>{data.comprador.email}
              </Text>
            )}
          </View>
          <View style={S.buyerRight}>
            <Text style={S.monedaText}>
              <Text style={S.buyerLabel}>Moneda: </Text>{moneda}
            </Text>
            <Text style={S.valorRestanteLabel}>Valor restante por pagar:</Text>
            <Text style={S.valorRestanteValue}>{fmt(data.montoTotal)}</Text>
          </View>
        </View>

        {/* ── Tabla de ítems ── */}
        {/* Encabezado */}
        <View style={S.tableHeader}>
          <Text style={[S.thCell, S.colCant]}>Cantidad</Text>
          <Text style={[S.thCell, S.colDesc]}>Descripción</Text>
          <Text style={[S.thCell, S.colUnidad]}>Unidad de{'\n'}medida</Text>
          <Text style={[S.thCell, S.colPrecio]}>Precio</Text>
          <Text style={[S.thCell, S.colDesc2]}>Descuento</Text>
          <Text style={[S.thCell, S.colImp]}>Impuesto</Text>
          <Text style={[S.thCell, S.colValor]}>Valor</Text>
        </View>

        {/* Filas */}
        {itemsFmt.map((item, idx) => {
          const tasa   = item.tasaItbis ?? 0;
          const base   = item.cantidadItem * item.precioUnitarioItem;
          const desc   = item.descuentoMonto ?? (item.descuentoPct ? base * item.descuentoPct / 100 : 0);
          const neto   = base - desc;
          const valor  = neto + neto * tasa;
          const impStr = tasa > 0 ? `${(tasa * 100).toFixed(0)}%` : 'E';
          const descStr = desc > 0 ? fmt(desc) : '';

          return (
            <View key={idx} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}>
              <Text style={[S.tdCell, S.colCant]}>{item.cantidadItem}</Text>
              <View style={S.colDesc}>
                <Text style={S.tdBold}>{item.nombreItem}</Text>
                {item.descripcionItem ? <Text style={S.tdGray}>{item.descripcionItem}</Text> : null}
              </View>
              <Text style={[S.tdCell, S.colUnidad]}>{item.unidadMedida ?? ''}</Text>
              <Text style={[S.tdCell, S.colPrecio]}>{fmt(item.precioUnitarioItem)}</Text>
              <Text style={[S.tdCell, S.colDesc2]}>{descStr}</Text>
              <Text style={[S.tdCell, S.colImp]}>{impStr}</Text>
              <Text style={[S.tdCell, S.colValor]}>{fmt(item.subtotalConItbis)}</Text>
            </View>
          );
        })}

        {/* ── Post-tabla: lineas + totales ── */}
        <View style={S.postTable}>
          <View style={S.postTableLeft}>
            <Text style={S.totalLineas}>
              Total de lineas: {itemsFmt.length}
            </Text>
            <Text style={S.montoLetras}>{numeroALetras(data.montoTotal)}</Text>
          </View>

          <View style={S.postTableRight}>
            <View style={S.totalesRow}>
              <Text style={S.totalesLabel}>SUBTOTAL</Text>
              <Text style={S.totalesValor}>{fmt(data.subtotal)}</Text>
            </View>
            {data.totalItbis > 0 && (
              <View style={S.totalesRow}>
                <Text style={S.totalesLabel}>ITBIS</Text>
                <Text style={S.totalesValor}>{fmt(data.totalItbis)}</Text>
              </View>
            )}
            <View style={S.totalFinalRow}>
              <Text style={S.totalFinalLabel}>Total</Text>
              <Text style={S.totalFinalValor}>{fmt(data.montoTotal)}</Text>
            </View>
            <Text style={S.totalItems}>Total de items: {totalItems}</Text>
          </View>
        </View>

        {/* ── Pie de factura ── */}
        {data.pieFactura && (
          <Text style={S.pieFactura}>{data.pieFactura}</Text>
        )}

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <View style={S.footerRow}>
            {/* Izquierda: Original */}
            <Text style={S.footerOriginal}>Original: Cliente</Text>

            {/* Centro: branding */}
            <View style={S.footerCenter}>
              <Text style={S.footerCenterText}>
                Generado en www.emitedo.com — Facturación electrónica DGII República Dominicana
              </Text>
              {data.codigoSeguridad && (
                <Text style={S.codigoSeguridad}>
                  Código de seguridad: {data.codigoSeguridad}
                </Text>
              )}
              {data.trackId && (
                <Text style={[S.footerCenterText, { marginTop: 1 }]}>
                  Track ID: {data.trackId}
                </Text>
              )}
            </View>

            {/* Derecha: QR */}
            {data.qrDataUrl ? (
              <View style={S.footerQr}>
                <Image style={S.qrImage} src={data.qrDataUrl} />
                <Text style={S.qrLabel}>Validar en DGII</Text>
              </View>
            ) : (
              data.emisor.firma ? (
                <View style={S.footerQr}>
                  <Image style={{ width: 56, height: 28, objectFit: 'contain' }} src={data.emisor.firma} />
                </View>
              ) : <View style={{ width: 56 }} />
            )}
          </View>
        </View>

      </Page>
    </Document>
  );
}
