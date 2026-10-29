'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import { Coins, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConceptosCatalogo } from './ConceptosCatalogo';
import { ConceptosPanel } from './ConceptosPanel';

/**
 * Configuración › Conceptos y Tarifas en una ventana grande, sin salir de donde
 * se está matriculando.
 *
 * En la migración de un colegio siempre aparece lo que se olvidó (el
 * transporte, una beca, un taller): había que dejar la matrícula a medias, ir a
 * Configuración, crearlo y volver. Aquí se abre encima, se edita y al cerrar
 * quien la abrió vuelve a pedir su plan (`onCerrar`) con lo nuevo.
 *
 * Son las mismas pantallas de Configuración, no una copia: lo que se guarde
 * aquí es lo mismo que guardar allá.
 */
export function ConceptosYTarifasDialog({ open, onCerrar, inicial = 'conceptos' }: {
  open: boolean;
  onCerrar: () => void;
  inicial?: 'conceptos' | 'tarifas';
}) {
  const [pestana, setPestana] = useState<'conceptos' | 'tarifas'>(inicial);

  return (
    <Dialog open={open} onClose={onCerrar} fullWidth maxWidth="xl"
      slotProps={{ paper: { sx: { height: '90vh', display: 'flex', flexDirection: 'column' } } }}>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
        <h2 className="text-base font-semibold text-gray-900">Conceptos y tarifas</h2>
        <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {([
            { id: 'conceptos', etiqueta: 'Conceptos', icono: <Tag className="h-4 w-4" /> },
            { id: 'tarifas', etiqueta: 'Tarifas', icono: <Coins className="h-4 w-4" /> },
          ] as const).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={pestana === t.id}
              onClick={() => setPestana(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                pestana === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {t.icono}{t.etiqueta}
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-gray-500 md:inline">
          Lo que guardes aquí queda en Configuración. Al cerrar, la matrícula se actualiza.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={onCerrar}>Terminé</Button>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-5 py-4">
        {/* Solo la pestaña que se ve: cada una pide lo suyo al montarse. */}
        {pestana === 'conceptos' ? <ConceptosCatalogo /> : <ConceptosPanel />}
      </div>
    </Dialog>
  );
}
