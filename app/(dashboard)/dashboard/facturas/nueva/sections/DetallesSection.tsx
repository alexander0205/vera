'use client';

import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Info } from 'lucide-react';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import type { EmpresaPerfil } from '../utils/types';
import { describirMora } from '@/lib/cobranza/mora-calculo';

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
  /** Plazo de crédito en días (viene de la config central; no editable aquí). */
  diasParaPago: string;
  tipoIngresos: string;
  setTipoIngresos: (v: string) => void;
  /** Vencimiento derivado (YYYY-MM-DD) — solo para mostrar el info pill. */
  fechaLimitePago: string;
  /** Config de mora de la empresa, para avisar los términos al elegir crédito. */
  empresa?: EmpresaPerfil | null;
  /** true = el usuario no ha registrado ningún pago en esta factura. */
  sinPagoRegistrado?: boolean;
}

export function DetallesSection({
  regla,
  tipoEcf,
  condicionPago, setCondicionPago,
  diasParaPago,
  tipoIngresos, setTipoIngresos,
  fechaLimitePago,
  empresa,
  sinPagoRegistrado = false,
}: Props) {
  const esCredito = condicionPago === '2';

  // Descripción de la mora que aplicaría. null si la empresa no la tiene activa.
  const textoMora = empresa?.recargoMoraActivo
    ? describirMora(
        {
          modo:             empresa.recargoMoraModo ?? 'porcentaje',
          porcentajeBps:    empresa.recargoMoraPorcentaje ?? 0,
          montoCents:       empresa.recargoMoraMontoCents ?? 0,
          diasGracia:       empresa.recargoMoraDiasGracia ?? 0,
          periodicidadDias: empresa.recargoMoraPeriodicidadDias ?? 0,
          compuesta:        empresa.recargoMoraCompuesta ?? false,
          topeBps:          empresa.recargoMoraTopeBps ?? 0,
          maxPeriodos:      empresa.recargoMoraMaxPeriodos ?? 0,
        },
        (cents) => `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
      )
    : null;
  const muestraTipoIngresos = !SIN_TIPO_INGRESO.includes(tipoEcf);

  return (
    <div className="space-y-4">
      {/* Fila: Condición de pago · Tipo de ingresos.
          El plazo de vencimiento ya no se edita aquí: se toma de la
          configuración central de la empresa y se muestra en el aviso de abajo. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Info pill: vencimiento derivado + mora que aplicará si no se paga */}
      {esCredito && fechaLimitePago && (
        <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
          <div className="text-sm text-teal-900">
            <p>
              Crédito a <span className="font-semibold">{diasParaPago} días</span> · vence el{' '}
              <span className="font-semibold">{formatFechaCorta(fechaLimitePago)}</span>.
            </p>
            {textoMora && (
              <p className="mt-0.5 text-teal-800">
                Si no se paga, se aplicará una mora de <span className="font-semibold">{textoMora}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Contado sin pago: la factura queda por cobrar sin vencimiento ni mora.
          No se cambia sola — la condición de pago se reporta a la DGII, así que
          la decisión es del usuario; aquí solo se hace visible. */}
      {!esCredito && condicionPago === '1' && sinPagoRegistrado && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p>
              Marcada <span className="font-semibold">de contado</span> pero sin pago registrado.
              Queda por cobrar, sin fecha de vencimiento y sin generar mora.
            </p>
            <button
              type="button"
              onClick={() => setCondicionPago('2')}
              className="mt-1.5 font-semibold underline underline-offset-2 hover:text-amber-950"
            >
              Cambiarla a crédito
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
