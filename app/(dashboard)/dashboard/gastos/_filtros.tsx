'use client';

/**
 * Filtros de la pantalla de Gastos: búsqueda, fechas, categoría, tipo y estado.
 *
 * La pantalla es de servidor y pagina en la base, así que el filtro viaja en la
 * URL y la consulta lo aplica (no se filtra en memoria lo que ya se cargó: eso
 * filtraría solo la página visible). Mismo aspecto que la barra de filtros de
 * las listas de Ingresos (DataTable). Cambiar un filtro vuelve a la página 1.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Filter } from 'lucide-react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import {
  ESTADOS_GASTO, TIPOS_GASTO, SIN_CATEGORIA, filtroGastosAParams, hayFiltro, mesDelRango, rangoDeMes,
  type FiltroGastos,
} from '@/lib/compras/filtro-gastos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const inputFecha = {
  border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.5, py: 0.875,
  fontSize: '0.8125rem', bgcolor: '#ffffff', outline: 'none', fontFamily: 'inherit',
  '&:focus': { borderColor: '#3658e1' },
} as const;

const selectSx = { fontSize: '0.875rem', borderRadius: '8px', minWidth: 150, bgcolor: '#ffffff' } as const;

export function FiltrosGastos({ filtro, categorias, hoy }: { filtro: FiltroGastos; categorias: string[]; hoy: string }) {
  const router = useRouter();
  const [q, setQ] = useState(filtro.q ?? '');

  // Lo tecleado entra siempre, aunque la búsqueda aún no se haya aplicado: si
  // no, cambiar un select a mitad de escribir la perdería.
  const ir = (cambios: Partial<FiltroGastos>) => {
    const s = filtroGastosAParams({ ...filtro, q: q.trim() || undefined, ...cambios }).toString();
    router.push(`/dashboard/gastos${s ? `?${s}` : ''}`);
  };

  // La búsqueda espera a que se deje de teclear: una navegación por letra
  // recargaría la pantalla a cada pulsación. `saltar` evita que el primer
  // render y el «Limpiar» (que ya navegan) disparen otra navegación.
  const saltar = useRef(true);
  useEffect(() => {
    if (saltar.current) { saltar.current = false; return; }
    const t = setTimeout(() => {
      if ((filtro.q ?? '') !== q.trim()) ir({ q: q.trim() || undefined });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const limpiar = () => {
    if (q) { saltar.current = true; setQ(''); }
    router.push('/dashboard/gastos');
  };

  const [y, m] = hoy.split('-').map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const mes = mesDelRango(filtro);
  const rangoLibre = Boolean((filtro.desde || filtro.hasta) && !mes);

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', p: 1.5, borderBottom: '1px solid #f3f4f6', bgcolor: '#fafafa' }}
      data-testid="filtros-gastos">
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 200px', maxWidth: 320,
        bgcolor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.5, py: 0.875,
        '&:focus-within': { borderColor: '#3658e1', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' },
      }}>
        <Search style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
        <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor, RNC o comprobante…"
          sx={{ flex: 1, fontSize: '0.875rem' }} inputProps={{ 'aria-label': 'Buscar gastos' }} />
        {q && (
          <IconButton size="small" onClick={() => setQ('')} sx={{ p: 0.25 }} aria-label="Borrar búsqueda">
            <X style={{ width: 12, height: 12 }} />
          </IconButton>
        )}
      </Box>

      {/* Atajo por mes: es lo que más se busca. Las fechas de al lado dan cualquier rango. */}
      <Select size="small" displayEmpty value={mes ?? (rangoLibre ? 'rango' : '')} sx={selectSx}
        inputProps={{ 'aria-label': 'Mes' }}
        onChange={(e) => {
          const v = e.target.value as string;
          if (v === 'rango') return;
          ir(v ? rangoDeMes(v) : { desde: undefined, hasta: undefined });
        }}>
        <MenuItem value=""><em>Todos los meses</em></MenuItem>
        {rangoLibre && <MenuItem value="rango" sx={{ fontSize: '0.875rem' }}>Rango personalizado</MenuItem>}
        {meses.map((x) => (
          <MenuItem key={x} value={x} sx={{ fontSize: '0.875rem' }}>{MESES[Number(x.slice(5, 7)) - 1]} {x.slice(0, 4)}</MenuItem>
        ))}
      </Select>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Filter style={{ width: 14, height: 14, color: '#9ca3af' }} />
        <Box component="input" type="date" aria-label="Desde" value={filtro.desde ?? ''} sx={inputFecha}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => ir({ desde: e.target.value || undefined })} />
        <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280' }}>→</Box>
        <Box component="input" type="date" aria-label="Hasta" value={filtro.hasta ?? ''} sx={inputFecha}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => ir({ hasta: e.target.value || undefined })} />
      </Box>

      <Select size="small" displayEmpty value={filtro.categoria ?? ''} sx={selectSx} inputProps={{ 'aria-label': 'Categoría' }}
        onChange={(e) => ir({ categoria: (e.target.value as string) || undefined })}>
        <MenuItem value=""><em>Todas las categorías</em></MenuItem>
        {categorias.map((c) => <MenuItem key={c} value={c} sx={{ fontSize: '0.875rem' }}>{c}</MenuItem>)}
        <MenuItem value={SIN_CATEGORIA} sx={{ fontSize: '0.875rem' }}>Sin categoría</MenuItem>
      </Select>

      <Select size="small" displayEmpty value={filtro.tipo ?? ''} sx={selectSx} inputProps={{ 'aria-label': 'Tipo' }}
        onChange={(e) => ir({ tipo: ((e.target.value as string) || undefined) as FiltroGastos['tipo'] })}>
        <MenuItem value=""><em>Todos los tipos</em></MenuItem>
        {TIPOS_GASTO.map((t) => <MenuItem key={t.value} value={t.value} sx={{ fontSize: '0.875rem' }}>{t.label}</MenuItem>)}
      </Select>

      <Select size="small" displayEmpty value={filtro.estado ?? ''} sx={selectSx} inputProps={{ 'aria-label': 'Estado de pago' }}
        onChange={(e) => ir({ estado: ((e.target.value as string) || undefined) as FiltroGastos['estado'] })}>
        <MenuItem value=""><em>Todos los estados</em></MenuItem>
        {ESTADOS_GASTO.map((t) => <MenuItem key={t.value} value={t.value} sx={{ fontSize: '0.875rem' }}>{t.label}</MenuItem>)}
      </Select>

      {hayFiltro(filtro) && (
        <Button size="small" onClick={limpiar}
          startIcon={<X style={{ width: 14, height: 14 }} />}
          sx={{ textTransform: 'none', color: '#6b7280', fontSize: '0.8125rem' }}>
          Limpiar filtros
        </Button>
      )}
    </Box>
  );
}
