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
  /** Vencimiento derivado (YYYY-MM-DD) — solo para mostrar el info pill. */
  fechaLimitePago: string;
  ncfModificado: string;
  setNcfModificado: (v: string) => void;
  motivoNota: string;
  setMotivoNota: (v: string) => void;
  fechaNcfModificado: string;
  setFechaNcfModificado: (v: string) => void;
  razonModificacion?: string;
  setRazonModificacion?: (v: string) => void;
  today: string;
}

export function DetallesSection({
  regla,
  condicionPago, setCondicionPago,
  diasParaPago, setDiasParaPago,
  fechaLimitePago,
  ncfModificado, setNcfModificado,
  motivoNota, setMotivoNota,
  fechaNcfModificado, setFechaNcfModificado,
  razonModificacion, setRazonModificacion,
  today,
}: Props) {
  const esCredito = condicionPago === '2';

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

      {/* Modificación de NCF (tipos 33, 34) */}
      {regla?.requiereNcfModificado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">e-NCF que se modifica <span className="text-red-500">*</span></Label>
            <Input
              className="mt-1 h-10"
              placeholder="E310000000001"
              value={ncfModificado}
              onChange={(e) => setNcfModificado(e.target.value.toUpperCase())}
              maxLength={13}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Motivo <span className="text-red-500">*</span></Label>
            <Select value={motivoNota || undefined} onValueChange={setMotivoNota}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue placeholder="Selecciona el motivo…" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_NOTA.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Fecha del e-NCF original <span className="text-red-500">*</span></Label>
            <Input
              className="mt-1 h-10"
              type="date"
              value={fechaNcfModificado}
              onChange={(e) => setFechaNcfModificado(e.target.value)}
              max={today}
            />
          </div>
          {motivoNota === 'otro' && setRazonModificacion && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="text-xs text-gray-600 uppercase tracking-wide">Especifica el motivo <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1 h-10"
                placeholder="Describe brevemente el motivo de la nota…"
                value={razonModificacion ?? ''}
                onChange={(e) => setRazonModificacion(e.target.value)}
                maxLength={500}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
