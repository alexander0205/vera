'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ChevronDown, FileX, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export interface PagoData {
  recibido: boolean;
  metodo?: string | null;
  cuenta?: string | null;
  valorDOP: string;
  fecha?: string | null;
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

  const [metodo, setMetodo] = useState(initial.metodo ?? 'efectivo');
  const [cuenta, setCuenta] = useState(initial.cuenta ?? '');
  const [valor,  setValor]  = useState(initial.valorDOP);
  const [fecha,  setFecha]  = useState(
    initial.fecha ?? new Date().toISOString().slice(0, 10),
  );

  // Sync with parent if initial changes (e.g. after page reload)
  useEffect(() => {
    setEditing(initial.recibido);
    setMetodo(initial.metodo ?? 'efectivo');
    setCuenta(initial.cuenta ?? '');
    setValor(initial.valorDOP);
    setFecha(initial.fecha ?? new Date().toISOString().slice(0, 10));
  }, [initial.recibido, initial.metodo, initial.cuenta, initial.valorDOP, initial.fecha]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/facturas/${docId}/pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recibido: true,
          metodo,
          cuenta: cuenta || null,
          valor:  parseFloat(valor || '0'),
          fecha,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error guardando pago');
      toast.success('Pago registrado exitosamente');
      setJustSaved(true);
      onSaved?.({
        recibido: true,
        metodo,
        cuenta: cuenta || null,
        valorDOP: parseFloat(valor || '0').toFixed(2),
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
                  // Sugerir total como valor inicial
                  if (!valor || parseFloat(valor) === 0) setValor(totalDOP);
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
                  onChange={(e) => { if (!e.target.checked) handleClear(); }}
                  disabled={readOnly || saving}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700 font-medium">
                  Registro de pago recibido
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Método de pago</Label>
                  <Select value={metodo} onValueChange={setMetodo} disabled={readOnly || saving}>
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="tarjeta_credito">Tarjeta de crédito</SelectItem>
                      <SelectItem value="tarjeta_debito">Tarjeta de débito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Fecha</Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 text-sm"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    disabled={readOnly || saving}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Cuenta bancaria</Label>
                  <Select value={cuenta || ''} onValueChange={setCuenta} disabled={readOnly || saving}>
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caja">Caja general</SelectItem>
                      <SelectItem value="banreservas">Banreservas</SelectItem>
                      <SelectItem value="popular">Banco Popular</SelectItem>
                      <SelectItem value="bhd">BHD</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Valor</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 font-medium">RD$</span>
                    <Input
                      type="number" inputMode="decimal" min={0} step={0.01}
                      className="h-9 text-sm pl-10"
                      placeholder="0.00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      disabled={readOnly || saving}
                    />
                  </div>
                </div>
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

              {!readOnly && (
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 bg-teal-600 hover:bg-teal-700 h-9"
                    onClick={handleSave}
                    disabled={saving}
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
                    onClick={handleClear}
                    disabled={saving}
                  >
                    Quitar
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
