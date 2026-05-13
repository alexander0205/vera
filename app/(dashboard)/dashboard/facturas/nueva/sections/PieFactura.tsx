'use client';

import { Label } from '@/components/ui/label';

interface Props {
  pieFactura: string;
  setPieFactura: (v: string) => void;
}

/**
 * Inline pie-de-factura editor — rendered inside an AccordionSection.
 * The accordion provides the section header / collapse chrome.
 */
export function PieFactura({ pieFactura, setPieFactura }: Props) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Pie de factura</Label>
      <textarea
        className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
        placeholder="Visible en la impresión del documento"
        value={pieFactura}
        onChange={(e) => setPieFactura(e.target.value)}
      />
    </div>
  );
}
