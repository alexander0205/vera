'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface PagoLinea {
  metodo: string;      // efectivo | transferencia | tarjeta | tarjeta_credito | tarjeta_debito | cheque | deposito | otro
  valor: string;       // DOP como string (input controlado)
  cuenta?: string;     // cuenta bancaria (opcional)
  referencia?: string; // opcional
}

interface MetodoOption { value: string; label: string }

/** Set completo de métodos (8). Algunos endpoints aceptan menos: pasar `metodos`. */
export const METODOS_PAGO: MetodoOption[] = [
  { value: 'efectivo',         label: 'Efectivo' },
  { value: 'transferencia',    label: 'Transferencia' },
  { value: 'tarjeta',          label: 'Tarjeta' },
  { value: 'tarjeta_credito',  label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito',   label: 'Tarjeta de débito' },
  { value: 'cheque',           label: 'Cheque' },
  { value: 'deposito',         label: 'Depósito' },
  { value: 'otro',             label: 'Otro' },
];

/** Cuentas bancarias sugeridas (igual que en las pantallas originales). */
const CUENTAS_BANCARIAS: MetodoOption[] = [
  { value: 'caja',        label: 'Caja general' },
  { value: 'banreservas', label: 'Banreservas' },
  { value: 'popular',     label: 'Banco Popular' },
  { value: 'bhd',         label: 'BHD' },
  { value: 'otro',        label: 'Otro' },
];

interface PagoMetodosProps {
  lineas: PagoLinea[];
  onChange: (lineas: PagoLinea[]) => void;
  total: number;            // DOP — total de la factura (para Suma/Resto/Saldo)
  yaPagado?: number;        // DOP ya pagado antes (AR/parcial). Default 0.
  disabled?: boolean;
  showCuenta?: boolean;     // mostrar campo cuenta bancaria por línea. Default false.
  showReferencia?: boolean; // mostrar campo referencia por línea. Default false.
  /** Restringe las opciones de método (algunos endpoints aceptan menos de 8). */
  metodos?: MetodoOption[];
}

// ─── Helpers exportados ───────────────────────────────────────────────────────

/** Suma de las líneas en DOP (centavos enteros en el borde para evitar drift). */
export function sumaPagos(lineas: PagoLinea[]): number {
  const cents = lineas.reduce((s, l) => {
    const v = parseFloat(l.valor || '0');
    return s + (Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0);
  }, 0);
  return cents / 100;
}

/** Válido = al menos un monto > 0 y la suma no excede (total - yaPagado). */
export function pagosValidos(lineas: PagoLinea[], total: number, yaPagado = 0): boolean {
  const sumaCents     = Math.round(sumaPagos(lineas) * 100);
  const disponibleCts = Math.round((total - yaPagado) * 100);
  return sumaCents > 0 && sumaCents <= disponibleCts;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Repeater de pago multi-método, 100% controlado por props.
 * Empieza siempre con (al menos) 1 línea — 1 línea = pago normal.
 * No tiene estado de datos propio; toda mutación va por `onChange`.
 */
export function PagoMetodos({
  lineas,
  onChange,
  total,
  yaPagado = 0,
  disabled = false,
  showCuenta = false,
  showReferencia = false,
  metodos = METODOS_PAGO,
}: PagoMetodosProps) {
  const disponible = Math.max(0, total - yaPagado);
  const suma       = sumaPagos(lineas);
  const restoCents = Math.round(disponible * 100) - Math.round(suma * 100);
  const resto      = Math.max(0, restoCents / 100);
  const excede     = Math.round(suma * 100) > Math.round(disponible * 100);

  // Campos opcionales revelados manualmente (UI-only). Cuenta/Referencia no
  // siempre se usan: se ocultan tras un link "+ ..." para no saturar el form.
  const [verCuenta, setVerCuenta]         = useState<Set<number>>(new Set());
  const [verReferencia, setVerReferencia] = useState<Set<number>>(new Set());
  const cuentaVisible = (i: number, l: PagoLinea) => !!l.cuenta || verCuenta.has(i);
  const refVisible    = (i: number, l: PagoLinea) => !!l.referencia || verReferencia.has(i);
  const toggleSet = (set: Set<number>, i: number) => {
    const next = new Set(set); next.add(i); return next;
  };

  function setLinea(i: number, patch: Partial<PagoLinea>) {
    onChange(lineas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function agregarLinea() {
    onChange([...lineas, { metodo: 'efectivo', valor: '' }]);
  }
  function quitarLinea(i: number) {
    if (lineas.length <= 1) return;
    onChange(lineas.filter((_, idx) => idx !== i));
  }
  function repartirResto() {
    if (restoCents <= 0 || lineas.length === 0) return;
    const ultima      = lineas.length - 1;
    const actualV     = parseFloat(lineas[ultima].valor || '0');
    const actualCents = Number.isFinite(actualV) && actualV > 0 ? Math.round(actualV * 100) : 0;
    setLinea(ultima, { valor: ((actualCents + restoCents) / 100).toFixed(2) });
  }

  const fmt = (n: number) =>
    n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-2">
      {lineas.map((l, i) => (
        <div
          key={i}
          className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 space-y-2"
        >
          {/* Fila 1: método (ocupa todo) + quitar */}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-gray-500 uppercase">Método</Label>
              <Select
                value={l.metodo}
                onValueChange={(v) => setLinea(i, { metodo: v })}
                disabled={disabled}
              >
                <SelectTrigger className="mt-1 h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metodos.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {lineas.length > 1 && (
              <Button
                type="button" size="sm" variant="outline"
                className="h-9 px-2 text-red-500 border-red-200 hover:bg-red-50 shrink-0"
                onClick={() => quitarLinea(i)}
                disabled={disabled}
                title="Quitar método"
                aria-label="Quitar método"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Fila 2: monto + cuenta (cuenta solo si se reveló) */}
          <div className={`grid gap-2 ${showCuenta && cuentaVisible(i, l) ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="min-w-0">
              <Label className="text-[10px] text-gray-500 uppercase">Monto</Label>
              <div className="relative mt-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">RD$</span>
                <Input
                  type="number" inputMode="decimal" min={0} step={0.01}
                  className="h-9 text-sm pl-9 w-full"
                  placeholder="0.00"
                  value={l.valor}
                  onChange={(e) => setLinea(i, { valor: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>

            {showCuenta && cuentaVisible(i, l) && (
              <div className="min-w-0">
                <Label className="text-[10px] text-gray-500 uppercase">Cuenta</Label>
                <Select
                  value={l.cuenta ?? ''}
                  onValueChange={(v) => setLinea(i, { cuenta: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUENTAS_BANCARIAS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Fila 3: referencia (solo si se reveló) */}
          {showReferencia && refVisible(i, l) && (
            <div className="min-w-0">
              <Label className="text-[10px] text-gray-500 uppercase">Referencia</Label>
              <Input
                type="text"
                className="mt-1 h-9 text-sm w-full"
                placeholder="Opcional"
                maxLength={100}
                value={l.referencia ?? ''}
                onChange={(e) => setLinea(i, { referencia: e.target.value })}
                disabled={disabled}
              />
            </div>
          )}

          {/* Links opcionales: agregar cuenta / referencia */}
          {!disabled && ((showCuenta && !cuentaVisible(i, l)) || (showReferencia && !refVisible(i, l))) && (
            <div className="flex gap-3">
              {showCuenta && !cuentaVisible(i, l) && (
                <button
                  type="button"
                  onClick={() => setVerCuenta(s => toggleSet(s, i))}
                  className="text-[11px] text-gray-400 hover:text-teal-700"
                >
                  + Cuenta
                </button>
              )}
              {showReferencia && !refVisible(i, l) && (
                <button
                  type="button"
                  onClick={() => setVerReferencia(s => toggleSet(s, i))}
                  className="text-[11px] text-gray-400 hover:text-teal-700"
                >
                  + Referencia
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={agregarLinea}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar otro método
        </button>
        <button
          type="button"
          onClick={repartirResto}
          disabled={disabled || restoCents <= 0}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40"
        >
          Repartir resto
        </button>
      </div>

      <div className={`rounded-lg p-2.5 text-xs flex justify-between ${excede ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
        <span>Suma: <strong>RD$ {fmt(suma)}</strong></span>
        <span>{excede ? 'Excede el total' : `Resto: RD$ ${fmt(resto)}`}</span>
      </div>
    </div>
  );
}
