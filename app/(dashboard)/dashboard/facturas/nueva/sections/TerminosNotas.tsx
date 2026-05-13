'use client';

import { Label } from '@/components/ui/label';

interface Props {
  terminosCondiciones: string;
  setTerminos: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
}

export function TerminosNotas({ terminosCondiciones, setTerminos, notas, setNotas }: Props) {
  return (
    <div className="px-4 py-5 md:px-8 md:py-6 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 border-b border-gray-100">
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-1 block">Términos y condiciones</Label>
        <p className="text-xs text-gray-600 mb-2">Visible en la impresión del documento</p>
        <textarea
          className="w-full min-h-[100px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
          placeholder="Ej: Pago en cuenta corriente 000000001..."
          value={terminosCondiciones}
          onChange={(e) => setTerminos(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-1 block">Notas</Label>
        <p className="hidden md:block text-xs text-gray-600 mb-2">&nbsp;</p>
        <textarea
          className="w-full min-h-[100px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
          placeholder="Notas internas o para el cliente..."
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          maxLength={500}
        />
        {notas.length > 0 && (
          <p className="text-xs text-gray-600 mt-1 text-right">{notas.length}/500</p>
        )}
      </div>
    </div>
  );
}
