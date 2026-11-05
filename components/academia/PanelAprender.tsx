'use client';

/** El panel «Aprender» de una pantalla: sus videos, con «Visto» al día. Se carga solo al abrirlo. */

import Link from 'next/link';
import Drawer from '@mui/material/Drawer';
import { X } from 'lucide-react';
import { formatearTiempo } from '@/lib/academia/tiempo';
import type { VideoLista } from '@/lib/academia/tipos';
import { Miniatura } from './TarjetaVideo';

export function PanelAprender({ videos, puedeVolverAMostrar, alCerrar, alElegir, alVolverAMostrar }: {
  videos: VideoLista[];
  puedeVolverAMostrar: boolean;
  alCerrar: () => void;
  alElegir: (v: VideoLista) => void;
  alVolverAMostrar: () => void;
}) {
  return (
    <Drawer anchor="right" open onClose={alCerrar} slotProps={{ paper: { sx: { width: 'min(400px, 100%)' } } }}>
      <div className="flex items-center gap-3 border-b border-gray-200 p-4">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-zero-700">Aprender</p>
          <p className="text-lg font-semibold text-gray-900">Videos de esta pantalla</p>
        </div>
        <button type="button" onClick={alCerrar} aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="space-y-3 p-4">
        {videos.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => alElegir(v)}
              className="flex w-full gap-3 rounded-xl border border-gray-200 p-2 text-left hover:border-zero-300">
              <Miniatura video={v} className="w-24 shrink-0" />
              <span className="min-w-0 self-center">
                <span className="block text-sm font-semibold leading-snug text-gray-900">{v.titulo}</span>
                <span className="block text-xs text-gray-500">{v.visto ? 'Visto' : v.duracionSeg > 0 ? formatearTiempo(v.duracionSeg) : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-3 border-t border-gray-200 p-4">
        {puedeVolverAMostrar && (
          <button type="button" onClick={alVolverAMostrar} className="text-sm font-semibold text-zero-700 hover:underline">
            Volver a mostrar la tarjeta
          </button>
        )}
        <div><Link href="/academia" className="text-sm font-semibold text-zero-700 hover:underline">Ver toda la Academia</Link></div>
      </div>
    </Drawer>
  );
}
