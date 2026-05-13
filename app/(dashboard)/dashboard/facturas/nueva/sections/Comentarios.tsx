'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle, Plus, X } from 'lucide-react';

interface Props {
  comentario: string;
  setComentario: (v: string) => void;
}

export function Comentarios({ comentario, setComentario }: Props) {
  // Auto-expand on mount if content exists (borrador edit case)
  const [expanded, setExpanded] = useState(() => comentario.trim().length > 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (comentario.trim().length > 0) setExpanded(true); }, [comentario]);

  function open() { setExpanded(true); setTimeout(() => textareaRef.current?.focus(), 0); }
  function close() { setComentario(''); setExpanded(false); }

  if (!expanded) {
    return (
      <div className="mt-3 px-1">
        <button
          type="button"
          onClick={open}
          className="text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Comentario interno
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-3">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 md:px-6 md:pt-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-800">Comentario</h3>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Quitar comentario"
          className="text-gray-400 hover:text-red-500 transition-colors p-1 -m-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 pb-4 md:px-6 md:pb-5">
        <textarea
          ref={textareaRef}
          className="w-full min-h-[70px] text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
          placeholder="Escribe un comentario"
          maxLength={280}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-600">{comentario.length}/280</p>
          {comentario.trim() && (
            <Button
              type="button" size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white h-8 text-xs"
              onClick={() => {
                // El comentario se guarda junto al documento al emitir.
              }}>
              Comentar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
