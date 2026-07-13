'use client';

/**
 * Plan A — Clasificación de la factura con maestros target='factura'.
 * Controlado por el padre (value/onChange) porque la persistencia ocurre
 * después de guardar la factura (cuando ya hay documentoId).
 *
 * - Catálogo: GET /api/facturas/maestros (no depende de doc).
 * - Si editás un borrador (docId), precarga las asignaciones existentes.
 * Devuelve null si el equipo no tiene maestros de factura.
 */

import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { Tags } from 'lucide-react';

interface Valor { id: number; valor: string; }
interface Maestro { id: number; nombre: string; multiple: boolean; valores: Valor[]; }
export interface ClasifAsig { maestroId: number; valorId: number; }

const NONE = '__none__';

export function ClasificacionFactura({
  docId, value, onChange,
}: {
  docId?: number;
  value: ClasifAsig[];
  onChange: (a: ClasifAsig[]) => void;
}) {
  const [maestros, setMaestros] = useState<Maestro[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const preloadedRef = useRef(false);

  // Catálogo de maestros de factura
  useEffect(() => {
    fetch('/api/facturas/maestros')
      .then(r => r.json())
      .then(d => setMaestros(d.maestros ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Precarga de asignaciones al editar un borrador
  useEffect(() => {
    if (!docId || preloadedRef.current) return;
    preloadedRef.current = true;
    fetch(`/api/facturas/${docId}/maestros`)
      .then(r => r.json())
      .then(d => {
        const asg: ClasifAsig[] = d.asignaciones ?? [];
        if (asg.length) onChange(asg);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (!loaded || maestros.length === 0) return null;

  const valsOf = (mid: number) => value.filter(a => a.maestroId === mid).map(a => a.valorId);

  function setSingle(mid: number, valorId: number | null) {
    const rest = value.filter(a => a.maestroId !== mid);
    onChange(valorId == null ? rest : [...rest, { maestroId: mid, valorId }]);
  }
  function toggleMulti(mid: number, valorId: number) {
    const has = value.some(a => a.maestroId === mid && a.valorId === valorId);
    onChange(has
      ? value.filter(a => !(a.maestroId === mid && a.valorId === valorId))
      : [...value, { maestroId: mid, valorId }]);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tags style={{ width: 16, height: 16, color: '#9ca3af' }} />
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Clasificación</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {maestros.map((m) => {
          const sel = valsOf(m.id);
          return (
            <Box key={m.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{m.nombre}</Typography>
              {m.multiple ? (
                m.valores.length === 0 ? (
                  <Typography sx={{ fontSize: '0.75rem', color: '#d1d5db' }}>Sin valores definidos.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {m.valores.map((v) => {
                      const on = sel.includes(v.id);
                      return (
                        <Box
                          key={v.id}
                          component="button"
                          type="button"
                          onClick={() => toggleMulti(m.id, v.id)}
                          sx={{
                            fontSize: '0.875rem',
                            borderRadius: '9999px',
                            px: 1.5,
                            py: 0.5,
                            border: '1px solid',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            bgcolor: on ? '#0d9488' : '#fff',
                            color: on ? '#fff' : '#4b5563',
                            borderColor: on ? '#0d9488' : '#d1d5db',
                            '&:hover': { borderColor: on ? '#0d9488' : '#2dd4bf' },
                          }}
                        >
                          {v.valor}
                        </Box>
                      );
                    })}
                  </Box>
                )
              ) : (
                <FormControl size="small" fullWidth>
                  <Select
                    value={sel.length ? String(sel[0]) : NONE}
                    onChange={(e) => setSingle(m.id, e.target.value === NONE ? null : parseInt(e.target.value))}
                    sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                  >
                    <MenuItem value={NONE}>— Ninguno —</MenuItem>
                    {m.valores.map((v) => <MenuItem key={v.id} value={String(v.id)}>{v.valor}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
