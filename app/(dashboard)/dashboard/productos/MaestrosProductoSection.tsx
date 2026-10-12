'use client';

/**
 * Sección "Atributos" del formulario de producto. Carga los maestros del equipo
 * aplicables al producto (auto por tipo + manuales agregados) y guarda las
 * asignaciones de inmediato vía PUT /api/productos/[id]/maestros.
 *
 * Aislado a propósito: se monta solo en modo edición (el producto ya existe).
 * Tras fusionar la rama inventario, su hogar natural es /dashboard/productos/[id].
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { Plus, Check } from 'lucide-react';

interface Valor { id: number; valor: string; }
interface Maestro {
  id: number;
  nombre: string;
  aplicaA: 'bien' | 'servicio' | 'ambos' | 'manual';
  multiple: boolean;
  auto: boolean;
  valores: Valor[];
}
interface Asignacion { maestroId: number; valorId: number; }

const NONE = '__none__';

export default function MaestrosProductoSection({ productId }: { productId: number }) {
  const [maestros, setMaestros]   = useState<Maestro[]>([]);
  const [sel, setSel]             = useState<Map<number, Set<number>>>(new Map());
  const [extra, setExtra]         = useState<Set<number>>(new Set()); // manuales agregados manualmente
  const [loading, setLoading]     = useState(true);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/productos/${productId}/maestros`);
      const data = await res.json();
      const ms: Maestro[] = data.maestros ?? [];
      const asg: Asignacion[] = data.asignaciones ?? [];
      const map = new Map<number, Set<number>>();
      for (const a of asg) {
        if (!map.has(a.maestroId)) map.set(a.maestroId, new Set());
        map.get(a.maestroId)!.add(a.valorId);
      }
      setMaestros(ms);
      setSel(map);
      // Manuales con asignación previa quedan visibles
      setExtra(new Set(ms.filter(m => !m.auto && map.has(m.id)).map(m => m.id)));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = useCallback(async (map: Map<number, Set<number>>) => {
    setSavingState('saving');
    const asignaciones: Asignacion[] = [];
    for (const [maestroId, set] of map) {
      for (const valorId of set) asignaciones.push({ maestroId, valorId });
    }
    try {
      const res = await fetch(`/api/productos/${productId}/maestros`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asignaciones }),
      });
      setSavingState(res.ok ? 'saved' : 'error');
      if (res.ok) setTimeout(() => setSavingState('idle'), 1500);
    } catch {
      setSavingState('error');
    }
  }, [productId]);

  function setSingle(maestroId: number, valorId: number | null) {
    setSel((prev) => {
      const next = new Map(prev);
      if (valorId == null) next.delete(maestroId);
      else next.set(maestroId, new Set([valorId]));
      guardar(next);
      return next;
    });
  }

  function toggleMulti(maestroId: number, valorId: number) {
    setSel((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(maestroId) ?? []);
      if (set.has(valorId)) set.delete(valorId);
      else set.add(valorId);
      if (set.size) next.set(maestroId, set);
      else next.delete(maestroId);
      guardar(next);
      return next;
    });
  }

  const visibles = useMemo(
    () => maestros.filter(m => m.auto || extra.has(m.id)),
    [maestros, extra],
  );
  // Solo los maestros 'manual' son agregables a mano. Los de scope automático
  // (bien/servicio/ambos) aparecen solos cuando el tipo coincide y NO deben
  // poder añadirse a un tipo que no les toca (ej. un maestro de bienes en un servicio).
  const agregables = useMemo(
    () => maestros.filter(m => m.aplicaA === 'manual' && !extra.has(m.id)),
    [maestros, extra],
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: '#9ca3af', py: 1 }}>
        <CircularProgress size={16} sx={{ color: '#9ca3af' }} /> Cargando atributos…
      </Box>
    );
  }

  if (maestros.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: '1px solid #e5e7eb', pt: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>Atributos</Typography>
        {savingState === 'saving' && <Box component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 0.5 }}><CircularProgress size={12} sx={{ color: '#9ca3af' }} />Guardando…</Box>}
        {savingState === 'saved'  && <Box component="span" sx={{ fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 0.5 }}><Check size={12} />Guardado</Box>}
        {savingState === 'error'  && <Box component="span" sx={{ fontSize: '0.75rem', color: '#dc2626' }}>Error al guardar</Box>}
      </Box>

      {visibles.length === 0 && (
        <Typography variant="caption" sx={{ color: '#9ca3af' }}>No hay atributos aplicables. Agrega uno manual abajo.</Typography>
      )}

      {visibles.map((m) => {
        const set = sel.get(m.id) ?? new Set<number>();
        return (
          <Box key={m.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>{m.nombre}</Typography>
            {m.multiple ? (
              m.valores.length === 0 ? (
                <Typography variant="caption" sx={{ color: '#d1d5db' }}>Sin valores definidos en este maestro.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {m.valores.map((v) => {
                    const on = set.has(v.id);
                    return (
                      <Button
                        key={v.id}
                        type="button"
                        onClick={() => toggleMulti(m.id, v.id)}
                        disableElevation
                        variant={on ? 'contained' : 'outlined'}
                        sx={{
                          textTransform: 'none',
                          borderRadius: '9999px',
                          px: 1.5,
                          py: 0.5,
                          minWidth: 0,
                          fontSize: '0.875rem',
                          ...(on
                            ? { bgcolor: '#3658e1', color: '#fff', borderColor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }
                            : { bgcolor: '#fff', color: '#4b5563', borderColor: '#d1d5db', '&:hover': { borderColor: '#8193f5', bgcolor: '#fff' } }),
                        }}
                      >
                        {v.valor}
                      </Button>
                    );
                  })}
                </Box>
              )
            ) : (
              <FormControl size="small" fullWidth>
                <Select
                  value={set.size ? String([...set][0]) : NONE}
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

      {agregables.length > 0 && (
        <Box sx={{ pt: 0.5 }}>
          <FormControl size="small">
            <Select
              value=""
              displayEmpty
              onChange={(e) => setExtra((p) => new Set(p).add(parseInt(e.target.value)))}
              renderValue={() => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#2a45c4' }}>
                  <Plus size={16} />
                  Agregar atributo
                </Box>
              )}
              sx={{ borderRadius: '8px', fontSize: '0.875rem', color: '#2a45c4', '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed', borderColor: '#c7d2fc' } }}
            >
              {agregables.map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.nombre}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      )}
    </Box>
  );
}
