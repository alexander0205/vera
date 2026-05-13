'use client';

import { Label } from '@/components/ui/label';

interface TerminosProps {
  terminosCondiciones: string;
  setTerminos: (v: string) => void;
}

interface NotasProps {
  notas: string;
  setNotas: (v: string) => void;
}

/**
 * Inline term/condition editor — rendered inside an AccordionSection by
 * the parent. No wrapping card; the accordion provides the chrome.
 */
export function Terminos({ terminosCondiciones, setTerminos }: TerminosProps) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Términos y condiciones</Label>
      <textarea
        className="w-full min-h-[100px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
        placeholder="Ej: Pago en cuenta corriente 000000001..."
        value={terminosCondiciones}
        onChange={(e) => setTerminos(e.target.value)}
      />
    </div>
  );
}

export function Notas({ notas, setNotas }: NotasProps) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Notas</Label>
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
  );
}
