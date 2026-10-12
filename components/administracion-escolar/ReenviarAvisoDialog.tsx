'use client';

/**
 * Enseñar el aviso ANTES de mandarlo.
 *
 * Antes era un botón del menú que le escribía a una familia real sin enseñar ni
 * el texto ni el número. Dos cosas hacen que eso no valga:
 *
 *  · el texto cambia según la mora del concepto —«ya se aplicó el recargo» vs
 *    «tienes 5 días»— y mandar el equivocado es una queja, no un detalle;
 *  · el número es el que esté guardado en el contacto, y no siempre es el bueno.
 *
 * Así que se lee primero, en la burbuja tal cual va a llegar.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { AlertTriangle, Clock, Loader2, MessageCircle } from 'lucide-react';

interface Previa {
  puede: boolean;
  motivo: string | null;
  destino?: string;
  responsable?: string;
  texto?: string;
  plantilla?: string | null;
}

/** `18093334444` → `+1 809 333 4444`, que es como lo reconoce quien lo mira. */
function legible(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) {
    return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return `+${d}`;
}

export function ReenviarAvisoDialog({ cargoId, abierto, onCerrar, onEnviado }: {
  cargoId: number | null;
  abierto: boolean;
  onCerrar: () => void;
  onEnviado?: () => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto || cargoId == null) { setPrevia(null); return; }
    let vivo = true;
    setCargando(true);
    fetch(`/api/administracion-escolar/cargos/${cargoId}/reenviar-aviso`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setPrevia(d); })
      .catch(() => { if (vivo) setPrevia({ puede: false, motivo: 'No se pudo cargar la vista previa' }); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [abierto, cargoId]);

  async function enviar() {
    if (cargoId == null) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/cargos/${cargoId}/reenviar-aviso`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? 'No se pudo enviar'); return; }
      toast.success(`Aviso enviado a ${legible(d.destino ?? '')}`);
      onEnviado?.();
      onCerrar();
    } catch {
      toast.error('No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar el aviso por WhatsApp</DialogTitle>
          <DialogDescription>
            Esto le llega a la familia. Léelo antes de mandarlo.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : !previa ? null : (
          <div className="space-y-3">
            {/* A quién. El número va entero: es lo que hay que comprobar. */}
            {previa.destino && (
              <div className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Para</p>
                <p className="text-sm font-medium text-gray-900">{previa.responsable || '—'}</p>
                <p className="font-mono text-sm text-gray-600">{legible(previa.destino)}</p>
              </div>
            )}

            {/* Tal cual va a llegar. */}
            {previa.texto && (
              <div className="rounded-lg bg-[#e5ddd5] p-3">
                <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">
                    {previa.texto}
                  </p>
                </div>
                <p className="mt-1.5 text-[10px] text-gray-600">
                  {previa.plantilla
                    ? <>Sale por la plantilla <span className="font-mono">{previa.plantilla}</span></>
                    : 'Sale como texto libre: solo llega si la familia escribió en las últimas 24 h.'}
                </p>
              </div>
            )}

            {/* Por qué no se puede, cuando no se puede. */}
            {!previa.puede && previa.motivo && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                {previa.motivo.includes('hora') ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <p className="text-sm text-amber-900">{previa.motivo}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={!previa?.puede || enviando || cargando}>
            {enviando
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <MessageCircle className="mr-1.5 h-4 w-4" />}
            Enviar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
