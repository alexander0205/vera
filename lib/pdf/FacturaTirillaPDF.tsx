/**
 * Template PDF de Factura Electrónica EmiteDO — formato tirilla térmica 80mm.
 *
 * Diseñado para impresoras térmicas tipo Bematech / Star / Epson TM
 * (papel de 80mm de ancho, altura variable, monoespaciado).
 *
 * Usa @react-pdf/renderer — solo en API routes (Node.js).
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { FacturaPDFData, ItemPDF } from './FacturaPDF';

// ─── Constantes de layout ─────────────────────────────────────────────────────
// 80mm ≈ 226.77pt; usamos 226 con padding interior para márgenes.
const PAGE_WIDTH_MM = '80mm' as const;
// El contenido se imprime monoespaciado dentro de ~32 chars de ancho útil a 9pt.
const CHARS_WIDTH = 32;

// ─── Formatter DOP (sin símbolo, para alinear columnas) ──────────────────────

const fmt = (n: number) =>
  n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Truncar texto a un máximo de caracteres
function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Padding manual para alinear como tirilla térmica
function padLeft(s: string, width: number): string {
  const t = String(s);
  return t.length >= width ? t : ' '.repeat(width - t.length) + t;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:        'Courier',
    fontSize:          9,
    backgroundColor:   '#ffffff',
    paddingTop:        8,
    paddingBottom:     12,
    paddingHorizontal: 8,
    color:             '#000000',
  },

  center: { textAlign: 'center' },
  bold:   { fontFamily: 'Courier-Bold' },

  // Header / empresa
  companyName: {
    fontFamily:   'Courier-Bold',
    fontSize:     11,
    textAlign:    'center',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  companyMeta: {
    fontSize:     8,
    textAlign:    'center',
    marginBottom: 1,
  },

  logo: {
    width:      80,
    height:     30,
    objectFit:  'contain',
    alignSelf:  'center',
    marginBottom: 3,
  },

  // Línea divisora
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    borderStyle:       'dashed',
    marginVertical:    4,
  },

  // Banner tipo
  banner: {
    fontFamily:   'Courier-Bold',
    fontSize:     10,
    textAlign:    'center',
    marginVertical: 2,
  },

  // Texto general
  text: {
    fontSize:    9,
    lineHeight:  1.3,
  },

  textSmall: {
    fontSize:    8,
    lineHeight:  1.3,
  },

  textBold: {
    fontFamily: 'Courier-Bold',
    fontSize:   9,
  },

  // Filas key:value
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    fontSize:       9,
  },

  rowBold: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    fontFamily:     'Courier-Bold',
    fontSize:       10,
    marginTop:      2,
  },

  // Header tabla items
  itemsHeader: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    fontFamily:       'Courier-Bold',
    fontSize:         8,
    paddingBottom:    1,
  },

  // Item line
  itemDesc: {
    fontSize:    9,
    lineHeight:  1.25,
  },
  itemMath: {
    fontSize:    8,
    lineHeight:  1.25,
    color:       '#222222',
  },

  // QR
  qrWrap: {
    alignItems:   'center',
    marginVertical: 4,
  },
  qrImage: {
    width:  90,
    height: 90,
  },

  // Estado (badge texto)
  estado: {
    fontFamily: 'Courier-Bold',
    fontSize:   9,
    textAlign:  'center',
    marginTop:  2,
  },
});

// ─── Helpers de tipo ─────────────────────────────────────────────────────────

const TIPO_BANNER: Record<string, string> = {
  '31': 'FACTURA CREDITO FISCAL',
  '32': 'FACTURA DE CONSUMO',
  '33': 'NOTA DE DEBITO',
  '34': 'NOTA DE CREDITO',
  '41': 'COMPRAS',
  '43': 'GASTOS MENORES',
  '44': 'REGIMENES ESPECIALES',
  '45': 'GUBERNAMENTAL',
  '46': 'EXPORTACIONES',
  '47': 'PAGOS AL EXTERIOR',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function FacturaTirillaPDF({ data }: { data: FacturaPDFData }) {
  const items = data.items ?? [];
  const tipoBanner = TIPO_BANNER[data.tipoEcf] ?? `e-CF TIPO ${data.tipoEcf}`;
  const totalItems = items.reduce((s, i) => s + (i.cantidadItem || 0), 0);

  // Width 80mm en puntos: 80mm = 226.77pt. height: 'auto' permite tirilla larga.
  return (
    <Document
      title={`Factura ${data.encf}`}
      author={data.emisor.razonSocial}
      subject="Comprobante Fiscal Electrónico — Tirilla"
    >
      <Page
        size={{ width: 226.77, height: estimateHeight(items.length, !!data.qrDataUrl) }}
        style={S.page}
      >
        {/* ── Logo opcional ── */}
        {data.emisor.logo && (
          <Image src={data.emisor.logo} style={S.logo} />
        )}

        {/* ── Nombre empresa ── */}
        <Text style={S.companyName}>
          {truncate(data.emisor.nombreComercial ?? data.emisor.razonSocial, 28)}
        </Text>

        {data.emisor.rnc && (
          <Text style={S.companyMeta}>RNC: {data.emisor.rnc}</Text>
        )}
        {data.emisor.direccion && (
          <Text style={S.companyMeta}>{truncate(data.emisor.direccion, 36)}</Text>
        )}
        {data.emisor.telefono && (
          <Text style={S.companyMeta}>Tel: {data.emisor.telefono}</Text>
        )}

        <View style={S.divider} />

        {/* ── Banner del tipo de comprobante ── */}
        <Text style={S.banner}>{tipoBanner}</Text>
        <Text style={S.companyMeta}>e-NCF: {data.encf}</Text>
        <Text style={S.companyMeta}>{data.fechaEmision}</Text>

        <View style={S.divider} />

        {/* ── Comprador ── */}
        <Text style={S.text}>
          Cliente: {truncate(data.comprador.razonSocial ?? 'Consumidor Final', 24)}
        </Text>
        {data.comprador.rnc && (
          <Text style={S.text}>RNC:     {data.comprador.rnc}</Text>
        )}
        {data.comprador.telefono && (
          <Text style={S.textSmall}>Tel:     {data.comprador.telefono}</Text>
        )}

        <View style={S.divider} />

        {/* ── Header de la tabla de ítems ── */}
        <View style={S.itemsHeader}>
          <Text>DESCRIPCION</Text>
          <Text>TOTAL</Text>
        </View>
        <View style={[S.divider, { marginVertical: 2 }]} />

        {/* ── Ítems ── */}
        {items.map((item, idx) => (
          <ItemLine key={idx} item={item} />
        ))}

        <View style={S.divider} />

        {/* ── Totales ── */}
        <View style={S.row}>
          <Text>Subtotal:</Text>
          <Text>{fmt(data.subtotal)}</Text>
        </View>
        {data.totalItbis > 0 && (
          <View style={S.row}>
            <Text>ITBIS (18%):</Text>
            <Text>{fmt(data.totalItbis)}</Text>
          </View>
        )}
        <View style={S.rowBold}>
          <Text>TOTAL:</Text>
          <Text>RD${fmt(data.montoTotal)}</Text>
        </View>
        <Text style={[S.textSmall, { textAlign: 'right', marginTop: 1 }]}>
          {items.length} línea{items.length !== 1 ? 's' : ''} · {totalItems} item{totalItems !== 1 ? 's' : ''}
        </Text>

        <View style={S.divider} />

        {/* ── QR de validación ── */}
        {data.qrDataUrl && (
          <View style={S.qrWrap}>
            <Image src={data.qrDataUrl} style={S.qrImage} />
          </View>
        )}

        {/* ── Código de seguridad / track ── */}
        {data.codigoSeguridad && (
          <Text style={[S.textSmall, S.center]}>
            Código de seguridad: {data.codigoSeguridad}
          </Text>
        )}
        {data.fechaFirma && (
          <Text style={[S.textSmall, S.center]}>
            Firmado: {data.fechaFirma}
          </Text>
        )}
        {/* ── Estado ── */}
        <Text style={S.estado}>* {data.estado.toUpperCase()} *</Text>

        {/* ── Pie / agradecimiento ── */}
        {data.pieFactura && (
          <>
            <View style={S.divider} />
            <Text style={[S.textSmall, S.center]}>{truncate(data.pieFactura, 80)}</Text>
          </>
        )}

        <View style={S.divider} />
        <Text style={[S.textSmall, S.center]}>** Documento electronico **</Text>
        <Text style={[S.textSmall, S.center]}>Verifique en dgii.gov.do</Text>
        <Text style={[S.textSmall, S.center, { marginTop: 4 }]}>
          Generado en www.emitedo.com
        </Text>
      </Page>
    </Document>
  );
}

// ─── Sub-componente: una línea de ítem ────────────────────────────────────────

function ItemLine({ item }: { item: ItemPDF }) {
  const cant   = item.cantidadItem || 1;
  const precio = item.precioUnitarioItem || 0;
  const total  = item.subtotalConItbis || cant * precio;

  // Nombre puede ser largo → wrapeamos truncando a 30 chars (con react-pdf el wrap es automático,
  // pero para mantener el feel monoespaciado preferimos truncado controlado).
  const nombre = truncate(item.nombreItem, 30);

  return (
    <View style={{ marginBottom: 2 }}>
      <Text style={S.itemDesc}>{nombre}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={S.itemMath}>
          {`  ${cant.toLocaleString('es-DO', { maximumFractionDigits: 2 })} x ${fmt(precio)}`}
        </Text>
        <Text style={S.itemMath}>{fmt(total)}</Text>
      </View>
    </View>
  );
}

// ─── Estimación de altura (necesaria para react-pdf si no quieres multipage) ──
// La tirilla térmica es "papel continuo": preferimos que TODO entre en una sola página.
// Por eso sobre-estimamos un poco la altura para evitar saltos de página.
// Cada ítem ~ 26pt (descripción + línea de cálculo); encabezado ~140pt;
// totales + QR + códigos + estado + pie ~ 280pt.
function estimateHeight(itemCount: number, hasQr: boolean): number {
  const header = 160;
  const items = Math.max(itemCount, 1) * 26;
  const totals = 90;
  const qr = hasQr ? 120 : 0;
  const footer = 140;
  return Math.max(560, header + items + totals + qr + footer);
}
