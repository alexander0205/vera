'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

interface Props {
  showReferencia: boolean;
  showDescripcion: boolean;
  onToggleReferencia: (v: boolean) => void;
  onToggleDescripcion: (v: boolean) => void;
}

export function ColumnasToggle({
  showReferencia, showDescripcion, onToggleReferencia, onToggleDescripcion,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <Box ref={ref} sx={{ position: 'relative' }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Mostrar/ocultar columnas"
        aria-expanded={open}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5,
          fontSize: '0.75rem', fontWeight: 500, color: '#6b7280',
          borderRadius: '6px', border: 'none', background: 'none', cursor: 'pointer',
          '&:hover': { color: '#374151', bgcolor: '#f9fafb' }, transition: 'all 0.15s',
        }}
      >
        <Settings2 size={14} />
        Columnas
      </Box>
      {open && (
        <Box sx={{ position: 'absolute', right: 0, top: '100%', mt: 0.5, zIndex: 50, bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', p: 1.5, width: 208 }}>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
            Mostrar columnas
          </Typography>
          <FormControlLabel
            control={<Checkbox size="small" checked={showReferencia} onChange={(e) => onToggleReferencia(e.target.checked)} sx={{ color: '#d1d5db', '&.Mui-checked': { color: '#3658e1' }, p: 0.5 }} />}
            label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Referencia</Typography>}
            sx={{ display: 'flex', justifyContent: 'space-between', mx: 0, px: 0.75, py: 0.75, borderRadius: '6px', '&:hover': { bgcolor: '#f9fafb' } }}
            labelPlacement="start"
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={showDescripcion} onChange={(e) => onToggleDescripcion(e.target.checked)} sx={{ color: '#d1d5db', '&.Mui-checked': { color: '#3658e1' }, p: 0.5 }} />}
            label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Descripción</Typography>}
            sx={{ display: 'flex', justifyContent: 'space-between', mx: 0, px: 0.75, py: 0.75, borderRadius: '6px', '&:hover': { bgcolor: '#f9fafb' } }}
            labelPlacement="start"
          />
        </Box>
      )}
    </Box>
  );
}
