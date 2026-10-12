'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableFooter from '@mui/material/TableFooter';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { ChevronRight, Tags, Calendar } from 'lucide-react';

interface MaestroOpt { id: number; nombre: string; }
interface Fila { valorId: number; valor: string; count: number; total: number; }

const fmtDOP = (cts: number) =>
  `RD$${(cts / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function inicioDeMes() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 } as const;
const dateFieldSx = { '& .MuiInput-input': { fontSize: '0.875rem', color: '#374151', p: 0 } } as const;

export default function ReporteMaestrosClient() {
  const [maestros, setMaestros]   = useState<MaestroOpt[]>([]);
  const [maestroId, setMaestroId] = useState<string>('');
  const [desde, setDesde]         = useState(inicioDeMes());
  const [hasta, setHasta]         = useState(new Date().toISOString().slice(0, 10));
  const [filas, setFilas]         = useState<Fila[]>([]);
  const [totalGeneral, setTotalGeneral]   = useState(0);
  const [totalFacturas, setTotalFacturas] = useState(0);
  const [loading, setLoading]     = useState(false);

  // Catálogo de maestros de factura
  useEffect(() => {
    fetch('/api/facturas/maestros')
      .then(r => r.json())
      .then(d => {
        const list: MaestroOpt[] = (d.maestros ?? []).map((m: MaestroOpt) => ({ id: m.id, nombre: m.nombre }));
        setMaestros(list);
        if (list.length && !maestroId) setMaestroId(String(list[0].id));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async () => {
    if (!maestroId) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ maestroId, desde, hasta });
      const d  = await fetch(`/api/reportes/maestros?${sp}`).then(r => r.json());
      setFilas(d.filas ?? []);
      setTotalGeneral(d.totalGeneral ?? 0);
      setTotalFacturas(d.totalFacturas ?? 0);
    } finally {
      setLoading(false);
    }
  }, [maestroId, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const maxTotal = Math.max(...filas.map(f => f.total), 1);

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1024, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: '#6b7280', mb: 1 }}>
        <MuiLink component={Link} href="/dashboard/reportes" underline="none" sx={{ color: 'inherit', '&:hover': { color: '#3658e1' } }}>Reportes</MuiLink>
        <ChevronRight size={14} />
        <Typography component="span" sx={{ color: '#3658e1', fontWeight: 500, fontSize: 'inherit' }}>Ventas por clasificación</Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Ventas por clasificación</Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
          Totales de venta agrupados por los valores de un maestro de factura. Excluye anuladas.
        </Typography>
      </Box>

      {/* Filtros */}
      <Box sx={{ ...cardSx, mb: 2.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tags size={16} color="#9ca3af" />
          <FormControl size="small">
            <Select
              value={maestroId}
              onChange={(e) => setMaestroId(e.target.value)}
              displayEmpty
              sx={{ borderRadius: '8px', fontSize: '0.875rem', bgcolor: '#fff', minWidth: 180 }}
            >
              {maestros.length === 0 && <MenuItem value="">Sin maestros de factura</MenuItem>}
              {maestros.map(m => <MenuItem key={m.id} value={String(m.id)}>{m.nombre}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem' }}>
          <Calendar size={16} color="#9ca3af" />
          <TextField type="date" variant="standard" value={desde} onChange={(e) => setDesde(e.target.value)}
            slotProps={{ input: { disableUnderline: true } }} sx={dateFieldSx} />
          <Typography component="span" sx={{ color: '#9ca3af' }}>—</Typography>
          <TextField type="date" variant="standard" value={hasta} onChange={(e) => setHasta(e.target.value)}
            slotProps={{ input: { disableUnderline: true } }} sx={dateFieldSx} />
        </Box>
      </Box>

      {/* Resumen */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2.5 }}>
        <Box sx={cardSx}>
          <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.5 }}>Total vendido (clasificado)</Typography>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{fmtDOP(totalGeneral)}</Typography>
        </Box>
        <Box sx={cardSx}>
          <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.5 }}>Facturas clasificadas</Typography>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{totalFacturas}</Typography>
        </Box>
      </Box>

      {/* Tabla con barras */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>Desglose por valor</Typography>
          {loading && <CircularProgress size={16} sx={{ color: '#3658e1' }} />}
        </Box>
        {filas.length === 0 ? (
          <Typography sx={{ px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af' }}>
            {loading ? 'Cargando…' : 'Sin facturas clasificadas en este rango.'}
          </Typography>
        ) : (
          <Table size="small" sx={{ width: '100%' }}>
            <TableHead>
              <TableRow sx={{ '& th': { textTransform: 'uppercase', fontSize: '0.75rem', color: '#6b7280', bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Valor</TableCell>
                <TableCell align="right">Facturas</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell sx={{ width: '33.333%' }}>Participación</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map(f => (
                <TableRow key={f.valorId} hover sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500, color: '#111827' }}>{f.valor}</Typography></TableCell>
                  <TableCell align="right"><Typography variant="body2" sx={{ color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.count}</Typography></TableCell>
                  <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.total)}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ height: 8, bgcolor: '#f3f4f6', borderRadius: '9999px', overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', bgcolor: '#5b73ec', borderRadius: '9999px', width: `${(f.total / maxTotal) * 100}%` }} />
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ bgcolor: '#f9fafb', '& td': { borderTop: '1px solid #e5e7eb' } }}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>Total</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{totalFacturas}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(totalGeneral)}</Typography></TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Box>
    </Box>
  );
}
