/**
 * Template PDF de Cotización — Zero
 * Mismo layout A4 que FacturaPDF.tsx, sin NCF/QR/DGII.
 * Muestra "Válida hasta {vencimiento}" en la cabecera derecha.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ItemCotizacionPDF {
  descripcion:  string;
  precio:       number; // DOP
  cantidad:     number;
  total:        number; // DOP
}

export interface CotizacionPDFData {
  numero:     string;
  estado:     string;
  fechaEmision:  string;
  fechaVencimiento?: string;

  emisor: {
    razonSocial:      string;
    nombreComercial?: string;
    rnc?:             string;
    direccion?:       string;
    telefono?:        string;
    sitioWeb?:        string;
    emailFacturacion?: string;
    logo?:            string;
    colorPrimario?:   string;
  };

  comprador: {
    razonSocial?: string;
    rnc?:         string;
    email?:       string;
  };

  items:     ItemCotizacionPDF[];
  subtotal:  number;
  montoTotal: number;

  notas?:               string | null;
  terminosCondiciones?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const fmt = (n: number) =>
  'RD$' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:        'Helvetica',
    fontSize:          9,
    backgroundColor:   '#ffffff',
    paddingTop:        110,
    paddingBottom:     60,
    paddingHorizontal: 40,
    color:             '#1a1a1a',
  },

  // ── Watermark BORRADOR ──
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
    marginBottom:   8,
  },
  headerLeft: { flex: 1 },
  logo: {
    width:        130,
    height:       50,
    objectFit:    'contain',
    marginBottom: 6,
  },
  emisorNombre: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     16,
    color:        '#1a1a1a',
    marginBottom: 3,
  },
  emisorMeta: {
    fontSize:     8.5,
    color:        '#444444',
    marginBottom: 1.5,
  },
  emisorMetaLabel: { fontFamily: 'Helvetica-Bold' },

  headerRight: {
    alignItems: 'flex-end',
    minWidth:   190,
  },
  tipoNombre: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     14,
    color:        '#1a1a1a',
    textAlign:    'right',
    marginBottom: 2,
  },
  cotNumLabel: {
    fontSize:     8,
    color:        '#555555',
    textAlign:    'right',
    marginBottom: 1,
  },
  cotNumValue: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     16,
    color:        '#1a1a1a',
    textAlign:    'right',
    marginBottom: 2,
  },
  cotVenc: {
    fontSize:  8,
    color:     '#0f766e',
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
  },

  // ── Divider ──
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    marginBottom:      10,
  },

  // ── Buyer row ──
  buyerRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    backgroundColor:   '#f5f5f5',
    paddingVertical:   8,
    paddingHorizontal: 10,
    marginBottom:      12,
  },
  buyerLeft:  { flex: 1 },
  buyerField: { fontSize: 8.5, color: '#1a1a1a', marginBottom: 2 },
  buyerLabel: { fontFamily: 'Helvetica-Bold' },
  buyerRight: { alignItems: 'flex-end', minWidth: 160 },
  totalLabel: { fontSize: 8.5, color: '#1a1a1a', marginBottom: 1 },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#1a1a1a' },

  // ── Tabla ──
  tableHeader: {
    flexDirection:     'row',
    backgroundColor:   '#e8e8e8',
    paddingVertical:   5,
    paddingHorizontal: 4,
    marginBottom:      1,
  },
  thCell:   { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#1a1a1a' },
  tableRow: {
    flexDirection:     'row',
    paddingVertical:   5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e8e8',
  },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tdCell: { fontSize: 8.5, color: '#1a1a1a' },
  tdBold: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#1a1a1a' },

  // column widths
  colCant:   { width: 40,  textAlign: 'left' },
  colDesc:   { flex: 3 },
  colPrecio: { width: 80, textAlign: 'right' },
  colValor:  { width: 80, textAlign: 'right' },

  // ── Post-table ──
  postTable: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginTop:      6,
    marginBottom:   8,
  },
  postTableLeft:  { flex: 1 },
  totalLineas:    { fontSize: 8.5, color: '#1a1a1a', marginBottom: 3 },
  montoLetras:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#1a1a1a' },
  postTableRight: { minWidth: 190, alignItems: 'flex-end' },
  totalesRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    width:          190,
  },
  totalesLabel: { fontSize: 8.5, color: '#555555' },
  totalesValor: { fontSize: 8.5, color: '#1a1a1a', textAlign: 'right', minWidth: 70 },
  totalFinalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    paddingTop:     4,
    marginTop:      2,
    width:          190,
  },
  totalFinalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#1a1a1a' },
  totalFinalValor: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#1a1a1a', textAlign: 'right', minWidth: 70 },

  // ── Notas / Términos ──
  notasSection: {
    marginTop:      10,
    paddingTop:     8,
    borderTopWidth: 0.5,
    borderTopColor: '#dddddd',
  },
  notasTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#1a1a1a', marginBottom: 3 },
  notasText:  { fontSize: 8, color: '#555555', lineHeight: 1.5 },

  // ── Footer ──
  footer: {
    position:   'absolute',
    bottom:     24,
    left:       40,
    right:      40,
    borderTopWidth:  0.5,
    borderTopColor:  '#cccccc',
    paddingTop:      8,
    flexDirection:   'row',
    justifyContent:  'space-between',
  },
  footerLeft:  { fontSize: 7, color: '#aaaaaa' },
  footerRight: { fontSize: 7, color: '#aaaaaa', textAlign: 'right' },
});

// ─── Componente ───────────────────────────────────────────────────────────────

export function CotizacionPDF({ data }: { data: CotizacionPDFData }) {
  const esBorrador = data.estado === 'borrador';

  return (
    <Document
      title={`Cotización ${data.numero}`}
      author={data.emisor.razonSocial}
      subject="Cotización — Zero"
    >
      <Page size="A4" style={S.page}>

        {/* ── Watermark BORRADOR ── */}
        {esBorrador && (
          <View style={S.watermark} fixed>
            <Text style={S.watermarkText}>BORRADOR</Text>
          </View>
        )}

        {/* ── Header (fixed) ── */}
        <View style={S.header} fixed>
          {/* Izquierda */}
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
            <Text style={S.emisorMeta}>
              <Text style={S.emisorMetaLabel}>Fecha: </Text>{data.fechaEmision}
            </Text>
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

          {/* Derecha */}
          <View style={S.headerRight}>
            <Text style={S.tipoNombre}>COTIZACIÓN</Text>
            <Text style={S.cotNumLabel}>No.</Text>
            <Text style={S.cotNumValue}>{data.numero}</Text>
            {data.fechaVencimiento && (
              <Text style={S.cotVenc}>Válida hasta {data.fechaVencimiento}</Text>
            )}
          </View>
        </View>

        {/* ── Divisor (fixed) ── */}
        <View style={S.divider} fixed />

        {/* ── Datos del comprador ── */}
        <View style={S.buyerRow}>
          <View style={S.buyerLeft}>
            {data.comprador.razonSocial ? (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>Cliente: </Text>{data.comprador.razonSocial}
              </Text>
            ) : (
              <Text style={S.buyerField}><Text style={S.buyerLabel}>Cliente: </Text>Sin especificar</Text>
            )}
            {data.comprador.rnc && (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>RNC: </Text>{data.comprador.rnc}
              </Text>
            )}
            {data.comprador.email && (
              <Text style={S.buyerField}>
                <Text style={S.buyerLabel}>Email: </Text>{data.comprador.email}
              </Text>
            )}
          </View>
          <View style={S.buyerRight}>
            <Text style={S.totalLabel}>Total estimado:</Text>
            <Text style={S.totalValue}>{fmt(data.montoTotal)}</Text>
          </View>
        </View>

        {/* ── Tabla de ítems (header fixed) ── */}
        <View style={S.tableHeader} fixed>
          <Text style={[S.thCell, S.colCant]}>Cantidad</Text>
          <Text style={[S.thCell, S.colDesc]}>Descripción</Text>
          <Text style={[S.thCell, S.colPrecio]}>Precio unit.</Text>
          <Text style={[S.thCell, S.colValor]}>Valor</Text>
        </View>

        {data.items.map((item, idx) => (
          <View key={idx} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}>
            <Text style={[S.tdCell, S.colCant]}>{item.cantidad}</Text>
            <Text style={[S.tdBold, S.colDesc]}>{item.descripcion}</Text>
            <Text style={[S.tdCell, S.colPrecio]}>{fmt(item.precio)}</Text>
            <Text style={[S.tdCell, S.colValor]}>{fmt(item.total)}</Text>
          </View>
        ))}

        {/* ── Post-tabla ── */}
        <View style={S.postTable}>
          <View style={S.postTableLeft}>
            <Text style={S.totalLineas}>Total de lineas: {data.items.length}</Text>
            <Text style={S.montoLetras}>{numeroALetras(data.montoTotal)}</Text>
          </View>
          <View style={S.postTableRight}>
            <View style={S.totalesRow}>
              <Text style={S.totalesLabel}>SUBTOTAL</Text>
              <Text style={S.totalesValor}>{fmt(data.subtotal)}</Text>
            </View>
            <View style={S.totalFinalRow}>
              <Text style={S.totalFinalLabel}>Total</Text>
              <Text style={S.totalFinalValor}>{fmt(data.montoTotal)}</Text>
            </View>
          </View>
        </View>

        {/* ── Notas ── */}
        {data.notas && (
          <View style={S.notasSection}>
            <Text style={S.notasTitle}>Notas</Text>
            <Text style={S.notasText}>{data.notas}</Text>
          </View>
        )}

        {/* ── Términos y condiciones ── */}
        {data.terminosCondiciones && (
          <View style={S.notasSection}>
            <Text style={S.notasTitle}>Términos y condiciones</Text>
            <Text style={S.notasText}>{data.terminosCondiciones}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerLeft}>Generado por Zero</Text>
          <Text style={S.footerRight}>
            Esta cotización no es un comprobante fiscal
          </Text>
        </View>

      </Page>
    </Document>
  );
}
