'use client';

import { Label } from '@/components/ui/label';

interface Props {
  pieFactura: string;
  setPieFactura: (v: string) => void;
}

export function PieFactura({ pieFactura, setPieFactura }: Props) {
  return (
    <div className="px-8 py-6 border-b border-gray-100">
      <Label className="text-sm font-medium text-gray-700 mb-1 block">Pie de factura</Label>
      <textarea
        className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
        placeholder="Visible en la impresión del documento"
        value={pieFactura}
        onChange={(e) => setPieFactura(e.target.value)}
      />
      <p className="text-xs text-gray-400 mt-2">
        Los campos marcados con <span className="text-teal-600 font-medium">*</span> son obligatorios
      </p>
    </div>
  );
}
