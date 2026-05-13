'use client';

import { Button } from '@/components/ui/button';
import { ChevronDown, FileText, Loader2, Mail, Printer } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ItemLinea } from '../utils/types';

interface Props {
  items: ItemLinea[];
  loading: boolean;
  loadingPreview: boolean;
  onVistaPrevia: () => void;
  onEmitir: (modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' }) => void;
}

export function BottomActionBar({
  items, loading, loadingPreview, onVistaPrevia, onEmitir,
}: Props) {
  const [showGuardarMenu, setShowGuardarMenu] = useState(false);
  const guardarMenuRef = useRef<HTMLDivElement>(null);
  const disableEmitir  = items.every((i) => !i.nombreItem.trim());

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
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 pb-2 border-t border-gray-100">
      <Button
        type="button"
        variant="outline"
        asChild
        className="text-gray-600 h-11 sm:h-9 w-full sm:w-auto"
      >
        <Link href="/dashboard/facturas">Cancelar</Link>
      </Button>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
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
          disabled={loading || disableEmitir}
          className="text-gray-700 border-gray-300 hover:bg-gray-50 h-11 sm:h-9 w-full sm:w-auto"
          onClick={() => onEmitir('emitir', { andThen: 'nueva' })}>
          Guardar y crear nueva
        </Button>

        <div ref={guardarMenuRef} className="relative flex w-full sm:w-auto">
          <Button
            type="submit"
            disabled={loading || disableEmitir}
            className="bg-teal-600 hover:bg-teal-700 text-white rounded-r-none flex-1 sm:flex-none sm:min-w-[140px] border-r border-teal-700 h-11 sm:h-9"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitiendo…</>
              : 'Guardar'}
          </Button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowGuardarMenu(v => !v)}
            aria-label="Más opciones para guardar"
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-md rounded-l-none px-3 sm:px-2.5 flex items-center justify-center border-l border-teal-700 transition-colors h-11 sm:h-9"
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
                Guardar como borrador
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
      </div>
    </div>
  );
}
