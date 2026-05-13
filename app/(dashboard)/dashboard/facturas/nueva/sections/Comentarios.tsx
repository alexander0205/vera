'use client';

import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

interface Props {
  comentario: string;
  setComentario: (v: string) => void;
}

export function Comentarios({ comentario, setComentario }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 md:px-6 md:pt-5">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-800">Comentarios</h3>
        </div>
      </div>
      <div className="px-4 pb-4 md:px-6 md:pb-5">
        <textarea
          className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-600"
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
