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
    <div className="flex items-center justify-between mt-6 pb-8">
      <Button type="button" variant="outline" asChild className="text-gray-600">
        <Link href="/dashboard/facturas">Cancelar</Link>
      </Button>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={loading || loadingPreview}
          className="text-gray-600"
          onClick={onVistaPrevia}>
          {loadingPreview ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando…</> : 'Vista previa'}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={loading || disableEmitir}
          className="text-gray-700 border-gray-300 hover:bg-gray-50"
          onClick={() => onEmitir('emitir', { andThen: 'nueva' })}>
          Guardar y crear nueva
        </Button>

        <div ref={guardarMenuRef} className="relative flex">
          <Button
            type="submit"
            disabled={loading || disableEmitir}
            className="bg-teal-600 hover:bg-teal-700 text-white rounded-r-none min-w-[140px] border-r border-teal-700"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitiendo…</>
              : 'Guardar'}
          </Button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowGuardarMenu(v => !v)}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-l-none px-2.5 flex items-center border-l border-teal-700 transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          {showGuardarMenu && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52 z-50">
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => { setShowGuardarMenu(false); onEmitir('borrador'); }}>
                <FileText className="h-4 w-4 text-gray-400" />
                Guardar como borrador
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'imprimir' }); }}>
                <Printer className="h-4 w-4 text-gray-400" />
                Guardar e imprimir
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'correo' }); }}>
                <Mail className="h-4 w-4 text-gray-400" />
                Guardar y enviar por correo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
