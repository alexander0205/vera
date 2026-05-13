'use client';

import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

interface Props {
  terminosCondiciones: string;
  setTerminos: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
}

const COMPACT_BTN =
  'text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors';

export function TerminosNotas({ terminosCondiciones, setTerminos, notas, setNotas }: Props) {
  // Auto-expand on mount if any content exists (borrador edit case)
  const [showTerminos, setShowTerminos] = useState(() => terminosCondiciones.trim().length > 0);
  const [showNotas, setShowNotas]       = useState(() => notas.trim().length > 0);

  // If parent injects content later (rare), keep them open
  useEffect(() => { if (terminosCondiciones.trim().length > 0) setShowTerminos(true); }, [terminosCondiciones]);
  useEffect(() => { if (notas.trim().length > 0) setShowNotas(true); }, [notas]);

  const terminosRef = useRef<HTMLTextAreaElement>(null);
  const notasRef    = useRef<HTMLTextAreaElement>(null);

  function openTerminos() { setShowTerminos(true); setTimeout(() => terminosRef.current?.focus(), 0); }
  function openNotas()    { setShowNotas(true);    setTimeout(() => notasRef.current?.focus(), 0); }

  function closeTerminos() { setTerminos(''); setShowTerminos(false); }
  function closeNotas()    { setNotas('');    setShowNotas(false); }

  const bothHidden = !showTerminos && !showNotas;
  if (bothHidden) {
    return (
      <div className="px-4 py-3 md:px-8 md:py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
        <button type="button" onClick={openTerminos} className={COMPACT_BTN}>
          <Plus className="h-3.5 w-3.5" /> Términos y condiciones
        </button>
        <button type="button" onClick={openNotas} className={COMPACT_BTN}>
          <Plus className="h-3.5 w-3.5" /> Notas
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-8 md:py-5 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 border-b border-gray-100">
      {showTerminos ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-sm font-medium text-gray-700">Términos y condiciones</Label>
            <button
              type="button"
              onClick={closeTerminos}
              aria-label="Quitar términos y condiciones"
              className="text-gray-400 hover:text-red-500 transition-colors p-1 -m-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            ref={terminosRef}
            className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
            placeholder="Ej: Pago en cuenta corriente 000000001..."
            value={terminosCondiciones}
            onChange={(e) => setTerminos(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex md:items-start">
          <button type="button" onClick={openTerminos} className={COMPACT_BTN}>
            <Plus className="h-3.5 w-3.5" /> Términos y condiciones
          </button>
        </div>
      )}

      {showNotas ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-sm font-medium text-gray-700">Notas</Label>
            <button
              type="button"
              onClick={closeNotas}
              aria-label="Quitar notas"
              className="text-gray-400 hover:text-red-500 transition-colors p-1 -m-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            ref={notasRef}
            className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
            placeholder="Notas internas o para el cliente..."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={500}
          />
          {notas.length > 0 && (
            <p className="text-xs text-gray-600 mt-1 text-right">{notas.length}/500</p>
          )}
        </div>
      ) : (
        <div className="flex md:items-start">
          <button type="button" onClick={openNotas} className={COMPACT_BTN}>
            <Plus className="h-3.5 w-3.5" /> Notas
          </button>
        </div>
      )}
    </div>
  );
}
