/**
 * Template PDF — Volante de pago de nómina (Zero).
 *
 * Un volante por empleado y por corrida: lo que devengó, lo que se le retuvo
 * (AFP, SFS, ISR) y el neto que recibe. Mismo lenguaje visual A4 que los demás
 * PDFs del producto. Los aportes patronales se muestran solo como informativo:
 * no salen del sueldo del empleado.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

export interface VolanteNominaData {
  emisor: {
    razonSocial:      string;
    nombreComercial?: string;
    rnc?:             string;
    direccion?:       string;
    telefono?:        string;
    logo?:            string;
    colorPrimario?:   string;
  };
  empleado: {
    nombre: string;
    cedula?: string | null;
    cargo?:  string | null;
  };
  periodoTexto: string;   // "Julio 2026"
  descripcion:  string;   // "Nómina 2026-07"
  fechaPago?:   string | null;

  // Montos en DOP (pesos)
  bruto:            number;
  afpEmpleado:      number;
  sfsEmpleado:      number;
  isr:              number;
  otrasDeducciones: number;
  totalDeducciones: number;
  neto:             number;
  // Informativo (aportes de la empresa)
  totalPatronal:    number;
}

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
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let t = '';
  const mill = Math.floor(entero / 1_000_000);
  const mil = Math.floor((entero % 1_000_000) / 1_000);
  const res = entero % 1_000;
  if (mill) t += (mill === 1 ? 'Un millón' : c(mill) + ' millones') + ' ';
  if (mil) t += (mil === 1 ? 'Mil' : c(mil) + ' mil') + ' ';
  if (res) t += c(res);
  if (!t) t = 'Cero';
  return t.trim() + ` con ${String(centavos).padStart(2, '0')}/100`;
}

const fmt = (n: number) =>
  'RD$' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, backgroundColor: '#ffffff', padding: 40, color: '#1a1a1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  logo: { width: 130, height: 46, objectFit: 'contain', marginBottom: 6 },
  emisorNombre: { fontFamily: 'Helvetica-Bold', fontSize: 15, marginBottom: 2 },
  emisorMeta: { fontSize: 8.5, color: '#555' },
  titulo: { fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'right' },
  tituloMeta: { fontSize: 9, color: '#555', textAlign: 'right', marginTop: 2 },
  regla: { borderBottomWidth: 2, marginTop: 8, marginBottom: 14 },

  cajaEmpleado: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f5f6f8', borderRadius: 4, padding: 10, marginBottom: 16 },
  campoLabel: { fontSize: 8, color: '#777', marginBottom: 2 },
  campoValor: { fontFamily: 'Helvetica-Bold', fontSize: 10 },

  seccionTitulo: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 6, marginTop: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  filaLabel: { fontSize: 10 },
  filaMonto: { fontSize: 10 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, marginTop: 2 },
  filaTotalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  filaTotalMonto: { fontFamily: 'Helvetica-Bold', fontSize: 10 },

  cajaNeto: { marginTop: 18, borderRadius: 4, padding: 12 },
  netoLabel: { fontSize: 9, color: '#ffffff', opacity: 0.9 },
  netoMonto: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: '#ffffff', marginTop: 2 },
  netoLetras: { fontSize: 8.5, color: '#ffffff', opacity: 0.9, marginTop: 4 },

  patronal: { fontSize: 8.5, color: '#777', marginTop: 16 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: '#999' },
});

export function VolanteNominaPDF({ data }: { data: VolanteNominaData }) {
  const color = data.emisor.colorPrimario || '#1e40af';

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Encabezado */}
        <View style={S.header}>
          <View style={{ flex: 1 }}>
            {data.emisor.logo ? <Image style={S.logo} src={data.emisor.logo} /> : null}
            <Text style={S.emisorNombre}>{data.emisor.nombreComercial || data.emisor.razonSocial}</Text>
            {data.emisor.rnc ? <Text style={S.emisorMeta}>RNC {data.emisor.rnc}</Text> : null}
            {data.emisor.direccion ? <Text style={S.emisorMeta}>{data.emisor.direccion}</Text> : null}
            {data.emisor.telefono ? <Text style={S.emisorMeta}>Tel. {data.emisor.telefono}</Text> : null}
          </View>
          <View>
            <Text style={[S.titulo, { color }]}>Volante de pago</Text>
            <Text style={S.tituloMeta}>{data.periodoTexto}</Text>
            {data.fechaPago ? <Text style={S.tituloMeta}>Pago: {data.fechaPago}</Text> : null}
          </View>
        </View>
        <View style={[S.regla, { borderBottomColor: color }]} />

        {/* Datos del empleado */}
        <View style={S.cajaEmpleado}>
          <View>
            <Text style={S.campoLabel}>Empleado</Text>
            <Text style={S.campoValor}>{data.empleado.nombre}</Text>
          </View>
          <View>
            <Text style={S.campoLabel}>Cédula</Text>
            <Text style={S.campoValor}>{data.empleado.cedula || '—'}</Text>
          </View>
          <View>
            <Text style={S.campoLabel}>Cargo</Text>
            <Text style={S.campoValor}>{data.empleado.cargo || '—'}</Text>
          </View>
        </View>

        {/* Devengado */}
        <Text style={S.seccionTitulo}>Ingresos</Text>
        <View style={S.fila}>
          <Text style={S.filaLabel}>Salario del período</Text>
          <Text style={S.filaMonto}>{fmt(data.bruto)}</Text>
        </View>
        <View style={S.filaTotal}>
          <Text style={S.filaTotalLabel}>Total devengado</Text>
          <Text style={S.filaTotalMonto}>{fmt(data.bruto)}</Text>
        </View>

        {/* Deducciones */}
        <Text style={S.seccionTitulo}>Deducciones de ley</Text>
        <View style={S.fila}>
          <Text style={S.filaLabel}>AFP (pensión, 2.87%)</Text>
          <Text style={S.filaMonto}>-{fmt(data.afpEmpleado)}</Text>
        </View>
        <View style={S.fila}>
          <Text style={S.filaLabel}>SFS (salud, 3.04%)</Text>
          <Text style={S.filaMonto}>-{fmt(data.sfsEmpleado)}</Text>
        </View>
        <View style={S.fila}>
          <Text style={S.filaLabel}>ISR (retención)</Text>
          <Text style={S.filaMonto}>-{fmt(data.isr)}</Text>
        </View>
        {data.otrasDeducciones > 0 ? (
          <View style={S.fila}>
            <Text style={S.filaLabel}>Otras deducciones</Text>
            <Text style={S.filaMonto}>-{fmt(data.otrasDeducciones)}</Text>
          </View>
        ) : null}
        <View style={S.filaTotal}>
          <Text style={S.filaTotalLabel}>Total deducciones</Text>
          <Text style={S.filaTotalMonto}>-{fmt(data.totalDeducciones)}</Text>
        </View>

        {/* Neto */}
        <View style={[S.cajaNeto, { backgroundColor: color }]}>
          <Text style={S.netoLabel}>Neto a pagar</Text>
          <Text style={S.netoMonto}>{fmt(data.neto)}</Text>
          <Text style={S.netoLetras}>{numeroALetras(data.neto)} pesos</Text>
        </View>

        <Text style={S.patronal}>
          Aportes de la empresa a la Seguridad Social por este empleado (informativo, no se descuentan del sueldo): {fmt(data.totalPatronal)}.
        </Text>

        <Text style={S.footer}>
          {data.descripcion} · Generado por Zero Nómina. Este volante es un comprobante de pago, no un documento fiscal.
        </Text>
      </Page>
    </Document>
  );
}
