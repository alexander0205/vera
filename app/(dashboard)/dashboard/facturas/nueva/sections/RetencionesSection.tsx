'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { X } from 'lucide-react';
import { RETENCIONES_PREDEFINIDAS } from '../utils/types';
import type { Retencion } from '../utils/types';

interface Props {
  retenciones: Retencion[];
  setRetenciones: React.Dispatch<React.SetStateAction<Retencion[]>>;
  totalesItbis: number;
  totalesSubtotal: number;
}

export function RetencionesSection({
  retenciones, setRetenciones, totalesItbis, totalesSubtotal,
}: Props) {
  function addRetencion() {
    const predef = RETENCIONES_PREDEFINIDAS[0];
    const base2  = predef.tipo === 'itbis' ? totalesItbis : totalesSubtotal;
    setRetenciones(prev => [...prev, {
      id: predef.id, nombre: predef.nombre, porcentaje: predef.porcentaje,
      tipo: predef.tipo, monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)), manual: false,
    }]);
  }

  if (retenciones.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box
          component="button"
          type="button"
          onClick={() => {
            const predef = RETENCIONES_PREDEFINIDAS[0];
            const base2  = predef.tipo === 'itbis' ? totalesItbis : totalesSubtotal;
            setRetenciones([{
              id: predef.id, nombre: predef.nombre, porcentaje: predef.porcentaje,
              tipo: predef.tipo, monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)), manual: false,
            }]);
          }}
          sx={{
            fontSize: '0.875rem',
            color: '#3658e1',
            fontWeight: 500,
            bgcolor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            py: 1,
            my: -1,
            '&:hover': { color: '#2a45c4' },
          }}
        >
          + Agregar Retención
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: 'rgba(249,250,251,0.6)', borderRadius: '8px', p: 1.5, mt: 1.5 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', mb: 1.5 }}
      >
        Retenciones
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {retenciones.map((ret, idx) => (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { md: 'center' },
              gap: { xs: 1, md: 1.5 },
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                textTransform: { xs: 'uppercase', md: 'none' },
                letterSpacing: { xs: '0.08em', md: 'normal' },
                width: { md: 96 },
                flexShrink: { md: 0 },
              }}
            >
              Retención
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: { xs: 'nowrap' }, flexGrow: 1 }}>
              <FormControl size="small" sx={{ flexGrow: 1, maxWidth: { md: 320 } }}>
                <Select
                  value={`${ret.id}__${idx}`}
                  onChange={(e) => {
                    const val = e.target.value as string;
                    const predef = RETENCIONES_PREDEFINIDAS.find(r => r.id === val.split('__')[0]);
                    if (!predef) return;
                    const base2 = predef.tipo === 'itbis' ? totalesItbis : totalesSubtotal;
                    setRetenciones(prev => prev.map((r, i) => i === idx ? {
                      ...r,
                      id: predef.id,
                      nombre: predef.nombre,
                      porcentaje: predef.porcentaje,
                      tipo: predef.tipo,
                      monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)),
                      manual: false,
                    } : r));
                  }}
                  sx={{
                    fontSize: '0.875rem',
                    '& .MuiOutlinedInput-notchedOutline': { borderRadius: '8px' },
                  }}
                >
                  <MenuItem disabled sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', opacity: 1 }}>
                    ITBIS
                  </MenuItem>
                  {RETENCIONES_PREDEFINIDAS.filter(r => r.tipo === 'itbis').map(r => (
                    <MenuItem key={r.id} value={`${r.id}__${idx}`} sx={{ fontSize: '0.875rem' }}>
                      {r.nombre} — {r.porcentaje}%{' '}
                      <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                        ({r.descripcion})
                      </Typography>
                    </MenuItem>
                  ))}
                  <MenuItem disabled sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', borderTop: '1px solid', borderColor: 'divider', mt: 0.5, opacity: 1 }}>
                    ISR
                  </MenuItem>
                  {RETENCIONES_PREDEFINIDAS.filter(r => r.tipo === 'isr').map(r => (
                    <MenuItem key={r.id} value={`${r.id}__${idx}`} sx={{ fontSize: '0.875rem' }}>
                      {r.nombre} — {r.porcentaje}%
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ position: 'relative', width: { xs: 128, md: 144 }, flexShrink: 0 }}>
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'text.secondary',
                    zIndex: 1,
                    pointerEvents: 'none',
                    fontSize: '0.75rem',
                  }}
                >
                  RD$
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  placeholder="0.00"
                  value={ret.monto || ''}
                  onChange={(e) => setRetenciones(prev => prev.map((r, i) => i === idx ? { ...r, monto: parseFloat(e.target.value) || 0, manual: true } : r))}
                  slotProps={{
                    htmlInput: { inputMode: 'decimal', min: 0, step: 0.01, style: { paddingLeft: 36, textAlign: 'right', fontSize: '0.875rem' } },
                  }}
                  sx={{
                    width: '100%',
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                  }}
                />
              </Box>

              <IconButton
                type="button"
                onClick={() => setRetenciones(prev => prev.filter((_, i) => i !== idx))}
                aria-label="Eliminar retención"
                size="small"
                sx={{ color: 'grey.400', '&:hover': { color: 'error.main' } }}
              >
                <X size={16} />
              </IconButton>
            </Box>
          </Box>
        ))}
      </Box>

      <Box
        component="button"
        type="button"
        onClick={addRetencion}
        sx={{
          mt: 1,
          fontSize: '0.875rem',
          color: '#3658e1',
          fontWeight: 500,
          bgcolor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          py: 1,
          my: -0.5,
          '&:hover': { color: '#2a45c4' },
        }}
      >
        + Agregar Retención
      </Box>
    </Box>
  );
}
