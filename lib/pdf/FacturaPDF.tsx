/**
 * Template PDF de Factura Electrónica EmiteDO
 * Usa @react-pdf/renderer — NO importar en componentes client, solo en API routes (Node.js).
 */
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ItemPDF {
  nombreItem: string;
  descripcionItem?: string;
  cantidadItem: number;
  precioUnitarioItem: number;
  descuentoMonto?: number;
  tasaItbis?: number;
  subtotalConItbis: number;
}

export interface EmisorPDF {
  razonSocial: string;
  nombreComercial?: string;
  rnc: string;
  direccion?: string;
  telefono?: string;
  sitioWeb?: string;
  emailFacturacion?: string;
  logo?: string;       // base64 data URL
  firma?: string;      // base64 data URL
  colorPrimario?: string;
}

export interface CompradorPDF {
  razonSocial?: string;
  rnc?: string;
  email?: string;
}

export interface FacturaPDFData {
  encf: string;
  tipoEcf: string;
  tipoEcfNombre: string;
  fechaEmision: string;
  tipoPagoNombre: string;
  estado: string;
  codigoSeguridad?: string;
  trackId?: string;

  emisor: EmisorPDF;
  comprador: CompradorPDF;
  items: ItemPDF[];

  subtotal: number;
  totalItbis: number;
  montoTotal: number;

  qrDataUrl?: string;   // QR pre-generado como data URL PNG
  pieFactura?: string | null;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function makeStyles(color: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      fontSize: 9,
      backgroundColor: '#ffffff',
      paddingTop: 32,
      paddingBottom: 48,
      paddingHorizontal: 40,
      color: '#1a1a1a',
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: color,
    },
    logoBox: {
      width: 120,
      alignItems: 'flex-start',
    },
    logo: {
      width: 90,
      height: 45,
      objectFit: 'contain',
    },
    logoPlaceholder: {
      width: 90,
      height: 45,
      backgroundColor: color,
      borderRadius: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    logoPlaceholderText: {
      color: '#ffffff',
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
    },
    emisorInfo: {
      flex: 1,
      paddingLeft: 12,
    },
    emisorNombre: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 12,
      color: '#1a1a1a',
      marginBottom: 2,
    },
    emisorRnc: {
      fontSize: 9,
      color: '#555555',
      marginBottom: 1,
    },
    emisorDetalle: {
      fontSize: 8,
      color: '#777777',
    },
    titleBox: {
      alignItems: 'flex-end',
      minWidth: 160,
    },
    titleLabel: {
      fontSize: 18,
      fontFamily: 'Helvetica-Bold',
      color: color,
      letterSpacing: 1,
    },
    encfBox: {
      backgroundColor: color + '15',
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginTop: 4,
    },
    encfText: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 13,
      color: color,
      letterSpacing: 0.5,
    },
    titleMeta: {
      fontSize: 8,
      color: '#555555',
      marginTop: 3,
      textAlign: 'right',
    },

    // Sección comprador
    seccionRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 14,
    },
    seccionBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 6,
      padding: 10,
    },
    seccionTitulo: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
      color: color,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 5,
      paddingBottom: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: color + '50',
    },
    seccionLabel: {
      fontSize: 7.5,
      color: '#777777',
      marginBottom: 1,
    },
    seccionValor: {
      fontSize: 9,
      color: '#1a1a1a',
      fontFamily: 'Helvetica-Bold',
      marginBottom: 4,
    },
    seccionValorNormal: {
      fontSize: 8.5,
      color: '#1a1a1a',
      marginBottom: 3,
    },

    // Tabla de items
    tablaHeader: {
      flexDirection: 'row',
      backgroundColor: color,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 6,
      marginBottom: 1,
    },
    tablaHeaderCell: {
      color: '#ffffff',
      fontFamily: 'Helvetica-Bold',
      fontSize: 7.5,
    },
    tablaRow: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: '#f0f0f0',
    },
    tablaRowAlt: {
      backgroundColor: '#f9fafb',
    },
    tablaCell: {
      fontSize: 8.5,
      color: '#1a1a1a',
    },
    tablaCellGray: {
      fontSize: 8,
      color: '#555555',
    },

    // Anchos columnas
    colDesc: { flex: 3 },
    colQty: { width: 35, textAlign: 'right' },
    colPrecio: { width: 60, textAlign: 'right' },
    colItbis: { width: 45, textAlign: 'right' },
    colTotal: { width: 65, textAlign: 'right' },

    // Totales
    totalesBox: {
      alignSelf: 'flex-end',
      width: 220,
      marginTop: 10,
    },
    totalesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      paddingHorizontal: 8,
    },
    totalesLabel: {
      fontSize: 8.5,
      color: '#555555',
    },
    totalesValor: {
      fontSize: 8.5,
      color: '#1a1a1a',
    },
    totalFinalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: color,
      borderRadius: 4,
      paddingVertical: 7,
      paddingHorizontal: 8,
      marginTop: 3,
    },
    totalFinalLabel: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
    },
    totalFinalValor: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
    },

    // Footer / validación
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 40,
      right: 40,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      paddingTop: 10,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    qrBox: {
      alignItems: 'center',
    },
    qrImage: {
      width: 64,
      height: 64,
    },
    qrLabel: {
      fontSize: 6.5,
      color: '#777777',
      textAlign: 'center',
      marginTop: 2,
    },
    codigoBox: {
      flex: 1,
      paddingHorizontal: 12,
    },
    codigoLabel: {
      fontSize: 7,
      color: '#777777',
      marginBottom: 1,
    },
    codigoValor: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      color: color,
      letterSpacing: 1.5,
      marginBottom: 3,
    },
    trackLabel: {
      fontSize: 6.5,
      color: '#999999',
    },
    trackValor: {
      fontSize: 7,
      color: '#555555',
    },
    validacionText: {
      fontSize: 6.5,
      color: '#999999',
      marginTop: 3,
    },
    firmaBox: {
      alignItems: 'center',
      minWidth: 90,
    },
    firmaImage: {
      width: 80,
      height: 40,
      objectFit: 'contain',
    },
    firmaLabel: {
      fontSize: 6.5,
      color: '#777777',
      textAlign: 'center',
      marginTop: 2,
      borderTopWidth: 0.5,
      borderTopColor: '#cccccc',
      paddingTop: 2,
      width: 80,
    },
    legalText: {
      fontSize: 6.5,
      color: '#aaaaaa',
      textAlign: 'center',
      marginTop: 8,
    },
  });
}

// ─── Helper formatters ────────────────────────────────────────────────────────

const DOP = (n: number) =>
  'DOP ' + (n / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura Fiscal',
  '32': 'Factura de Consumo',
  '33': 'Nota de Débito',
  '34': 'Nota de Crédito',
  '41': 'Compras',
  '43': 'Gastos Menores',
  '44': 'Regímenes Especiales',
  '45': 'Gubernamental',
  '46': 'Exportaciones',
  '47': 'Pagos al Exterior',
};

// ─── Componente PDF ───────────────────────────────────────────────────────────

export function FacturaPDF({ data }: { data: FacturaPDFData }) {
  const color = data.emisor.colorPrimario ?? '#1e40af';
  const S = makeStyles(color);

  return (
    <Document
      title={`Factura ${data.encf}`}
      author={data.emisor.razonSocial}
      subject="Comprobante Fiscal Electrónico"
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={S.header}>
          {/* Logo + datos emisor */}
          <View style={S.logoBox}>
            {data.emisor.logo ? (
              <Image style={S.logo} src={data.emisor.logo} />
            ) : (
              <View style={S.logoPlaceholder}>
                <Text style={S.logoPlaceholderText}>
                  {(data.emisor.nombreComercial ?? data.emisor.razonSocial).substring(0, 6).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={S.emisorInfo}>
            <Text style={S.emisorNombre}>
              {data.emisor.nombreComercial ?? data.emisor.razonSocial}
            </Text>
            <Text style={S.emisorRnc}>RNC: {data.emisor.rnc}</Text>
            {data.emisor.direccion && (
              <Text style={S.emisorDetalle}>{data.emisor.direccion}</Text>
            )}
            {data.emisor.telefono && (
              <Text style={S.emisorDetalle}>Tel: {data.emisor.telefono}</Text>
            )}
            {data.emisor.emailFacturacion && (
              <Text style={S.emisorDetalle}>{data.emisor.emailFacturacion}</Text>
            )}
            {data.emisor.sitioWeb && (
              <Text style={S.emisorDetalle}>{data.emisor.sitioWeb}</Text>
            )}
          </View>

          {/* Título + e-NCF */}
          <View style={S.titleBox}>
            <Text style={S.titleLabel}>e-CF</Text>
            <View style={S.encfBox}>
              <Text style={S.encfText}>{data.encf}</Text>
            </View>
            <Text style={S.titleMeta}>
              {TIPO_NOMBRE[data.tipoEcf] ?? data.tipoEcfNombre}
            </Text>
            <Text style={S.titleMeta}>Fecha: {data.fechaEmision}</Text>
            <Text style={S.titleMeta}>Pago: {data.tipoPagoNombre}</Text>
          </View>
        </View>

        {/* ── Emisor / Comprador ─────────────────────────────────────────── */}
        <View style={S.seccionRow}>
          {/* Comprador */}
          <View style={S.seccionBox}>
            <Text style={S.seccionTitulo}>Comprador / Cliente</Text>
            {data.comprador.razonSocial ? (
              <>
                <Text style={S.seccionLabel}>Razón Social</Text>
                <Text style={S.seccionValor}>{data.comprador.razonSocial}</Text>
                {data.comprador.rnc && (
                  <>
                    <Text style={S.seccionLabel}>RNC / Cédula</Text>
                    <Text style={S.seccionValorNormal}>{data.comprador.rnc}</Text>
                  </>
                )}
                {data.comprador.email && (
                  <>
                    <Text style={S.seccionLabel}>Email</Text>
                    <Text style={S.seccionValorNormal}>{data.comprador.email}</Text>
                  </>
                )}
              </>
            ) : (
              <Text style={S.seccionValorNormal}>Consumidor Final</Text>
            )}
          </View>

          {/* Estado / Info fiscal */}
          <View style={S.seccionBox}>
            <Text style={S.seccionTitulo}>Estado del Comprobante</Text>
            <Text style={S.seccionLabel}>Estado DGII</Text>
            <Text style={S.seccionValor}>{data.estado}</Text>
            {data.codigoSeguridad && (
              <>
                <Text style={S.seccionLabel}>Código de Seguridad</Text>
                <Text style={{ ...S.seccionValor, color }}>
                  {data.codigoSeguridad}
                </Text>
              </>
            )}
            <Text style={S.seccionLabel}>Ambiente</Text>
            <Text style={S.seccionValorNormal}>
              {data.estado === 'TEST' ? 'Prueba (TesteCF)' : 'Producción (eCF)'}
            </Text>
          </View>
        </View>

        {/* ── Tabla de items ─────────────────────────────────────────────── */}
        {/* Encabezado */}
        <View style={S.tablaHeader}>
          <Text style={[S.tablaHeaderCell, S.colDesc]}>Descripción</Text>
          <Text style={[S.tablaHeaderCell, S.colQty]}>Cant.</Text>
          <Text style={[S.tablaHeaderCell, S.colPrecio]}>P. Unit.</Text>
          <Text style={[S.tablaHeaderCell, S.colItbis]}>ITBIS</Text>
          <Text style={[S.tablaHeaderCell, S.colTotal]}>Total</Text>
        </View>

        {/* Filas */}
        {data.items.map((item, idx) => (
          <View
            key={idx}
            style={[S.tablaRow, idx % 2 === 1 ? S.tablaRowAlt : {}]}
          >
            <View style={S.colDesc}>
              <Text style={S.tablaCell}>{item.nombreItem}</Text>
              {item.descripcionItem && (
                <Text style={S.tablaCellGray}>{item.descripcionItem}</Text>
              )}
            </View>
            <Text style={[S.tablaCell, S.colQty]}>{item.cantidadItem}</Text>
            <Text style={[S.tablaCell, S.colPrecio]}>
              {(item.precioUnitarioItem / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[S.tablaCell, S.colItbis]}>
              {item.tasaItbis ? `${(item.tasaItbis * 100).toFixed(0)}%` : 'Exento'}
            </Text>
            <Text style={[S.tablaCell, S.colTotal]}>
              {(item.subtotalConItbis / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        ))}

        {/* ── Totales ────────────────────────────────────────────────────── */}
        <View style={S.totalesBox}>
          <View style={S.totalesRow}>
            <Text style={S.totalesLabel}>Subtotal</Text>
            <Text style={S.totalesValor}>{DOP(data.subtotal)}</Text>
          </View>
          <View style={S.totalesRow}>
            <Text style={S.totalesLabel}>ITBIS</Text>
            <Text style={S.totalesValor}>{DOP(data.totalItbis)}</Text>
          </View>
          <View style={S.totalFinalRow}>
            <Text style={S.totalFinalLabel}>TOTAL</Text>
            <Text style={S.totalFinalValor}>{DOP(data.montoTotal)}</Text>
          </View>
        </View>

        {/* ── Pie de factura ─────────────────────────────────────────────── */}
        {data.pieFactura && (
          <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', textAlign: 'center', lineHeight: 1.4 }}>
              {data.pieFactura}
            </Text>
          </View>
        )}

        {/* ── Footer: QR + código seguridad + firma ──────────────────────── */}
        <View style={S.footer}>
          <View style={S.footerRow}>
            {/* QR code */}
            {data.qrDataUrl && (
              <View style={S.qrBox}>
                <Image style={S.qrImage} src={data.qrDataUrl} />
                <Text style={S.qrLabel}>Validar en DGII</Text>
              </View>
            )}

            {/* Código + track */}
            <View style={S.codigoBox}>
              {data.codigoSeguridad && (
                <>
                  <Text style={S.codigoLabel}>Código de Seguridad</Text>
                  <Text style={S.codigoValor}>{data.codigoSeguridad}</Text>
                </>
              )}
              {data.trackId && (
                <>
                  <Text style={S.trackLabel}>Track ID DGII</Text>
                  <Text style={S.trackValor}>{data.trackId}</Text>
                </>
              )}
              <Text style={S.validacionText}>
                Consulta en: dgii.gov.do/e-CF
              </Text>
            </View>

            {/* Firma */}
            <View style={S.firmaBox}>
              {data.emisor.firma ? (
                <>
                  <Image style={S.firmaImage} src={data.emisor.firma} />
                  <Text style={S.firmaLabel}>Firma autorizada</Text>
                </>
              ) : (
                <Text style={{ ...S.firmaLabel, marginTop: 0 }}>
                  Documento electrónico{'\n'}no requiere firma física
                </Text>
              )}
            </View>
          </View>

          <Text style={S.legalText}>
            Este documento es un Comprobante Fiscal Electrónico (e-CF) válido para fines tributarios
            conforme a la Ley 32-23 y normativas de la DGII — República Dominicana.
          </Text>
        </View>

      </Page>
    </Document>
  );
}
