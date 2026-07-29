'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Search } from 'lucide-react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import CircularProgress from '@mui/material/CircularProgress';

export function Autocomplete<T extends { id: number }>({
  placeholder, onSearch, renderOption, onSelect, value, onClear, onCreate, createLabel,
  onFreeText, freeTextLabel, dropdownMinWidth,
}: {
  placeholder: string;
  onSearch: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  value: string;
  onClear: () => void;
  onCreate?: () => void;
  createLabel?: string;
  /** Si está definido, permite usar texto libre (sin seleccionar producto). */
  onFreeText?: (text: string) => void;
  /** Etiqueta del botón "usar texto libre" cuando no hay match. */
  freeTextLabel?: string;
  /** Ancho mínimo (px) del dropdown. Si supera el ancho del input, el panel se
   *  ensancha más allá de la celda (útil para opciones tipo tabla). */
  dropdownMinWidth?: number;
}) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<T[]>([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [highlight, setHighlight] = useState(0);
  const timer                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef              = useRef<HTMLDivElement>(null);
  const dropRef                 = useRef<HTMLDivElement>(null);
  // useId → estable entre SSR y cliente (evita hydration mismatch en aria-controls).
  const listboxId               = useId();

  // Calcula posición del dropdown en coordenadas del viewport (fixed)
  const calcRect = useCallback(() => {
    if (wrapperRef.current) setDropRect(wrapperRef.current.getBoundingClientRect());
  }, []);

  // Cierra al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Actualiza posición al hacer scroll/resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', calcRect, true);
    window.addEventListener('resize', calcRect);
    return () => {
      window.removeEventListener('scroll', calcRect, true);
      window.removeEventListener('resize', calcRect);
    };
  }, [open, calcRect]);

  // Sync input text with the externally selected value
  useEffect(() => {
    setQuery(value ?? '');
  }, [value]);

  async function handleInput(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await onSearch(v); // query vacío → todos los productos
        setResults(r);
        setHighlight(0);
        calcRect();
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  async function handleFocus() {
    // Mostrar todos los productos al hacer focus (sin necesidad de escribir)
    if (results.length > 0) { calcRect(); setOpen(true); return; }
    setLoading(true);
    try {
      const r = await onSearch('');
      setResults(r);
      calcRect();
      setOpen(r.length > 0);
    } finally {
      setLoading(false);
    }
  }

  function select(item: T) {
    onSelect(item);
    // No limpiar query aquí — el useEffect([value]) lo sincroniza al nombre
    // del producto seleccionado una vez que el padre actualiza el prop value.
    setOpen(false);
    setResults([]);
  }

  function commitFreeText() {
    const q = query.trim();
    if (q && onFreeText) {
      onFreeText(q);
      setQuery('');
      setOpen(false);
      setResults([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      // Enter con texto libre → promover query a nombreItem
      if (e.key === 'Enter' && query.trim() && onFreeText) {
        e.preventDefault();
        commitFreeText();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[highlight];
      if (item) select(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Ancho del panel: por defecto = ancho del input; si se pide dropdownMinWidth
  // mayor, el panel se ensancha (limitado al viewport) y se ajusta el left para
  // que no se desborde por el borde derecho.
  const vw      = typeof window !== 'undefined' ? window.innerWidth : (dropRect?.width ?? 0);
  const dropW   = dropRect
    ? Math.min(Math.max(dropRect.width, dropdownMinWidth ?? 0), vw - 16)
    : 0;
  const dropLeft = dropRect ? Math.max(8, Math.min(dropRect.left, vw - dropW - 8)) : 0;

  const dropdown = open && dropRect ? (
    <Box
      ref={dropRef}
      id={listboxId}
      role="listbox"
      sx={{
        position: 'fixed',
        top:   dropRect.bottom + 4,
        left:  dropLeft,
        width: dropW,
        zIndex: 9999,
        pointerEvents: 'auto',
        bgcolor: 'white',
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
        maxHeight: 224,
        overflow: 'auto',
      }}
    >
      {/* "+ Nuevo producto" siempre al inicio */}
      {onCreate && (
        <Box
          component="button"
          type="button"
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          onClick={() => { setOpen(false); onCreate(); }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: '100%',
            textAlign: 'left',
            px: 2,
            py: 1.25,
            fontSize: '0.875rem',
            color: '#0f766e',
            fontWeight: 500,
            bgcolor: 'transparent',
            border: 'none',
            borderBottom: '1px solid',
            borderColor: 'grey.200',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(13,148,136,0.06)' },
          }}
        >
          <Plus size={16} />{createLabel ?? 'Crear nuevo'}
        </Box>
      )}
      {results.length === 0 ? (
        <>
          <Box sx={{ px: 2, py: 1.5, fontSize: '0.875rem', color: 'text.secondary' }}>
            No se han encontrado resultados
          </Box>
          {onFreeText && query.trim() && (
            <Box
              component="button"
              type="button"
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              onClick={commitFreeText}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                width: '100%',
                textAlign: 'left',
                px: 2,
                py: 1.25,
                fontSize: '0.875rem',
                color: '#0f766e',
                fontWeight: 500,
                bgcolor: 'transparent',
                border: 'none',
                borderTop: '1px solid',
                borderColor: 'grey.200',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(13,148,136,0.06)' },
              }}
            >
              <Plus size={16} />
              {freeTextLabel ?? `Usar "${query.trim()}" como descripción`}
            </Box>
          )}
        </>
      ) : (
        results.map((item, idx) => (
          <Box
            key={item.id}
            component="button"
            type="button"
            role="option"
            aria-selected={idx === highlight}
            sx={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              px: 2,
              py: 1.25,
              fontSize: '0.875rem',
              borderBottom: idx < results.length - 1 ? '1px solid' : 'none',
              borderColor: 'grey.100',
              bgcolor: idx === highlight ? 'rgba(13,148,136,0.06)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              '&:hover': { bgcolor: idx === highlight ? 'rgba(13,148,136,0.06)' : 'grey.50' },
            }}
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx)}
            onClick={() => select(item)}
          >
            {renderOption(item)}
          </Box>
        ))
      )}
    </Box>
  ) : null;

  return (
    <Box ref={wrapperRef} sx={{ position: 'relative' }}>
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          border: '1px solid',
          borderColor: 'grey.300',
          borderRadius: '8px',
          bgcolor: 'white',
          height: 36,
          '&:hover': { borderColor: 'grey.400' },
          '&:focus-within': { borderColor: '#0d9488', boxShadow: '0 0 0 2px rgba(13,148,136,0.2)' },
        }}
      >
        <Box sx={{ position: 'absolute', left: 12, display: 'flex', alignItems: 'center', color: 'grey.500', pointerEvents: 'none' }}>
          <Search size={14} />
        </Box>
        <InputBase
          sx={{ pl: '32px', pr: '32px', fontSize: '0.875rem', width: '100%', height: '100%' }}
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={handleFocus}
          onBlur={() => {
            setTimeout(() => {
              setOpen(false);
              // Restore displayed text to the selected value if user didn't pick a new one
              setQuery(value ?? '');
            }, 200);
          }}
          onKeyDown={handleKeyDown}
          inputProps={{
            role: 'combobox',
            'aria-autocomplete': 'list',
            'aria-expanded': open,
            'aria-controls': listboxId,
            'aria-activedescendant': open && results[highlight] ? `${listboxId}-${results[highlight].id}` : undefined,
          }}
        />
        {loading && (
          <Box sx={{ position: 'absolute', right: 10, display: 'flex', alignItems: 'center' }}>
            <CircularProgress size={14} sx={{ color: 'grey.500' }} />
          </Box>
        )}
      </Box>
      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </Box>
  );
}
