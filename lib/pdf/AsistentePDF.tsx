/**
 * PDF de una respuesta del asistente: lo que se le preguntó, lo que contestó
 * (tablas incluidas) y de qué empresa y cuándo. Sin colores de marca ni QR:
 * es un reporte para guardar o imprimir, no un comprobante fiscal.
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Bloque, Tramo } from '@/lib/asistente/bloques';

// El tipo de un estilo, sacado de la propia librería: `@react-pdf/types` es una dependencia indirecta y no se puede importar.
type Style = Parameters<typeof StyleSheet.create>[0][string];

export interface AsistentePDFData {
  empresa: string;
  usuario: string | null;
  generadoEn: string;
  bloques: Bloque[];
}

const s = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, color: '#111827', fontFamily: 'Helvetica' },
  cabecera: { borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingBottom: 10, marginBottom: 14 },
  marca: { fontSize: 9, color: '#6b7280', marginBottom: 3 },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 3 },
  etiqueta: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 },
  parrafo: { marginBottom: 8, lineHeight: 1.45 },
  h: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 5 },
  item: { flexDirection: 'row', marginBottom: 3 },
  vineta: { width: 14 },
  tabla: { marginBottom: 10, borderWidth: 1, borderColor: '#d1d5db' },
  fila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filaCab: { backgroundColor: '#f3f4f6' },
  celda: { padding: 4, fontSize: 8.5 },
  num: { textAlign: 'right' },
  grafico: { marginBottom: 12, padding: 8, borderWidth: 1, borderColor: '#d1d5db' },
  graficoTitulo: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  barraFila: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barraEtiqueta: { width: '24%', fontSize: 8.5, paddingRight: 6 },
  barraRiel: { width: '52%', height: 9, backgroundColor: '#f3f4f6' },
  barra: { height: 9, backgroundColor: '#374151' },
  barraValor: { width: '24%', fontSize: 8.5, textAlign: 'right', paddingLeft: 6 },
  pie: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

import { anchoBarra, valorGrafico } from '@/lib/asistente/grafico';

const esNumero = (t: string) => /^(RD\$\s?)?-?[\d,]+(\.\d+)?%?$/.test(t.trim());
const plano = (t: Tramo[]) => t.map((x) => x.texto).join('');

/**
 * Texto de una celda para el PDF. Una lista de números largos separados por
 * coma («FA-2026-CACH-KFBTU-001098, FA-2026-…») se pone uno por línea: una
 * palabra de 24 caracteres no se parte y se saldría de la página.
 */
const celda = (t: Tramo[]) => {
  const texto = plano(t);
  return texto.length > 28 && texto.includes(', ') ? texto.split(', ').join('\n') : texto;
};

/** Ancho relativo de cada columna según lo más largo que lleva (línea por línea). */
function anchos(b: Extract<Bloque, { tipo: 'tabla' }>): number[] {
  const n = b.cabecera.length;
  const peso = Array.from({ length: n }, (_, j) => {
    const textos = [plano(b.cabecera[j] ?? []), ...b.filas.map((f) => celda(f[j] ?? []))];
    const mayor = Math.max(...textos.flatMap((x) => x.split('\n').map((l) => l.length)), 4);
    return Math.min(Math.max(mayor, 5), 34);
  });
  const total = peso.reduce((s, x) => s + x, 0);
  return peso.map((p) => (p / total) * 100);
}

const esColumnaNumerica = (b: Extract<Bloque, { tipo: 'tabla' }>, j: number) =>
  b.filas.length > 0 && b.filas.every((f) => esNumero(plano(f[j] ?? [])));

/** Con muchas columnas o texto ancho, la página va horizontal. */
const necesitaHorizontal = (bloques: Bloque[]) =>
  bloques.some((b) => b.tipo === 'tabla' && (b.cabecera.length >= 6 || anchos(b).length >= 5 && b.filas.some((f) => f.some((c) => celda(c).split('\n').some((l) => l.length > 24)))));

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
      <Page size="A4" orientation={necesitaHorizontal(data.bloques) ? 'landscape' : 'portrait'} style={s.pagina} wrap>
        <View style={s.cabecera} fixed>
          <Text style={s.marca}>Asistente de Zero</Text>
          <Text style={s.titulo}>{data.empresa}</Text>
          <Text style={s.meta}>
            Generado el {data.generadoEn}{data.usuario ? ` · para ${data.usuario}` : ''}
          </Text>
        </View>

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
          if (b.tipo === 'grafico') {
            const g = b.grafico;
            return (
              <View key={i} style={s.grafico} wrap={false}>
                {g.titulo ? <Text style={s.graficoTitulo}>{g.titulo}</Text> : null}
                {g.datos.map((d, j) => (
                  <View key={j} style={s.barraFila}>
                    <Text style={s.barraEtiqueta}>{d.etiqueta}</Text>
                    <View style={s.barraRiel}><View style={[s.barra, { width: `${anchoBarra(g, d.valor)}%` }]} /></View>
                    <Text style={s.barraValor}>{valorGrafico(g, d.valor)}</Text>
                  </View>
                ))}
              </View>
            );
          }
          const w = anchos(b);
          return (
            <View key={i} style={s.tabla}>
              <View style={[s.fila, s.filaCab]} fixed>
                {b.cabecera.map((c, j) => (
                  <Text key={j} style={[s.celda, { width: `${w[j]}%`, fontFamily: 'Helvetica-Bold' }, ...(esColumnaNumerica(b, j) ? [s.num] : [])]}>{plano(c)}</Text>
                ))}
              </View>
              {b.filas.map((f, r) => (
                <View key={r} style={s.fila} wrap={false}>
                  {f.map((c, j) => (
                    <Text key={j} style={[s.celda, { width: `${w[j]}%` }, ...(esColumnaNumerica(b, j) ? [s.num] : [])]}>{celda(c)}</Text>
                  ))}
                </View>
              ))}
            </View>
          );
        })}

        <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `Zero · página ${pageNumber} de ${totalPages} · Revisa las cifras importantes antes de decidir`} />
      </Page>
    </Document>
  );
}
