'use client';

/**
 * /pos-reporte/[id] — corte X/Z del turno, imprimible (80mm).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

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

  if (error) return <Box sx={{ padding: '16px', fontFamily: 'monospace' }}>{error}</Box>;
  if (!r) return <Box sx={{ padding: '16px', fontFamily: 'monospace' }}>Cargando…</Box>;

  const row = (l: string, v: string, bold = false, k?: string | number) => (
    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}><Box component="span">{l}</Box><Box component="span">{v}</Box></Box>
  );

  return (
    <Box sx={{ width: '80mm', margin: '0 auto', padding: '6px 8px', fontFamily: 'monospace', fontSize: '12px', color: '#000', lineHeight: 1.35 }}>
      <Box sx={{ textAlign: 'center', marginBottom: '6px' }}>
        <Box sx={{ fontWeight: 700, fontSize: '14px' }}>CORTE {r.tipo}</Box>
        <Box>{r.tipo === 'Z' ? 'Cierre de turno' : 'Lectura en curso'}</Box>
        {r.turno.terminalNombre && <Box>{r.turno.terminalNombre}</Box>}
        {r.turno.numeroCierre && <Box>{r.turno.numeroCierre}</Box>}
      </Box>

      <Box sx={{ borderTop: '1px dashed #000', paddingTop: '4px' }}>
        <Box>Turno #{r.turno.id} · {r.turno.estado}</Box>
        <Box>Apertura: {new Date(r.turno.aperturaAt).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</Box>
        {r.turno.almacenNombre && <Box>Almacén: {r.turno.almacenNombre}</Box>}
      </Box>

      <Box sx={{ borderTop: '1px dashed #000', margin: '4px 0', paddingTop: '4px' }}>
        <Box sx={{ fontWeight: 700 }}>Ventas por método</Box>
        {r.ventasPorMetodo.length === 0 ? <Box sx={{ color: '#444' }}>(sin ventas)</Box>
          : r.ventasPorMetodo.map((v, i) => row(METODO[v.metodo] ?? v.metodo, fmt(v.total), false, 'm' + i))}
        {row('Total vendido', 'RD$ ' + fmt(r.totalVendidoCentavos), true)}
        {row('# ventas', String(r.numeroVentas))}
      </Box>

      <Box sx={{ borderTop: '1px dashed #000', margin: '4px 0', paddingTop: '4px' }}>
        <Box sx={{ fontWeight: 700 }}>Efectivo (gaveta)</Box>
        {row('Fondo apertura', fmt(r.esperado.montoApertura))}
        {row('Ventas efectivo', '+' + fmt(r.esperado.ventasEfectivo))}
        {row('Entradas', '+' + fmt(r.esperado.entradas))}
        {row('Salidas', '-' + fmt(r.esperado.salidas))}
        {row('Esperado en caja', 'RD$ ' + fmt(r.esperado.esperado), true)}
      </Box>

      <Box sx={{ borderTop: '1px dashed #000', margin: '4px 0', paddingTop: '4px' }}>
        <Box sx={{ fontWeight: 700 }}>Más vendidos</Box>
        {r.topProductos.length === 0 ? <Box sx={{ color: '#444' }}>(sin detalle)</Box>
          : r.topProductos.map((p, i) => row(`${p.cantidad}× ${p.nombre}`, fmt(p.importeCentavos), false, 'p' + i))}
      </Box>

      <Box sx={{ textAlign: 'center', marginTop: '8px' }}>
        {new Date().toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
      </Box>

      <Button
        onClick={() => window.print()}
        variant="outlined"
        size="small"
        sx={{ display: 'block', margin: '12px auto', padding: '6px 14px', textTransform: 'none', color: '#374151', borderColor: '#d1d5db', '@media print': { display: 'none' } }}
      >
        Imprimir
      </Button>
      <style>{`@media print { @page { margin: 0 } }`}</style>
    </Box>
  );
}
