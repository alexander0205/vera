/**
 * PDF de una respuesta del asistente: lo que se le preguntó, lo que contestó
 * (tablas incluidas) y de qué empresa y cuándo. Sin colores de marca ni QR:
 * es un reporte para guardar o imprimir, no un comprobante fiscal.
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { Bloque, Tramo } from '@/lib/asistente/bloques';

export interface AsistentePDFData {
  empresa: string;
  usuario: string | null;
  generadoEn: string;
  pregunta: string | null;
  bloques: Bloque[];
  consultas: string[];
}

const s = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, color: '#111827', fontFamily: 'Helvetica' },
  cabecera: { borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingBottom: 10, marginBottom: 14 },
  marca: { fontSize: 9, color: '#6b7280', marginBottom: 3 },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 3 },
  pregunta: { backgroundColor: '#f3f4f6', padding: 8, borderRadius: 4, marginBottom: 12 },
  etiqueta: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 },
  parrafo: { marginBottom: 8, lineHeight: 1.45 },
  h: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 5 },
  item: { flexDirection: 'row', marginBottom: 3 },
  vineta: { width: 14 },
  tabla: { marginBottom: 10, borderWidth: 1, borderColor: '#d1d5db' },
  fila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filaCab: { backgroundColor: '#f3f4f6' },
  celda: { flex: 1, padding: 4, fontSize: 9 },
  num: { textAlign: 'right' },
  pie: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

const esNumero = (t: string) => /^(RD\$\s?)?-?[\d,]+(\.\d+)?%?$/.test(t.trim());
const plano = (t: Tramo[]) => t.map((x) => x.texto).join('');

function Runs({ t, estilo }: { t: Tramo[]; estilo?: Style }) {
  return (
    <Text style={estilo}>
      {t.map((x, i) => (x.negrita
        ? <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>{x.texto}</Text>
        : <Text key={i}>{x.texto}</Text>))}
    </Text>
  );
}

export function AsistentePDF({ data }: { data: AsistentePDFData }) {
  return (
    <Document title="Respuesta del asistente de Zero" author="Zero">
      <Page size="A4" style={s.pagina} wrap>
        <View style={s.cabecera} fixed>
          <Text style={s.marca}>Asistente de Zero</Text>
          <Text style={s.titulo}>{data.empresa}</Text>
          <Text style={s.meta}>
            Generado el {data.generadoEn}{data.usuario ? ` · para ${data.usuario}` : ''}
          </Text>
        </View>

        {data.pregunta ? (
          <View style={s.pregunta}>
            <Text style={s.etiqueta}>Consulta</Text>
            <Text>{data.pregunta}</Text>
          </View>
        ) : null}

        {data.bloques.map((b, i) => {
          if (b.tipo === 'titulo') return <Runs key={i} t={b.tramos} estilo={s.h} />;
          if (b.tipo === 'parrafo') return <Runs key={i} t={b.tramos} estilo={s.parrafo} />;
          if (b.tipo === 'lista') {
            return (
              <View key={i} style={{ marginBottom: 8 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={s.item} wrap={false}>
                    <Text style={s.vineta}>{b.ordenada ? `${j + 1}.` : '•'}</Text>
                    <Runs t={it} estilo={{ flex: 1 }} />
                  </View>
                ))}
              </View>
            );
          }
          return (
            <View key={i} style={s.tabla}>
              <View style={[s.fila, s.filaCab]} fixed>
                {b.cabecera.map((c, j) => <Text key={j} style={[s.celda, { fontFamily: 'Helvetica-Bold' }]}>{plano(c)}</Text>)}
              </View>
              {b.filas.map((f, r) => (
                <View key={r} style={s.fila} wrap={false}>
                  {f.map((c, j) => (
                    <Text key={j} style={esNumero(plano(c)) ? [s.celda, s.num] : s.celda}>{plano(c)}</Text>
                  ))}
                </View>
              ))}
            </View>
          );
        })}

        {data.consultas.length ? (
          <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 10 }}>
            Datos consultados: {data.consultas.join(' · ')}
          </Text>
        ) : null}

        <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `Zero · página ${pageNumber} de ${totalPages} · Revisa las cifras importantes antes de decidir`} />
      </Page>
    </Document>
  );
}
