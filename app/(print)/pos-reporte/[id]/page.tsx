'use client';

/**
 * /pos-reporte/[id] — corte X/Z del turno, imprimible (80mm).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Reporte {
  turno: { id: number; estado: string; numeroCierre: string | null; aperturaAt: string; montoAperturaCentavos: number; terminalNombre: string | null; almacenNombre: string | null };
  tipo: 'X' | 'Z';
  ventasPorMetodo: { metodo: string; total: number }[];
  totalVendidoCentavos: number;
  numeroVentas: number;
  esperado: { montoApertura: number; ventasEfectivo: number; entradas: number; salidas: number; esperado: number };
  topProductos: { nombre: string; cantidad: number; importeCentavos: number }[];
}

const fmt = (c: number) => (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METODO: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', 'cuenta-estudiante': 'Cuenta estudiante' };

export default function PosReportePage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pos/reporte?turnoId=${id}`)
      .then((res) => res.ok ? res.json() : res.json().then((e) => Promise.reject(e.error)))
      .then((data) => { setR(data); setTimeout(() => window.print(), 350); })
      .catch((e) => setError(typeof e === 'string' ? e : 'No se pudo cargar el reporte'));
  }, [id]);

  if (error) return <div style={{ padding: 16, fontFamily: 'monospace' }}>{error}</div>;
  if (!r) return <div style={{ padding: 16, fontFamily: 'monospace' }}>Cargando…</div>;

  const row = (l: string, v: string, bold = false, k?: string | number) => (
    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}><span>{l}</span><span>{v}</span></div>
  );

  return (
    <div style={{ width: '80mm', margin: '0 auto', padding: '6px 8px', fontFamily: 'monospace', fontSize: 12, color: '#000', lineHeight: 1.35 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>CORTE {r.tipo}</div>
        <div>{r.tipo === 'Z' ? 'Cierre de turno' : 'Lectura en curso'}</div>
        {r.turno.terminalNombre && <div>{r.turno.terminalNombre}</div>}
        {r.turno.numeroCierre && <div>{r.turno.numeroCierre}</div>}
      </div>

      <div style={{ borderTop: '1px dashed #000', paddingTop: 4 }}>
        <div>Turno #{r.turno.id} · {r.turno.estado}</div>
        <div>Apertura: {new Date(r.turno.aperturaAt).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</div>
        {r.turno.almacenNombre && <div>Almacén: {r.turno.almacenNombre}</div>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0', paddingTop: 4 }}>
        <div style={{ fontWeight: 700 }}>Ventas por método</div>
        {r.ventasPorMetodo.length === 0 ? <div style={{ color: '#444' }}>(sin ventas)</div>
          : r.ventasPorMetodo.map((v, i) => row(METODO[v.metodo] ?? v.metodo, fmt(v.total), false, 'm' + i))}
        {row('Total vendido', 'RD$ ' + fmt(r.totalVendidoCentavos), true)}
        {row('# ventas', String(r.numeroVentas))}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0', paddingTop: 4 }}>
        <div style={{ fontWeight: 700 }}>Efectivo (gaveta)</div>
        {row('Fondo apertura', fmt(r.esperado.montoApertura))}
        {row('Ventas efectivo', '+' + fmt(r.esperado.ventasEfectivo))}
        {row('Entradas', '+' + fmt(r.esperado.entradas))}
        {row('Salidas', '-' + fmt(r.esperado.salidas))}
        {row('Esperado en caja', 'RD$ ' + fmt(r.esperado.esperado), true)}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0', paddingTop: 4 }}>
        <div style={{ fontWeight: 700 }}>Más vendidos</div>
        {r.topProductos.length === 0 ? <div style={{ color: '#444' }}>(sin detalle)</div>
          : r.topProductos.map((p, i) => row(`${p.cantidad}× ${p.nombre}`, fmt(p.importeCentavos), false, 'p' + i))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        {new Date().toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      <button onClick={() => window.print()} className="no-print" style={{ display: 'block', margin: '12px auto', padding: '6px 14px' }}>Imprimir</button>
      <style>{`@media print { .no-print { display: none } @page { margin: 0 } }`}</style>
    </div>
  );
}
