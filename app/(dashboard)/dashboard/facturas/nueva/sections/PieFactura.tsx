'use client';

import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

interface Props {
  pieFactura: string;
  setPieFactura: (v: string) => void;
}

const COMPACT_BTN =
  'text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors';

export function PieFactura({ pieFactura, setPieFactura }: Props) {
  // Auto-expand on mount if content exists (borrador edit)
  const [expanded, setExpanded] = useState(() => pieFactura.trim().length > 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (pieFactura.trim().length > 0) setExpanded(true); }, [pieFactura]);

  function open() { setExpanded(true); setTimeout(() => textareaRef.current?.focus(), 0); }
  function close() { setPieFactura(''); setExpanded(false); }

  if (!expanded) {
    return (
      <div className="px-4 py-3 md:px-8 md:py-3 border-b border-gray-100">
        <button type="button" onClick={open} className={COMPACT_BTN}>
          <Plus className="h-3.5 w-3.5" /> Pie de factura
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-8 md:py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-sm font-medium text-gray-700">Pie de factura</Label>
        <button
          type="button"
          onClick={close}
          aria-label="Quitar pie de factura"
          className="text-gray-400 hover:text-red-500 transition-colors p-1 -m-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="w-full min-h-[70px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
        placeholder="Visible en la impresión del documento"
        value={pieFactura}
        onChange={(e) => setPieFactura(e.target.value)}
      />
    </div>
  );
}
