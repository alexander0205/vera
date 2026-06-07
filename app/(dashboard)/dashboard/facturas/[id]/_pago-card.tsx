'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ChevronDown, FileX, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PagoMetodos, sumaPagos, pagosValidos, type PagoLinea } from '@/components/pagos/PagoMetodos';

export interface PagoData {
  recibido: boolean;
  metodo?: string | null;
  cuenta?: string | null;
  valorDOP: string;
  fecha?: string | null;
  /** Líneas reales del ledger (split). Si trae 2+, el detalle las muestra todas. */
  lineas?: { metodo: string; valor: string; cuenta?: string; referencia?: string }[];
}

interface Props {
  docId: number;
  initial: PagoData;
  /** When true, disables editing (e.g. factura ANULADA). */
  readOnly?: boolean;
  /** Called after a successful save with the new pago state. */
  onSaved?: (next: PagoData) => void;
  /** Total de la factura — usado como sugerencia inicial al agregar pago. */
  totalDOP: string;
}

/**
 * Right-sidebar "Pago" card. Two states:
 *  - A: No pago registrado → empty state + "Agregar pago" CTA.
 *  - B: Pago registrado / editing → form fields + Guardar.
 */
export function PagoCard({ docId, initial, readOnly, onSaved, totalDOP }: Props) {
  const [open, setOpen]         = useState(true);
  const [editing, setEditing]   = useState(initial.recibido);
  const [saving, setSaving]     = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const [fecha,  setFecha]  = useState(
    initial.fecha ?? new Date().toISOString().slice(0, 10),
  );

  // Una o varias líneas de método (1 línea = pago normal; 2+ = split del ledger).
  const initialLineas = (): PagoLinea[] => {
    if (initial.lineas && initial.lineas.length > 0) {
      return initial.lineas.map(l => ({
        metodo: l.metodo, valor: l.valor, cuenta: l.cuenta ?? '', referencia: l.referencia,
      }));
    }
    return initial.recibido
      ? [{ metodo: initial.metodo ?? 'efectivo', valor: initial.valorDOP || '', cuenta: initial.cuenta ?? '' }]
      : [{ metodo: 'efectivo', valor: totalDOP || '', cuenta: '' }];
  };
  const [lineas, setLineas] = useState<PagoLinea[]>(initialLineas);

  const totalNum = parseFloat(totalDOP || '0') || 0;
  const valido   = pagosValidos(lineas, totalNum);

  // Sync with parent if initial changes (e.g. after page reload)
  useEffect(() => {
    setEditing(initial.recibido);
    setFecha(initial.fecha ?? new Date().toISOString().slice(0, 10));
    setLineas(initialLineas());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.recibido, initial.metodo, initial.cuenta, initial.valorDOP, initial.fecha, totalDOP,
      JSON.stringify(initial.lineas)]);

  async function handleSave() {
    if (!valido) return;
    setSaving(true);
    try {
      const pagos = lineas
        .filter(l => (parseFloat(l.valor || '0') || 0) > 0)
        .map(l => ({
          metodo: l.metodo,
          valor:  parseFloat(l.valor),
          cuenta: l.cuenta?.trim() || null,
        }));
      const res = await fetch(`/api/facturas/${docId}/pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, pagos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error guardando pago');
      toast.success('Pago registrado exitosamente');
      setJustSaved(true);
      // Espejo inline: último método + suma total
      const ultima = lineas[lineas.length - 1];
      onSaved?.({
        recibido: true,
        metodo:   ultima?.metodo ?? null,
        cuenta:   ultima?.cuenta || null,
        valorDOP: sumaPagos(lineas).toFixed(2),
        fecha,
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error guardando pago');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (readOnly) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/facturas/${docId}/pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recibido: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error');
      toast.success('Pago removido');
      setJustSaved(false);
      setEditing(false);
      setConfirmingClear(false);
      onSaved?.({ recibido: false, valorDOP: '0.00' });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 pt-4 pb-3 md:px-5 hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <CreditCard className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-900 flex-1 text-left">Pago</h2>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 md:px-5 space-y-4">
          {!editing ? (
            /* ─── State A: empty state ─── */
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center py-4">
                <div className="relative h-12 w-12 mb-3 text-gray-300">
                  <FileX className="h-12 w-12" strokeWidth={1.4} />
                </div>
                <p className="text-sm font-medium text-gray-800">
                  Esta factura no tiene pagos registrados todavía
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-[26ch]">
                  Aún no se ha registrado ningún pago para esta factura.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed border-teal-300 text-teal-700 hover:bg-teal-50"
                onClick={() => {
                  if (readOnly) return;
                  // Sugerir total como valor inicial de la primera línea
                  setLineas([{ metodo: 'efectivo', valor: totalDOP || '', cuenta: '' }]);
                  setEditing(true);
                }}
                disabled={readOnly}
              >
                + Agregar pago
              </Button>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  Métodos guardados
                </p>
                <div className="text-xs text-gray-500 italic text-center py-3 border border-dashed border-gray-200 rounded-lg">
                  Sin métodos guardados
                </div>
              </div>
            </div>
          ) : (
            /* ─── State B: editing/registered ─── */
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked
                  readOnly={readOnly}
                  onChange={(e) => { if (!e.target.checked) setConfirmingClear(true); }}
                  disabled={readOnly || saving}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700 font-medium">
                  Registro de pago recibido
                </span>
              </label>

              <PagoMetodos
                lineas={lineas}
                onChange={setLineas}
                total={totalNum}
                disabled={readOnly || saving}
                showCuenta
              />

              {/* Fecha — compacta, default hoy, secundaria */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <Label className="text-[11px] text-gray-500">Fecha de pago</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-auto"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={readOnly || saving}
                />
              </div>

              {justSaved && (
                <div className="flex gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                  <div>
                    <p className="font-semibold">Pago registrado exitosamente</p>
                    <p className="text-emerald-700 mt-0.5">
                      El pago ha sido registrado correctamente.
                    </p>
                  </div>
                </div>
              )}

              {!readOnly && !confirmingClear && (
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 bg-teal-600 hover:bg-teal-700 h-9"
                    onClick={handleSave}
                    disabled={saving || !valido}
                  >
                    {saving
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Guardando…</>
                      : 'Guardar pago'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 h-9"
                    onClick={() => setConfirmingClear(true)}
                    disabled={saving}
                  >
                    Quitar
                  </Button>
                </div>
              )}

              {!readOnly && confirmingClear && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">¿Quitar el pago registrado?</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        Esta acción eliminará el pago de la factura. Puedes volver a registrarlo después.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 bg-red-600 hover:bg-red-700 h-9 text-white"
                      onClick={handleClear}
                      disabled={saving}
                    >
                      {saving
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Quitando…</>
                        : 'Sí, quitar pago'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => setConfirmingClear(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
