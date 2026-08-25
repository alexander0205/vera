/**
 * Template PDF — Contrato de empleado (Zero Nómina).
 *
 * Renderiza el contrato YA LLENO (los `{{marcadores}}` se reemplazaron antes,
 * en lib/nomina/contratos.ts). El cuerpo es texto plano: el primer bloque es el
 * título; los demás, párrafos separados por línea en blanco. Mismo lenguaje
 * visual A4 que los otros PDFs del producto.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

export interface ContratoPDFData {
  emisor: {
    razonSocial:      string;
    nombreComercial?: string;
    rnc?:             string;
    direccion?:       string;
    telefono?:        string;
    logo?:            string;
    colorPrimario?:   string;
  };
  titulo: string;
  /** Cuerpo ya lleno (con los datos del empleado). Texto plano con saltos. */
  cuerpo: string;
  /** Pie: fecha de generación legible. */
  generadoEn: string;
}

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10.5, backgroundColor: '#ffffff', padding: 48, color: '#1a1a1a', lineHeight: 1.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  logo: { width: 120, height: 42, objectFit: 'contain', marginBottom: 6 },
  emisorNombre: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 2 },
  emisorMeta: { fontSize: 8.5, color: '#555' },
  regla: { borderBottomWidth: 2, marginTop: 8, marginBottom: 18 },
  titulo: { fontFamily: 'Helvetica-Bold', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  parrafo: { fontSize: 10.5, marginBottom: 10, textAlign: 'justify' },
  footer: { position: 'absolute', bottom: 30, left: 48, right: 48, textAlign: 'center', fontSize: 8, color: '#999' },
});

/** Divide el cuerpo en bloques por línea en blanco; el primero es el título. */
function bloques(cuerpo: string): string[] {
  return cuerpo.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

export function ContratoPDF({ data }: { data: ContratoPDFData }) {
  const color = data.emisor.colorPrimario || '#1e40af';
  // El título del contrato viene como primer bloque del cuerpo si no se pasó
  // aparte; usamos data.titulo para el encabezado y saltamos el 1er bloque si
  // coincide, para no repetirlo.
  const partes = bloques(data.cuerpo);
  const primero = partes[0] ?? '';
  const tituloCoincide = primero.replace(/\s+/g, ' ').toLowerCase() === data.titulo.replace(/\s+/g, ' ').toLowerCase();
  const cuerpoPartes = tituloCoincide ? partes.slice(1) : partes;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={{ flex: 1 }}>
            {data.emisor.logo ? <Image style={S.logo} src={data.emisor.logo} /> : null}
            <Text style={S.emisorNombre}>{data.emisor.nombreComercial || data.emisor.razonSocial}</Text>
            {data.emisor.rnc ? <Text style={S.emisorMeta}>RNC {data.emisor.rnc}</Text> : null}
            {data.emisor.direccion ? <Text style={S.emisorMeta}>{data.emisor.direccion}</Text> : null}
            {data.emisor.telefono ? <Text style={S.emisorMeta}>Tel. {data.emisor.telefono}</Text> : null}
          </View>
        </View>
        <View style={[S.regla, { borderBottomColor: color }]} />

        <Text style={[S.titulo, { color }]}>{data.titulo}</Text>

        {cuerpoPartes.map((p, i) => (
          <Text key={i} style={S.parrafo}>{p}</Text>
        ))}

        <Text style={S.footer}>
          Generado por Zero Nómina el {data.generadoEn}. Documento sin firma electrónica.
        </Text>
      </Page>
    </Document>
  );
}
