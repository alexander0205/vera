'use client';

import { X, FileText } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { Autocomplete } from '../components/Autocomplete';
import { MOTIVOS_NOTA } from './DetallesSection';

/** Resumen de factura devuelto por GET /api/facturas (para el selector de origen). */
export interface FacturaResumen {
  id: number;
  encf: string;
  codigo: string | null;
  tipoEcf: string;
  estado: string;
  razonSocialComprador: string | null;
  montoTotal: number; // centavos
  fechaEmision: string | null;
}

interface Props {
  /** '33' (ND) o '34' (NC) — define el texto de la etiqueta. */
  tipoEcf: string;
  /** Factura de origen ya seleccionada (o cargada por ?padreId). */
  padreSeleccionado: { id: number; encf: string; codigo: string | null; razonSocial?: string } | null;
  /** La factura de origen tiene e-NCF real (E…) → e-NCF y fecha se cargan solos y van read-only. */
  conEcfReal: boolean;
  /** La factura de origen es sin-ncf (sin comprobante fiscal) → nota interna, sin e-NCF. */
  esPadreSinNcf: boolean;
  buscarFacturas: (q: string) => Promise<FacturaResumen[]>;
  onSelect: (f: FacturaResumen) => void;
  onClear: () => void;
  // Datos de modificación DGII (e-NCF que se modifica, motivo, fecha).
  ncfModificado: string;
  setNcfModificado: (v: string) => void;
  motivoNota: string;
  setMotivoNota: (v: string) => void;
  fechaNcfModificado: string;
  setFechaNcfModificado: (v: string) => void;
  razonModificacion: string;
  setRazonModificacion: (v: string) => void;
  today: string;
}

const labelSx = {
  fontSize: '0.75rem',
  color: '#4b5563',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.025em',
  display: 'block',
  mb: 0.5,
};

const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } };

/**
 * Selector de la factura de origen para una Nota de Crédito/Débito + los datos
 * de modificación (e-NCF que se modifica, motivo, fecha). Al elegir una factura
 * se cargan e-NCF modificado, cliente y líneas. Si la factura tiene e-NCF real,
 * el e-NCF y la fecha van read-only (vienen del original); solo el motivo es
 * editable. Si no tiene e-NCF (no emitida en el sistema), el usuario los escribe.
 */
export function FacturaOrigenSection({
  tipoEcf, padreSeleccionado, conEcfReal, esPadreSinNcf, buscarFacturas, onSelect, onClear,
  ncfModificado, setNcfModificado, motivoNota, setMotivoNota,
  fechaNcfModificado, setFechaNcfModificado, razonModificacion, setRazonModificacion,
  today,
}: Props) {
  const esNc = tipoEcf === '34';
  const label = `Factura de origen — ${esNc ? 'nota de crédito' : 'nota de débito'}`;

  const valorActual = padreSeleccionado
    ? `${padreSeleccionado.encf || padreSeleccionado.codigo || `#${padreSeleccionado.id}`}`
      + (padreSeleccionado.razonSocial ? ` · ${padreSeleccionado.razonSocial}` : '')
    : '';

  return (
    <Box sx={{ bgcolor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)', px: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 } }}>
      <Typography component="label" sx={{ ...labelSx, mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <FileText style={{ width: 14, height: 14 }} />
        {label}
        <Box component="span" sx={{ color: '#ef4444' }} aria-label="campo obligatorio">*</Box>
      </Typography>

      <Box sx={{ position: 'relative' }}>
        <Autocomplete<FacturaResumen>
          placeholder="Buscar factura por e-NCF o cliente…"
          value={valorActual}
          onSearch={buscarFacturas}
          onSelect={onSelect}
          onClear={onClear}
          renderOption={(f) => (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.encf || f.codigo || `#${f.id}`}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.razonSocialComprador ?? 'Sin cliente'}</Typography>
              </Box>
              <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280', flexShrink: 0, whiteSpace: 'nowrap' }}>
                RD$ {(f.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </Box>
            </Box>
          )}
        />
        {padreSeleccionado && (
          <IconButton
            type="button"
            onClick={onClear}
            aria-label="Quitar factura de origen"
            title="Quitar factura de origen"
            sx={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              color: '#9ca3af', p: 0.5, zIndex: 10, '&:hover': { color: '#ef4444', bgcolor: 'transparent' },
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </IconButton>
        )}
      </Box>

      {!padreSeleccionado && (
        <Typography sx={{ fontSize: '11px', color: '#6b7280', mt: 0.75 }}>
          Selecciona la factura de origen. Se cargarán el e-NCF modificado, el cliente y las líneas.
        </Typography>
      )}

      {/* Factura sin comprobante fiscal → nota interna, sin e-NCF que referenciar. */}
      {padreSeleccionado && esPadreSinNcf && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontSize: '11px', color: '#6b7280' }}>Sin comprobante fiscal — nota interna, solo borrador.</Typography>
          <Box sx={{ maxWidth: { sm: 384 } }}>
            <Typography component="label" sx={labelSx}>Motivo</Typography>
            <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
              <Select
                value={motivoNota || ''}
                onChange={(e) => setMotivoNota(e.target.value)}
                displayEmpty
                renderValue={(v) => (v
                  ? MOTIVOS_NOTA.find((m) => m.value === v)?.label ?? v
                  : <Box component="span" sx={{ color: '#9ca3af' }}>Selecciona el motivo…</Box>)}
                sx={{ borderRadius: '8px' }}
              >
                {MOTIVOS_NOTA.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {motivoNota === 'otro' && (
            <Box>
              <Typography component="label" sx={labelSx}>Especifica el motivo</Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="Describe brevemente el motivo de la nota…"
                value={razonModificacion}
                onChange={(e) => setRazonModificacion(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 500 } }}
                sx={{ mt: 0.5, ...inputSx }}
              />
            </Box>
          )}
        </Box>
      )}

      {/* Datos de modificación DGII — aparecen al elegir la factura de origen. */}
      {padreSeleccionado && !esPadreSinNcf && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5, mt: 1.5, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Box>
            <Typography component="label" sx={labelSx}>
              e-NCF que se modifica <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="E310000000001"
              value={ncfModificado}
              onChange={(e) => setNcfModificado(e.target.value.toUpperCase())}
              disabled={conEcfReal}
              slotProps={{ htmlInput: { maxLength: 13 } }}
              sx={{
                mt: 0.5, ...inputSx,
                '& .MuiOutlinedInput-root.Mui-disabled': { bgcolor: '#f9fafb' },
                '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#4b5563' },
              }}
            />
            {!conEcfReal && (
              <Typography sx={{ fontSize: '10px', color: '#b45309', mt: 0.5 }}>La factura de origen no tiene e-NCF — escríbelo para emitir.</Typography>
            )}
          </Box>
          <Box>
            <Typography component="label" sx={labelSx}>
              Motivo <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
              <Select
                value={motivoNota || ''}
                onChange={(e) => setMotivoNota(e.target.value)}
                displayEmpty
                renderValue={(v) => (v
                  ? MOTIVOS_NOTA.find((m) => m.value === v)?.label ?? v
                  : <Box component="span" sx={{ color: '#9ca3af' }}>Selecciona el motivo…</Box>)}
                sx={{ borderRadius: '8px' }}
              >
                {MOTIVOS_NOTA.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography component="label" sx={labelSx}>
              Fecha del e-NCF original <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="date"
              value={fechaNcfModificado}
              onChange={(e) => setFechaNcfModificado(e.target.value)}
              disabled={conEcfReal}
              slotProps={{ htmlInput: { max: today }, inputLabel: { shrink: true } }}
              sx={{
                mt: 0.5, ...inputSx,
                '& .MuiOutlinedInput-root.Mui-disabled': { bgcolor: '#f9fafb' },
                '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#4b5563' },
              }}
            />
          </Box>
          {motivoNota === 'otro' && (
            <Box sx={{ gridColumn: { sm: 'span 2', lg: 'span 3' } }}>
              <Typography component="label" sx={labelSx}>
                Especifica el motivo <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="Describe brevemente el motivo de la nota…"
                value={razonModificacion}
                onChange={(e) => setRazonModificacion(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 500 } }}
                sx={{ mt: 0.5, ...inputSx }}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
