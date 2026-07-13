'use client';

/**
 * RncSearch — Autocomplete que busca RNC (padrón DGII) o Cédula (OGTIC)
 *
 * Detección automática:
 *   - 11 dígitos (con o sin guiones) → consulta cédula en OGTIC
 *   - 9 dígitos o texto              → busca en padrón RNC DGII
 *
 * Uso:
 * <RncSearch
 *   onSelect={(r) => { setRnc(r.rnc); setNombre(r.nombre); }}
 *   placeholder="Buscar RNC, Cédula o razón social..."
 * />
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Building2, User, AlertCircle, X } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RncResult {
  rnc:             string;   // RNC de 9 dígitos o cédula formateada
  nombre:          string;
  nombreComercial: string | null;
  estado:          string | null;
  estadoLabel:     string;
  tipo:            'rnc' | 'cedula';
}

interface RncSearchProps {
  onSelect:     (result: RncResult) => void;
  value?:       string;
  onClear?:     () => void;
  placeholder?: string;
  className?:   string;
  showSyncHint?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Quita guiones/espacios y devuelve solo dígitos */
function soloDigitos(v: string) { return v.replace(/[-\s]/g, ''); }

/** ¿Es una cédula dominicana? (exactamente 11 dígitos) */
function esCedula(v: string) { return /^\d{11}$/.test(soloDigitos(v)); }

/** ¿Es un RNC parcial o completo? (solo dígitos, 2-9 chars) */
function esRncDigitos(v: string) { return /^\d{2,9}$/.test(v.trim()); }

// ─── Componente ───────────────────────────────────────────────────────────────

export function RncSearch({
  onSelect, value, onClear,
  placeholder = 'Buscar RNC, Cédula o razón social…',
  showSyncHint = true,
}: RncSearchProps) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<RncResult[]>([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [noData, setNoData]     = useState(false);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  // ── Posición del dropdown (fixed / portal) ────────────────────────────────

  const calcRect = useCallback(() => {
    if (wrapperRef.current) setDropRect(wrapperRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', calcRect, true);
    window.addEventListener('resize', calcRect);
    return () => {
      window.removeEventListener('scroll', calcRect, true);
      window.removeEventListener('resize', calcRect);
    };
  }, [open, calcRect]);

  // ── Cierre al hacer clic fuera ────────────────────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Sincroniza el texto del input con el valor seleccionado externamente
  // (mismo patrón que el Autocomplete de producto — sin "chip" verde).
  useEffect(() => {
    setQuery(value ?? '');
  }, [value]);

  // ── Búsqueda ──────────────────────────────────────────────────────────────

  async function handleInput(v: string) {
    setQuery(v);
    setNoData(false);

    const trimmed = v.trim();
    // Si había un valor seleccionado y el usuario vacía el campo → limpiar selección.
    if (trimmed.length === 0 && value && onClear) onClear();
    if (trimmed.length < 2) { setResults([]); setOpen(false); return; }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const digitos = soloDigitos(trimmed);

        if (esCedula(trimmed)) {
          // ── Búsqueda de cédula ──────────────────────────────────────────
          const res  = await fetch(`/api/cedula/lookup?cedula=${digitos}`);
          const data = await res.json();

          const resultado: RncResult = {
            rnc:             data.cedula ?? trimmed,
            nombre:          data.nombre ?? 'Persona física',
            nombreComercial: null,
            estado:          null,
            estadoLabel:     data.encontrado ? 'Verificado' : 'Sin verificar',
            tipo:            'cedula',
          };
          setResults([resultado]);
          setNoData(false);
        } else {
          // ── Búsqueda RNC / nombre ───────────────────────────────────────
          const q   = esRncDigitos(trimmed) ? digitos : trimmed;
          const res = await fetch(`/api/rnc/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          const list: RncResult[] = (data.results ?? []).map((r: Omit<RncResult, 'tipo'>) => ({
            ...r,
            tipo: 'rnc' as const,
          }));
          setResults(list);
          setNoData(list.length === 0);
        }

        calcRect();
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function select(r: RncResult) {
    onSelect(r);
    // No limpiar query — el useEffect([value]) lo sincroniza al valor seleccionado.
    setOpen(false);
    setResults([]);
    setNoData(false);
  }

  /** Usa el número tecleado tal cual, aunque no esté en el padrón DGII. */
  function usarManual(digitos: string) {
    select({
      rnc:             digitos,
      nombre:          '',           // sin razón social → no autocompletar nombre
      nombreComercial: null,
      estado:          null,
      estadoLabel:     'Sin verificar',
      tipo:            esCedula(digitos) ? 'cedula' : 'rnc',
    });
  }

  /** Limpia la selección y el texto del input. */
  function clear() {
    onClear?.();
    setQuery('');
    setResults([]);
    setNoData(false);
    setOpen(false);
  }

  // RNC (9), cédula (11) o pasaporte (alfanumérico 5-20) válido, para "usar de todos modos".
  const digitosActuales = soloDigitos(query.trim());
  const valorManual     = digitosActuales.toUpperCase(); // normalizado: sin guiones/espacios, uppercase
  const puedeUsarManual =
    /^\d{9}$|^\d{11}$/.test(digitosActuales) ||
    /^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,20}$/.test(valorManual);

  // ── Dropdown (portal) ─────────────────────────────────────────────────────

  const dropdown = open && dropRect ? (
    <Box
      ref={dropRef}
      sx={{
        position: 'fixed',
        top:   dropRect.bottom + 4,
        left:  dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
        pointerEvents: 'auto',
        bgcolor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
        maxHeight: 288,
        overflow: 'auto',
      }}
    >
      {results.length === 0 && noData ? (
        <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 0.5 }}>No se encontraron resultados en el padrón DGII</Typography>
          {puedeUsarManual && (
            <Box
              component="button"
              type="button"
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={() => usarManual(valorManual)}
              sx={{
                mt: 0.5, mb: 1, display: 'inline-flex', alignItems: 'center', gap: 0.75,
                borderRadius: '8px', bgcolor: '#f0fdfa', px: 1.5, py: 0.75, fontSize: '0.875rem',
                fontWeight: 500, color: '#0f766e', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background-color 0.15s', '&:hover': { bgcolor: '#ccfbf1' },
              }}
            >
              Usar «{valorManual}» de todos modos
            </Box>
          )}
          {showSyncHint && (
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              ¿Padrón vacío?{' '}
              <Box
                component="button"
                type="button"
                onClick={async () => {
                  setOpen(false);
                  alert('Sincronizando padrón DGII, esto puede tomar 1-2 minutos…');
                  await fetch('/api/rnc/sync', { method: 'POST' });
                  alert('¡Listo! Vuelve a buscar el RNC o nombre.');
                }}
                sx={{
                  color: '#0d9488', textDecoration: 'underline', border: 'none', bgcolor: 'transparent',
                  p: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
                }}
              >
                Sincronizar ahora
              </Box>
            </Typography>
          )}
        </Box>
      ) : (
        results.map((r) => (
          <Box
            component="button"
            key={r.rnc}
            type="button"
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            onClick={() => select(r)}
            sx={{
              display: 'block', width: '100%', textAlign: 'left', px: 2, py: 1.5,
              border: 'none', borderBottom: '1px solid #f9fafb', bgcolor: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'background-color 0.15s',
              '&:last-child': { borderBottom: 'none' },
              '&:hover': { bgcolor: '#f9fafb' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                {r.tipo === 'cedula'
                  ? <User style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0, marginTop: 2 }} />
                  : <Building2 style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0, marginTop: 2 }} />
                }
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nombreComercial || r.nombre}
                  </Typography>
                  {r.tipo === 'cedula' && r.nombre !== 'Persona física' && (
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Persona física</Typography>
                  )}
                  {r.tipo === 'rnc' && r.nombreComercial && r.nombreComercial !== r.nombre && (
                    <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</Typography>
                  )}
                </Box>
              </Box>
              <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{r.rnc}</Typography>
                {r.tipo === 'rnc' && r.estado !== '2' && (
                  <Box component="span" sx={{ fontSize: '10px', color: '#d97706', display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'flex-end', mt: 0.25 }}>
                    <AlertCircle style={{ width: 12, height: 12 }} />{r.estadoLabel}
                  </Box>
                )}
                {r.tipo === 'cedula' && (
                  <Box component="span" sx={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'flex-end', mt: 0.25, color: r.estadoLabel === 'Verificado' ? '#059669' : '#9ca3af' }}>
                    {r.estadoLabel}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        ))
      )}
    </Box>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box ref={wrapperRef} sx={{ position: 'relative' }}>
      <TextField
        fullWidth
        size="small"
        placeholder={placeholder}
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0) { calcRect(); setOpen(true); } }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            // Restaurar el texto al valor seleccionado si el usuario no eligió otro.
            setQuery(value ?? '');
          }, 200);
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search style={{ width: 14, height: 14, color: '#9ca3af' }} />
              </InputAdornment>
            ),
            endAdornment: loading ? (
              <CircularProgress size={14} sx={{ color: '#9ca3af' }} />
            ) : query.trim() ? (
              <IconButton
                aria-label="Borrar"
                size="small"
                onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                onClick={clear}
                sx={{ p: 0.25, color: '#9ca3af', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}
              >
                <X style={{ width: 14, height: 14 }} />
              </IconButton>
            ) : null,
          },
        }}
      />

      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </Box>
  );
}
