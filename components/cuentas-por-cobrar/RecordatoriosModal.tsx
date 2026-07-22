'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle, Loader2, CheckCircle, Send } from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Modal de recordatorios de pago por correo.
 *
 * Refleja el contrato de dos pasos de `/api/cuentas-por-cobrar/recordatorios`:
 * primero una llamada SIN `confirmar` que solo previsualiza (a quién iría, con
 * qué saldo, y quién queda fuera), y recién con la confirmación explícita del
 * usuario una segunda llamada con `confirmar: true` que envía de verdad.
 *
 * El doble paso es deliberado: esto le escribe a clientes reales y un envío
 * masivo disparado por error no se puede deshacer. El botón de enviar dice
 * cuántos correos van a salir, no un "Confirmar" genérico.
 */

const MAX_POR_LOTE = 50;

interface Enviable {
  id: number; codigo: string; cliente: string; email: string;
  saldoCents: number; diasVencido: number;
}
interface Omitido { id: number; codigo: string; cliente: string }

interface Preview {
  enviables: Enviable[];
  omitidos:  { sinCorreo: Omitido[]; sinSaldo: Omitido[] };
}
interface Resultado {
  enviados: number;
  fallidos: { id: number; error: string }[];
  omitidos: { sinCorreo: number; sinSaldo: number };
}

export function RecordatoriosModal({
  docIds, onClose, onEnviado,
}: {
  docIds:     number[];
  onClose:    () => void;
  /** Se llama tras un envío con al menos un correo entregado (para refrescar). */
  onEnviado:  () => void;
}) {
  const [preview, setPreview]   = useState<Preview | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Paso 1: previsualizar. No envía nada.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/cuentas-por-cobrar/recordatorios', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ docIds }),
        });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) throw new Error(j.error ?? 'No se pudo previsualizar');
        setPreview(j);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Error desconocido');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [docIds]);

  // Paso 2: enviar de verdad.
  const enviar = useCallback(async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/cuentas-por-cobrar/recordatorios', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ docIds, confirmar: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudieron enviar');
      setResultado(j);
      if (j.enviados > 0) onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setEnviando(false);
    }
  }, [docIds, onEnviado]);

  const enviables = preview?.enviables ?? [];
  const sinCorreo = preview?.omitidos.sinCorreo ?? [];
  const sinSaldo  = preview?.omitidos.sinSaldo ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {resultado ? 'Recordatorios enviados' : 'Enviar recordatorio de pago'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {resultado
                ? 'Queda registrado en el historial de gestión de cada cuenta.'
                : `${docIds.length} cuenta${docIds.length !== 1 ? 's' : ''} seleccionada${docIds.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {cargando && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando la previsualización…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Resultado del envío ─────────────────────────────────────────── */}
          {resultado && (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {resultado.enviados} correo{resultado.enviados !== 1 ? 's' : ''} enviado
                  {resultado.enviados !== 1 ? 's' : ''}.
                </span>
              </div>
              {resultado.fallidos.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                  <p className="font-medium mb-1">
                    {resultado.fallidos.length} fallaron:
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {resultado.fallidos.map(f => (
                      <li key={f.id}>Cuenta #{f.id} — {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ── Previsualización ────────────────────────────────────────────── */}
          {preview && !resultado && (
            <>
              {enviables.length === 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Ninguna de las cuentas seleccionadas se puede notificar. Necesitan
                    un correo registrado y saldo pendiente.
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Se enviará a {enviables.length} destinatario{enviables.length !== 1 ? 's' : ''}
                  </p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {enviables.map(e => (
                      <div key={e.id} className="px-3 py-2.5 flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{e.cliente}</p>
                          <p className="text-xs text-gray-500 truncate">{e.email}</p>
                          <p className="text-xs text-gray-400 font-mono">{e.codigo}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-gray-900">{fmtDOP(e.saldoCents)}</p>
                          {e.diasVencido > 0 && (
                            <p className="text-xs text-red-600">{e.diasVencido} días de atraso</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(sinCorreo.length > 0 || sinSaldo.length > 0) && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 space-y-1">
                  {sinCorreo.length > 0 && (
                    <p>
                      <span className="font-medium">{sinCorreo.length}</span> sin correo
                      registrado: {sinCorreo.map(o => o.codigo).join(', ')}
                    </p>
                  )}
                  {sinSaldo.length > 0 && (
                    <p>
                      <span className="font-medium">{sinSaldo.length}</span> sin saldo
                      pendiente: {sinSaldo.map(o => o.codigo).join(', ')}
                    </p>
                  )}
                  <p className="text-gray-400">Estas quedan fuera del envío.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button
              onClick={enviar}
              disabled={enviando || cargando || enviables.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {enviando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <><Send className="h-4 w-4" /> Enviar {enviables.length} correo{enviables.length !== 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { MAX_POR_LOTE };
