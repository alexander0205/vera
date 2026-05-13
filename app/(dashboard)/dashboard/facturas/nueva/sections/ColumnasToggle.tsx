'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings2 } from 'lucide-react';

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Mostrar/ocultar columnas"
        aria-expanded={open}
        className="text-gray-500 hover:text-gray-700 text-xs font-medium flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Columnas
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mostrar columnas</p>
          <label className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-1">
            <span className="text-sm text-gray-700">Referencia</span>
            <input
              type="checkbox"
              checked={showReferencia}
              onChange={(e) => onToggleReferencia(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
          </label>
          <label className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-1">
            <span className="text-sm text-gray-700">Descripción</span>
            <input
              type="checkbox"
              checked={showDescripcion}
              onChange={(e) => onToggleDescripcion(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
          </label>
        </div>
      )}
    </div>
  );
}
