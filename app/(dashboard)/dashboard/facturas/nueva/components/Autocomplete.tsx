'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Search, X } from 'lucide-react';

export function Autocomplete<T extends { id: number }>({
  placeholder, onSearch, renderOption, onSelect, value, onClear, onCreate, createLabel,
}: {
  placeholder: string;
  onSearch: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  value: string;
  onClear: () => void;
  onCreate?: () => void;
  createLabel?: string;
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
  const listboxId               = useRef(`autocomplete-listbox-${Math.random().toString(36).slice(2, 9)}`).current;

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

  async function handleInput(v: string) {
    setQuery(v);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await onSearch(v);
        setResults(r);
        setHighlight(0);
        calcRect();
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function select(item: T) {
    onSelect(item);
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') setOpen(false);
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

  if (value) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 bg-teal-50 border border-teal-200 rounded-md text-sm font-medium text-teal-800">
        <span className="flex-1 truncate">{value}</span>
        <button type="button" onClick={onClear} className="text-teal-400 hover:text-teal-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
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
      {results.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-500">No se han encontrado resultados</div>
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
      {onCreate && (
        <button type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setOpen(false); onCreate(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-teal-700 font-medium hover:bg-teal-50 flex items-center gap-2 border-t border-gray-200">
          <Plus className="h-4 w-4" />{createLabel ?? 'Crear nuevo'}
        </button>
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
          onFocus={() => { if (results.length > 0) { calcRect(); setOpen(true); } }}
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
