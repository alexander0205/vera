/**
 * Template PDF — listado de Gastos.
 *
 * Lo mismo que la pantalla de Gastos con el filtro puesto: encabezado de la
 * empresa, qué filtro se aplicó, los totales y la tabla. A4 apaisado para que
 * quepan las columnas sin cortar el proveedor. Sirve para descargar y para
 * imprimir (se abre en el visor del navegador).
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface GastosPDFFila {
  fecha: string;
  proveedor: string;
  rnc: string | null;
  comprobante: string;
  tipo: string;
  categoria: string;
  estado: string;
  anulado: boolean;
  retenciones: number;
  monto: number;
}

export interface GastosPDFData {
  empresa: string;
  rnc?: string | null;
  filtroTexto: string;
  generado: string;
  totales: { gastado: number; cantidad: number; itbisAdelantar: number; retenciones: number; porPagar: number };
  filas: GastosPDFFila[];
  /** Si se cortó la lista por el tope, cuántas había en total. */
  totalFilas: number;
}

const fmt = (v: number) => `RD$${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica', color: '#111827' },
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
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #e5e7eb', paddingVertical: 3 },
  td: { paddingHorizontal: 3 },
  anulado: { color: '#9ca3af', textDecoration: 'line-through' },
  totalRow: { flexDirection: 'row', borderTop: '1pt solid #111827', paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#9ca3af' },
});

// Anchos de columna (suman 100 %).
const W = { fecha: '8%', proveedor: '22%', comprobante: '14%', tipo: '13%', categoria: '15%', estado: '8%', ret: '9%', monto: '11%' } as const;

export function GastosPDF({ data }: { data: GastosPDFData }) {
  const { totales } = data;
  return (
    <Document title="Gastos" author={data.empresa}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.empresa}>{data.empresa}</Text>
            {data.rnc ? <Text style={s.muted}>RNC {data.rnc}</Text> : null}
          </View>
          <View>
            <Text style={s.titulo}>Reporte de gastos</Text>
            <Text style={[s.muted, { textAlign: 'right' }]}>Generado el {data.generado}</Text>
          </View>
        </View>

        <Text style={s.filtro}>{data.filtroTexto}</Text>

        <View style={s.kpis}>
          <View style={s.kpi}><Text style={s.kpiLabel}>Gastado</Text><Text style={s.kpiValor}>{fmt(totales.gastado)}</Text><Text style={s.muted}>{totales.cantidad} gasto{totales.cantidad === 1 ? '' : 's'}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>ITBIS por adelantar</Text><Text style={s.kpiValor}>{fmt(totales.itbisAdelantar)}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Retenciones</Text><Text style={s.kpiValor}>{fmt(totales.retenciones)}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Por pagar</Text><Text style={s.kpiValor}>{fmt(totales.porPagar)}</Text></View>
        </View>

        <View style={s.thead} fixed>
          <Text style={[s.th, { width: W.fecha }]}>Fecha</Text>
          <Text style={[s.th, { width: W.proveedor }]}>Proveedor</Text>
          <Text style={[s.th, { width: W.comprobante }]}>Comprobante</Text>
          <Text style={[s.th, { width: W.tipo }]}>Tipo</Text>
          <Text style={[s.th, { width: W.categoria }]}>Categoría</Text>
          <Text style={[s.th, { width: W.estado }]}>Pago</Text>
          <Text style={[s.th, { width: W.ret, textAlign: 'right' }]}>Retenciones</Text>
          <Text style={[s.th, { width: W.monto, textAlign: 'right' }]}>Monto</Text>
        </View>

        {data.filas.map((f, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={[s.td, { width: W.fecha }, f.anulado ? s.anulado : {}]}>{f.fecha}</Text>
            <View style={[s.td, { width: W.proveedor }]}>
              <Text style={f.anulado ? s.anulado : {}}>{f.proveedor}</Text>
              {f.rnc ? <Text style={s.muted}>{f.rnc}</Text> : null}
            </View>
            <Text style={[s.td, { width: W.comprobante, fontFamily: 'Courier' }, f.anulado ? s.anulado : {}]}>{f.comprobante}</Text>
            <Text style={[s.td, { width: W.tipo }]}>{f.tipo}</Text>
            <Text style={[s.td, { width: W.categoria }]}>{f.categoria}</Text>
            <Text style={[s.td, { width: W.estado }]}>{f.estado}</Text>
            <Text style={[s.td, { width: W.ret, textAlign: 'right' }]}>{f.retenciones ? fmt(f.retenciones) : '—'}</Text>
            <Text style={[s.td, { width: W.monto, textAlign: 'right', fontFamily: 'Helvetica-Bold' }, f.anulado ? s.anulado : {}]}>{fmt(f.monto)}</Text>
          </View>
        ))}

        <View style={s.totalRow} wrap={false}>
          <Text style={[s.td, { width: '80%' }]}>Total gastado (sin anulados)</Text>
          <Text style={[s.td, { width: W.ret, textAlign: 'right' }]}>{fmt(totales.retenciones)}</Text>
          <Text style={[s.td, { width: W.monto, textAlign: 'right' }]}>{fmt(totales.gastado)}</Text>
        </View>

        {data.totalFilas > data.filas.length ? (
          <Text style={[s.muted, { marginTop: 6 }]}>
            Se muestran {data.filas.length} de {data.totalFilas} gastos. Acota el filtro para verlos todos; los totales sí incluyen todos.
          </Text>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{data.empresa} · Gastos</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
