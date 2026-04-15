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
import { Search, Loader2, X, Building2, User, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

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
  className = '', showSyncHint = true,
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

  // ── Búsqueda ──────────────────────────────────────────────────────────────

  async function handleInput(v: string) {
    setQuery(v);
    setNoData(false);

    const trimmed = v.trim();
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
    setQuery('');
    setOpen(false);
    setResults([]);
    setNoData(false);
  }

  // ── Modo "valor seleccionado" ─────────────────────────────────────────────

  if (value) {
    return (
      <div className={`flex items-center gap-2 h-9 px-3 bg-teal-50 border border-teal-200 rounded-md text-sm font-medium text-teal-800 ${className}`}>
        <Building2 className="h-3.5 w-3.5 text-teal-500 shrink-0" />
        <span className="flex-1 truncate">{value}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="text-teal-400 hover:text-teal-700 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  // ── Dropdown (portal) ─────────────────────────────────────────────────────

  const dropdown = open && dropRect ? (
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top:   dropRect.bottom + 4,
        left:  dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-auto"
    >
      {results.length === 0 && noData ? (
        <div className="px-4 py-4 text-center">
          <p className="text-sm text-gray-500 mb-1">No se encontraron resultados en el padrón DGII</p>
          {showSyncHint && (
            <p className="text-xs text-gray-400">
              ¿Padrón vacío?{' '}
              <button
                type="button"
                className="text-teal-600 underline"
                onClick={async () => {
                  setOpen(false);
                  alert('Sincronizando padrón DGII, esto puede tomar 1-2 minutos…');
                  await fetch('/api/rnc/sync', { method: 'POST' });
                  alert('¡Listo! Vuelve a buscar el RNC o nombre.');
                }}>
                Sincronizar ahora
              </button>
            </p>
          )}
        </div>
      ) : (
        results.map((r) => (
          <button
            key={r.rnc}
            type="button"
            className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(r)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-start gap-2">
                {r.tipo === 'cedula'
                  ? <User className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  : <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                }
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {r.nombreComercial || r.nombre}
                  </p>
                  {r.tipo === 'cedula' && r.nombre !== 'Persona física' && (
                    <p className="text-xs text-gray-400">Persona física</p>
                  )}
                  {r.tipo === 'rnc' && r.nombreComercial && r.nombreComercial !== r.nombre && (
                    <p className="text-xs text-gray-500 truncate">{r.nombre}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs text-gray-500">{r.rnc}</p>
                {r.tipo === 'rnc' && r.estado !== '2' && (
                  <span className="text-[10px] text-amber-600 flex items-center gap-0.5 justify-end mt-0.5">
                    <AlertCircle className="h-3 w-3" />{r.estadoLabel}
                  </span>
                )}
                {r.tipo === 'cedula' && (
                  <span className={`text-[10px] flex items-center gap-0.5 justify-end mt-0.5 ${
                    r.estadoLabel === 'Verificado' ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                    {r.estadoLabel}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          className="pl-8 h-9 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) { calcRect(); setOpen(true); } }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
        )}
      </div>

      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
