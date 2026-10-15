/**
 * Template PDF — listado tabular de una pantalla (Gastos, Pagos recibidos…).
 *
 * Lo mismo que la pantalla con su filtro puesto: encabezado de la empresa, qué
 * filtro se aplicó, las tarjetas de totales y la tabla, con grupos opcionales
 * y una fila de totales. A4 apaisado para que quepan las columnas. Sirve para
 * descargar y para imprimir (el botón «Imprimir» lo abre en el visor del
 * navegador). Encabezado y cabecera de la tabla se repiten en cada página.
 *
 * Las páginas se arman antes de llegar a react-pdf (ver paginar-listado): con
 * todo en un solo <Page> el tiempo crecía cuadrático con las filas.
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { paginar, altoFila, MEDIDAS, type ItemListado } from './paginar-listado';

export interface ColumnaPDF {
  titulo: string;
  /** Porcentaje del ancho; las columnas deben sumar 100 %. */
  ancho: string;
  alinear?: 'left' | 'right' | 'center';
  mono?: boolean;
  negrita?: boolean;
}

/** Texto, o texto con una segunda línea gris (el RNC bajo el nombre, el NCF bajo el código). */
export type CeldaPDF = string | { texto: string; sub?: string | null };

export interface FilaPDF {
  celdas: CeldaPDF[];
  /** Anulada: tachada y en gris. */
  tachada?: boolean;
}

export interface GrupoPDF {
  /** Sin título = lista sin agrupar. */
  titulo?: string;
  /** Lo que va a la derecha del título del grupo (su subtotal). */
  resumen?: string;
  filas: FilaPDF[];
}

export interface ListadoPDFData {
  empresa: string;
  rnc?: string | null;
  titulo: string;
  filtroTexto: string;
  generado: string;
  kpis: { label: string; valor: string; sub?: string }[];
  columnas: ColumnaPDF[];
  grupos: GrupoPDF[];
  /** Fila final: etiqueta a la izquierda y valores por índice de columna. */
  totales?: { etiqueta: string; valores: Record<number, string> };
  /** Aviso al pie (p. ej. que la lista se cortó por el tope). */
  nota?: string;
}

const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 36, fontSize: 8, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  empresa: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280' },
  titulo: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  filtro: { fontSize: 8, color: '#374151', marginBottom: 8 },
  kpis: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  kpi: { flex: 1, border: '1pt solid #e5e7eb', borderRadius: 4, padding: 6 },
  kpiLabel: { fontSize: 7, color: '#6b7280', textTransform: 'uppercase' },
  kpiValor: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  thead: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottom: '1pt solid #d1d5db', paddingVertical: 4 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#374151', textTransform: 'uppercase', paddingHorizontal: 3 },
  grupo: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f9fafb', borderBottom: '0.5pt solid #e5e7eb', paddingVertical: 4, paddingHorizontal: 3, marginTop: 4 },
  grupoTitulo: { fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #e5e7eb', paddingVertical: 3 },
  td: { paddingHorizontal: 3 },
  tachada: { color: '#9ca3af', textDecoration: 'line-through' },
  totalRow: { flexDirection: 'row', borderTop: '1pt solid #111827', paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#9ca3af' },
});

function Celda({ c, col, tachada }: { c: CeldaPDF; col: ColumnaPDF; tachada?: boolean }) {
  const texto = typeof c === 'string' ? c : c.texto;
  const sub = typeof c === 'string' ? null : c.sub;
  const estilo = [
    col.mono ? { fontFamily: 'Courier' } : {},
    col.negrita ? { fontFamily: 'Helvetica-Bold' } : {},
    tachada ? s.tachada : {},
  ];
  return (
    <View style={[s.td, { width: col.ancho, textAlign: col.alinear ?? 'left' }]}>
      <Text style={estilo}>{texto}</Text>
      {sub ? <Text style={s.muted}>{sub}</Text> : null}
    </View>
  );
}

type Item = ItemListado<GrupoPDF, FilaPDF>;

/** Los grupos y filas aplanados en el orden en que se pintan. */
function aplanar(data: ListadoPDFData): Item[] {
  const items: Item[] = [];
  for (const g of data.grupos) {
    if (g.titulo) items.push({ tipo: 'grupo', grupo: g });
    for (const f of g.filas) items.push({ tipo: 'fila', fila: f });
  }
  if (items.every((i) => i.tipo !== 'fila')) items.push({ tipo: 'vacio' });
  if (data.totales) items.push({ tipo: 'total' });
  if (data.nota) items.push({ tipo: 'nota' });
  return items;
}

function Encabezado({ data }: { data: ListadoPDFData }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.empresa}>{data.empresa}</Text>
        {data.rnc ? <Text style={s.muted}>RNC {data.rnc}</Text> : null}
      </View>
      <View>
        <Text style={s.titulo}>{data.titulo}</Text>
        <Text style={[s.muted, { textAlign: 'right' }]}>Generado el {data.generado}</Text>
      </View>
    </View>
  );
}

function CabeceraTabla({ columnas }: { columnas: ColumnaPDF[] }) {
  return (
    <View style={s.thead}>
      {columnas.map((c, i) => (
        <Text key={i} style={[s.th, { width: c.ancho, textAlign: c.alinear ?? 'left' }]}>{c.titulo}</Text>
      ))}
    </View>
  );
}

function FilaTotales({ data }: { data: ListadoPDFData }) {
  const { columnas } = data;
  const totales = data.totales!;
  // La etiqueta ocupa las columnas hasta el primer valor.
  const indices = Object.keys(totales.valores).map(Number).sort((a, b) => a - b);
  const primero = indices[0] ?? columnas.length;
  const anchoEtiqueta = columnas.slice(0, primero).reduce((t, c) => t + parseFloat(c.ancho), 0);
  return (
    <View style={s.totalRow} wrap={false}>
      <Text style={[s.td, { width: `${anchoEtiqueta}%` }]}>{totales.etiqueta}</Text>
      {columnas.slice(primero).map((c, i) => (
        <Text key={i} style={[s.td, { width: c.ancho, textAlign: c.alinear ?? 'left' }]}>
          {totales.valores[primero + i] ?? ''}
        </Text>
      ))}
    </View>
  );
}

export function ListadoPDF({ data }: { data: ListadoPDFData }) {
  const { columnas } = data;
  const items = aplanar(data);
  const alto = (i: Item) => {
    switch (i.tipo) {
      case 'grupo': return MEDIDAS.grupo;
      case 'fila': return altoFila(i.fila.celdas, columnas);
      case 'total': return MEDIDAS.total;
      case 'nota': return MEDIDAS.nota;
      case 'vacio': return MEDIDAS.vacio;
    }
  };
  const paginas = paginar(items, alto, data.kpis.length > 0);
  const total = paginas.length;

  return (
    <Document title={data.titulo} author={data.empresa}>
      {paginas.map((pagina, n) => (
        <Page key={n} size="A4" orientation="landscape" style={s.page}>
          <Encabezado data={data} />
          {n === 0 && (
            <>
              <Text style={s.filtro}>{data.filtroTexto}</Text>
              {data.kpis.length > 0 && (
                <View style={s.kpis}>
                  {data.kpis.map((k, i) => (
                    <View key={i} style={s.kpi}>
                      <Text style={s.kpiLabel}>{k.label}</Text>
                      <Text style={s.kpiValor}>{k.valor}</Text>
                      {k.sub ? <Text style={s.muted}>{k.sub}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          <CabeceraTabla columnas={columnas} />
          {pagina.map((it, i) => {
            switch (it.tipo) {
              case 'grupo':
                return (
                  <View key={i} style={s.grupo} wrap={false}>
                    <Text style={s.grupoTitulo}>{it.grupo.titulo}</Text>
                    {it.grupo.resumen ? <Text style={s.grupoTitulo}>{it.grupo.resumen}</Text> : null}
                  </View>
                );
              case 'fila':
                return (
                  <View key={i} style={s.row} wrap={false}>
                    {it.fila.celdas.map((c, ci) => <Celda key={ci} c={c} col={columnas[ci]} tachada={it.fila.tachada} />)}
                  </View>
                );
              case 'total':
                return <FilaTotales key={i} data={data} />;
              case 'nota':
                return <Text key={i} style={[s.muted, { marginTop: 6 }]}>{data.nota}</Text>;
              case 'vacio':
                return <Text key={i} style={[s.muted, { paddingVertical: 12, textAlign: 'center' }]}>No hay registros con este filtro.</Text>;
            }
          })}
          <View style={s.footer} fixed>
            <Text>{data.empresa} · {data.titulo}</Text>
            <Text>Página {n + 1} de {total}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
