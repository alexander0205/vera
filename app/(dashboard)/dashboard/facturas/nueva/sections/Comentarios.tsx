'use client';

import { Label } from '@/components/ui/label';

interface Props {
  comentario: string;
  setComentario: (v: string) => void;
}

/**
 * Inline comentario textarea — rendered inside an AccordionSection.
 * The comentario is internal-only and is persisted with the document on emit.
 */
export function Comentarios({ comentario, setComentario }: Props) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Comentario interno</Label>
      <textarea
        className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
        placeholder="Escribe un comentario"
        maxLength={280}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      <p className="text-xs text-gray-600 mt-1 text-right">{comentario.length}/280</p>
    </div>
  );
}
