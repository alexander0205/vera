'use client';

/**
 * Filtro «desde → hasta» para las pantallas que no usan `DataTable` (tablas
 * propias de Caja, Escolar, Nómina…). Mismo aspecto que el rango de fechas de
 * la barra de filtros de `DataTable`, para que la regla «toda pantalla con
 * listado tiene filtro por fecha» se vea igual en todas partes.
 */
import { Filter, X } from 'lucide-react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { Tooltip } from '@/components/ui/tooltip';

const inputSx = {
  border: '1px solid #e5e7eb', borderRadius: '8px', px: 1.5, py: 0.875,
  fontSize: '0.8125rem', bgcolor: '#ffffff', outline: 'none', fontFamily: 'inherit',
  '&:focus': { borderColor: '#3658e1' },
} as const;

export function RangoFechas({ desde, hasta, onCambiar, label }: {
  desde: string;
  hasta: string;
  onCambiar: (desde: string, hasta: string) => void;
  /** Qué fecha filtra, si no es obvio («Apertura», «Fecha de pago»…). */
  label?: string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }} data-testid="rango-fechas">
      <Filter style={{ width: 14, height: 14, color: '#9ca3af' }} />
      {label && <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{label}</Box>}
      <Box component="input" type="date" aria-label="Desde" value={desde} max={hasta || undefined} sx={inputSx}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCambiar(e.target.value, hasta)} />
      <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280' }}>→</Box>
      <Box component="input" type="date" aria-label="Hasta" value={hasta} min={desde || undefined} sx={inputSx}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCambiar(desde, e.target.value)} />
      {(desde || hasta) && (
        <Tooltip text="Quita el rango de fechas del filtro">
          <IconButton size="small" onClick={() => onCambiar('', '')} aria-label="Limpiar fechas">
            <X style={{ width: 14, height: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
