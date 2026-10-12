'use client';

/** Filtros del libro de secuencias. Navega client-side (no recarga el layout). */
import { useRouter, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { Search, X } from 'lucide-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

const ESTADOS = [
  { value: '',                     label: 'Todos los estados' },
  { value: 'ACEPTADO',             label: 'Aceptado' },
  { value: 'ACEPTADO_CONDICIONAL', label: 'Aceptado condicional' },
  { value: 'EN_PROCESO',           label: 'En proceso' },
  { value: 'RECHAZADO',            label: 'Rechazado' },
  { value: 'ANULADO',              label: 'Anulado' },
  { value: 'BORRADOR',             label: 'Reservado (borrador)' },
];

export function LibroFiltros({
  tipos,
  valores,
}: {
  tipos: string[];
  valores: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function aplicar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();
    for (const k of ['tipo', 'estado', 'q', 'desde', 'hasta']) {
      const v = String(fd.get(k) ?? '').trim();
      if (v) qs.set(k, v);
    }
    if (fd.get('errores')) qs.set('errores', '1');
    startTransition(() => router.push(`${pathname}?${qs.toString()}`));
  }

  const hayFiltros = Object.entries(valores).some(([, v]) => v);

  return (
    <Box
      component="form"
      onSubmit={aplicar}
      sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2, mb: 2.5 }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
        <TextField
          name="q" label="Buscar" defaultValue={valores.q}
          placeholder="e-NCF, cliente o RNC…"
          sx={{ flex: 1, minWidth: 220 }}
        />

        <TextField
          name="tipo" label="Tipo" select defaultValue={valores.tipo}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">Todos</MenuItem>
          {tipos.map(t => <MenuItem key={t} value={t}>e{t}</MenuItem>)}
        </TextField>

        <TextField
          name="estado" label="Estado" select defaultValue={valores.estado}
          sx={{ minWidth: 180 }}
        >
          {ESTADOS.map(e => <MenuItem key={e.value} value={e.value}>{e.label}</MenuItem>)}
        </TextField>

        <TextField
          name="desde" label="Desde" type="date" defaultValue={valores.desde}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          name="hasta" label="Hasta" type="date" defaultValue={valores.hasta}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <FormControlLabel
          control={<Checkbox size="small" name="errores" defaultChecked={valores.errores === '1'} />}
          label="Solo con problemas"
          slotProps={{ typography: { sx: { fontSize: '0.875rem', color: '#4b5563' } } }}
          sx={{ mr: 0, pb: 0.5 }}
        />

        <Button
          type="submit" variant="contained" disabled={pending}
          startIcon={<Search style={{ width: 16, height: 16 }} />}
          sx={{ px: 2, py: 1, bgcolor: '#111827', '&:hover': { bgcolor: '#1f2937' } }}
        >
          {pending ? 'Filtrando…' : 'Filtrar'}
        </Button>

        {hayFiltros && (
          <Button
            type="button" color="inherit"
            onClick={() => startTransition(() => router.push(pathname))}
            startIcon={<X style={{ width: 16, height: 16 }} />}
            sx={{ color: '#6b7280', '&:hover': { color: '#374151' } }}
          >
            Limpiar
          </Button>
        )}
      </Box>
    </Box>
  );
}
