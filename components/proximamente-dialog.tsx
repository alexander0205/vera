'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageCircle, Phone, X, Sparkles } from 'lucide-react';

/**
 * Dialog reutilizable que se muestra cuando un usuario clickea una feature
 * que NO está implementada aún. Ofrece contacto vía WhatsApp.
 *
 * Uso 1 — vía hook:
 *   const { openProximamente, dialog } = useProximamenteDialog();
 *   <button onClick={() => openProximamente('Conduces')}>+ Conduce</button>
 *   {dialog}
 *
 * Uso 2 — vía componente standalone:
 *   <ProximamenteButton feature="Duplicar factura">Duplicar</ProximamenteButton>
 */

const WHATSAPP_NUMBER = '18293596602';
const WHATSAPP_DISPLAY = '+1 (829) 359-6602';

interface DialogProps {
  open: boolean;
  feature: string;
  onClose: () => void;
}

export function ProximamenteDialog({ open, feature, onClose }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const message = encodeURIComponent(
    `Hola, estoy interesado en la funcionalidad "${feature}" de Zero. ¿Pueden habilitarla?`,
  );
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proximamente-title"
    >
      <div ref={ref} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="proximamente-title" className="text-base font-bold text-gray-900">
              {feature} — Próximamente
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Esta funcionalidad aún no está habilitada en tu cuenta.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 -m-1"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-emerald-900 leading-relaxed">
            ¿La necesitas ya? Estaré muy feliz de habilitar esta funcionalidad
            para ti. <strong>Contáctame y la activamos:</strong>
          </p>
        </div>

        <div className="space-y-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 w-full bg-[#25D366] hover:bg-[#1ebe5b] text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <MessageCircle className="h-5 w-5" />
            <span>WhatsApp · {WHATSAPP_DISPLAY}</span>
          </a>
          <a
            href={`tel:${WHATSAPP_NUMBER}`}
            className="flex items-center gap-3 w-full border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Phone className="h-5 w-5 text-gray-500" />
            <span>Llamar · {WHATSAPP_DISPLAY}</span>
          </a>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Mientras tanto, puedes seguir usando el resto del sistema sin problemas.
        </p>
      </div>
    </div>
  );
}

/**
 * Hook que devuelve `openProximamente(featureName)` y el dialog para renderizar.
 */
export function useProximamenteDialog() {
  const [feature, setFeature] = useState<string | null>(null);
  const openProximamente = useCallback((f: string) => setFeature(f), []);
  const close = useCallback(() => setFeature(null), []);
  const dialog = <ProximamenteDialog open={feature !== null} feature={feature ?? ''} onClose={close} />;
  return { openProximamente, dialog };
}

/**
 * Botón standalone que abre el dialog al click.
 */
interface ButtonProps {
  feature: string;
  className?: string;
  children: React.ReactNode;
}

export function ProximamenteButton({ feature, className, children }: ButtonProps) {
  const { openProximamente, dialog } = useProximamenteDialog();
  return (
    <>
      <button
        type="button"
        onClick={() => openProximamente(feature)}
        className={className}
      >
        {children}
      </button>
      {dialog}
    </>
  );
}
