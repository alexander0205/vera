'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Search } from 'lucide-react';

export function Autocomplete<T extends { id: number }>({
  placeholder, onSearch, renderOption, onSelect, value, onClear, onCreate, createLabel,
  onFreeText, freeTextLabel,
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

  const dropdown = open && dropRect ? (
    <div
      ref={dropRef}
      id={listboxId}
      role="listbox"
      style={{
        position: 'fixed',
        top:   dropRect.bottom + 4,
        left:  dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-auto"
    >
      {/* "+ Nuevo producto" siempre al inicio */}
      {onCreate && (
        <button type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setOpen(false); onCreate(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-teal-700 font-medium hover:bg-teal-50 flex items-center gap-2 border-b border-gray-200">
          <Plus className="h-4 w-4" />{createLabel ?? 'Crear nuevo'}
        </button>
      )}
      {results.length === 0 ? (
        <>
          <div className="px-4 py-3 text-sm text-gray-500">No se han encontrado resultados</div>
          {onFreeText && query.trim() && (
            <button type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commitFreeText}
              className="w-full text-left px-4 py-2.5 text-sm text-teal-700 font-medium hover:bg-teal-50 flex items-center gap-2 border-t border-gray-200">
              <Plus className="h-4 w-4" />
              {freeTextLabel ?? `Usar "${query.trim()}" como descripción`}
            </button>
          )}
        </>
      ) : (
        results.map((item, idx) => (
          <button key={item.id} type="button"
            role="option"
            aria-selected={idx === highlight}
            className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 ${idx === highlight ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx)}
            onClick={() => select(item)}>
            {renderOption(item)}
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600" />
        <Input
          className="pl-8 h-9 text-sm"
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
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && results[highlight] ? `${listboxId}-${results[highlight].id}` : undefined}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-600" />}
      </div>
      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
