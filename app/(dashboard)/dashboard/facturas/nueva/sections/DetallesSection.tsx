'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Info } from 'lucide-react';
import type { TipoEcfRegla } from '@/lib/ecf/types';

export const MOTIVOS_NOTA = [
  { value: 'devolucion',   label: 'Devolución de mercancía',   codigo: 3 },
  { value: 'error_precio', label: 'Error en precio',           codigo: 3 },
  { value: 'descuento',    label: 'Descuento no aplicado',     codigo: 3 },
  { value: 'cancelacion',  label: 'Cancelación parcial',       codigo: 3 },
  { value: 'anulacion',    label: 'Anulación de la operación', codigo: 1 },
  { value: 'cargo',        label: 'Cargo adicional',           codigo: 3 },
  { value: 'otro',         label: 'Otro (especificar)',         codigo: 3 },
] as const;

export type MotivoNota = typeof MOTIVOS_NOTA[number]['value'];

// Condición de pago DGII: 1=contado, 2=crédito, 3=gratuito, 4=uso/consumo.
const CONDICIONES_PAGO = [
  { value: '1', label: 'De contado' },
  { value: '2', label: 'Crédito' },
  { value: '3', label: 'Gratuito' },
  { value: '4', label: 'Uso o consumo' },
];

// TipoIngresos DGII (campo 607): clasificación del origen del ingreso.
// El 95% es 01 (venta normal del giro) — default. En una Nota de Crédito/Débito
// debe coincidir con el tipo de la factura original que se corrige.
const TIPOS_INGRESO = [
  { value: '1', label: '01 · Operaciones (giro del negocio)' },
  { value: '2', label: '02 · Financieros' },
  { value: '3', label: '03 · Extraordinarios' },
  { value: '4', label: '04 · Arrendamientos' },
  { value: '5', label: '05 · Venta de activo depreciable' },
  { value: '6', label: '06 · Otros' },
];
// Tipos donde TipoIngresos NO aplica (campo prohibido en IdDoc): Compras, Gastos, Pagos Exterior.
const SIN_TIPO_INGRESO = ['41', '43', '47'];

/** Formatea YYYY-MM-DD → DD/MM/YYYY */
function formatFechaCorta(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

interface Props {
  regla: TipoEcfRegla | undefined;
  tipoEcf: string;
  condicionPago: string;
  setCondicionPago: (v: string) => void;
  diasParaPago: string;
  setDiasParaPago: (v: string) => void;
  tipoIngresos: string;
  setTipoIngresos: (v: string) => void;
  /** Vencimiento derivado (YYYY-MM-DD) — solo para mostrar el info pill. */
  fechaLimitePago: string;
}

export function DetallesSection({
  regla,
  tipoEcf,
  condicionPago, setCondicionPago,
  diasParaPago, setDiasParaPago,
  tipoIngresos, setTipoIngresos,
  fechaLimitePago,
}: Props) {
  const esCredito = condicionPago === '2';
  const muestraTipoIngresos = !SIN_TIPO_INGRESO.includes(tipoEcf);

  return (
    <div className="space-y-4">
      {/* Fila: Condición de pago · Plazo de vencimiento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-gray-600 uppercase tracking-wide">Condición de pago</Label>
          <Select value={condicionPago} onValueChange={setCondicionPago}>
            <SelectTrigger className="mt-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDICIONES_PAGO.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className={`text-xs uppercase tracking-wide ${esCredito ? 'text-gray-600' : 'text-gray-300'}`}>
            Plazo de vencimiento {esCredito && <span className="text-red-500">*</span>}
          </Label>
          <div className="relative mt-1 w-28">
            <Input
              type="number"
              min={1}
              value={diasParaPago}
              onChange={(e) => setDiasParaPago(e.target.value)}
              disabled={!esCredito}
              className="h-10 pr-10 disabled:bg-gray-50 disabled:text-gray-300"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">días</span>
          </div>
        </div>

        {muestraTipoIngresos && (
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Tipo de ingresos</Label>
            <Select value={tipoIngresos} onValueChange={setTipoIngresos}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_INGRESO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Info pill: vencimiento derivado */}
      {esCredito && fechaLimitePago && (
        <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
          <Info className="h-4 w-4 text-teal-700 shrink-0" />
          <p className="text-sm text-teal-900">
            Vence el <span className="font-semibold">{formatFechaCorta(fechaLimitePago)}</span>.
          </p>
        </div>
      )}

    </div>
  );
}
