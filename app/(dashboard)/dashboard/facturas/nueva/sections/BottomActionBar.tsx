'use client';

import { Button } from '@/components/ui/button';
import { ChevronDown, FileText, Loader2, Mail, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ItemLinea } from '../utils/types';

interface Props {
  items: ItemLinea[];
  loading: boolean;
  onCancelar?: () => void;
  primaryLabel?: string;
  loadingPrimaryLabel?: string;
  /** Color del botón primario por tipo de doc (factura teal / NC ámbar / ND azul). */
  primaryBtnClass?: string;
  // Full invoice mode (optional — omit for simple mode)
  loadingPreview?: boolean;
  onVistaPrevia?: () => void;
  onEmitir?: (modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' }) => void;
}

export function BottomActionBar({
  items, loading, onCancelar,
  primaryLabel = 'Guardar',
  loadingPrimaryLabel = 'Emitiendo…',
  primaryBtnClass = 'bg-teal-600 hover:bg-teal-700 border-teal-700',
  loadingPreview, onVistaPrevia, onEmitir,
}: Props) {
  const [showGuardarMenu, setShowGuardarMenu] = useState(false);
  const guardarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (guardarMenuRef.current && !guardarMenuRef.current.contains(e.target as Node)) {
        setShowGuardarMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="sticky bottom-0 z-30 -mx-3 sm:-mx-4 md:-mx-5 px-3 sm:px-4 md:px-5 mt-auto bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
      <Button
        type="button"
        variant="outline"
        className="text-gray-600 h-11 sm:h-9 w-full sm:w-auto"
        onClick={onCancelar}
      >
        Cancelar
      </Button>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
        {onEmitir ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={loading || loadingPreview}
              className="text-gray-600 h-11 sm:h-9 w-full sm:w-auto"
              onClick={onVistaPrevia}>
              {loadingPreview ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando…</> : 'Vista previa'}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              className="text-gray-700 border-gray-300 hover:bg-gray-50 h-11 sm:h-9 w-full sm:w-auto"
              onClick={() => onEmitir('emitir', { andThen: 'nueva' })}>
              Guardar y crear nueva
            </Button>

            <div ref={guardarMenuRef} className="relative flex w-full sm:w-auto">
              <Button
                type="submit"
                disabled={loading}
                className={`${primaryBtnClass} text-white rounded-r-none flex-1 sm:flex-none sm:min-w-[140px] border-r h-11 sm:h-9`}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{loadingPrimaryLabel}</>
                  : primaryLabel}
              </Button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowGuardarMenu(v => !v)}
                aria-label="Más opciones para guardar"
                className={`${primaryBtnClass} disabled:opacity-50 text-white rounded-md rounded-l-none px-3 sm:px-2.5 flex items-center justify-center border-l transition-colors h-11 sm:h-9`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>

              {showGuardarMenu && (
                <div className="absolute bottom-full right-0 left-auto mb-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-full sm:w-52 z-50 min-w-[12rem]">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-4 py-3 sm:py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => { setShowGuardarMenu(false); onEmitir('borrador'); }}>
                    <FileText className="h-4 w-4 text-gray-600" />
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-4 py-3 sm:py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'imprimir' }); }}>
                    <Printer className="h-4 w-4 text-gray-600" />
                    Guardar e imprimir
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-4 py-3 sm:py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'correo' }); }}>
                    <Mail className="h-4 w-4 text-gray-600" />
                    Guardar y enviar por correo
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Button
            type="submit"
            disabled={loading}
            className={`${primaryBtnClass} text-white h-11 sm:h-9 w-full sm:w-auto sm:min-w-[140px]`}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{loadingPrimaryLabel}</>
              : primaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
