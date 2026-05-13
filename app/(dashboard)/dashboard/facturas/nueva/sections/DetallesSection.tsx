'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Info } from 'lucide-react';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import { Tooltip } from '@/components/ui/tooltip';
import { getCampoHint, esCampoRequerido } from '@/lib/factura/validator/ui-helpers';
import type { Plazo } from '../utils/types';

interface Props {
  regla: TipoEcfRegla | undefined;
  tipoEcf: string;
  fechaEmision: string;
  setFechaEmision: (v: string) => void;
  plazoId: string;
  onPlazoChange: (id: string) => void;
  plazosDisponibles: Plazo[];
  plazoActual: Plazo | undefined;
  fechaLimitePago: string;
  setFechaLimitePago: (v: string) => void;
  ncfModificado: string;
  setNcfModificado: (v: string) => void;
  codigoModificacion: string;
  setCodigoModificacion: (v: string) => void;
  fechaNcfModificado: string;
  setFechaNcfModificado: (v: string) => void;
  tipoIngresos: string;
  setTipoIngresos: (v: string) => void;
  today: string;
}

export function DetallesSection({
  regla, tipoEcf,
  fechaEmision, setFechaEmision,
  plazoId, onPlazoChange, plazosDisponibles, plazoActual,
  fechaLimitePago, setFechaLimitePago,
  ncfModificado, setNcfModificado,
  codigoModificacion, setCodigoModificacion,
  fechaNcfModificado, setFechaNcfModificado,
  tipoIngresos, setTipoIngresos, today,
}: Props) {
  const muestraTipoIngresos = ['31', '32', '44', '45', '46'].includes(tipoEcf);
  const muestraVencimiento  = plazoActual?.esManual || plazoActual?.dias != null;

  return (
    <div className="space-y-4">
      {/* Row 1: Fecha · Plazo · Tipo ingresos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-gray-600 uppercase tracking-wide">Fecha <span className="text-red-500">*</span></Label>
          <Input
            className="mt-1 h-10"
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 uppercase tracking-wide">Plazo de pago</Label>
          <Select value={plazoId} onValueChange={onPlazoChange}>
            <SelectTrigger className="mt-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plazosDisponibles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
              <SelectItem value="nuevo" className="text-teal-600 font-medium border-t border-gray-100 mt-1">
                + Nuevo plazo
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {muestraTipoIngresos && (
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide flex items-center gap-1">
              Tipo de ingresos
              {esCampoRequerido(tipoEcf, 'tipoIngresos') && <span className="text-red-500 ml-0.5" aria-label="campo obligatorio">*</span>}
              <Tooltip text={getCampoHint(tipoEcf, 'tipoIngresos') || 'DGII · enum 1-6'}>
                <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
              </Tooltip>
            </Label>
            <Select value={tipoIngresos || '1'} onValueChange={setTipoIngresos}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — Operaciones (Habituales)</SelectItem>
                <SelectItem value="2">2 — Financieros</SelectItem>
                <SelectItem value="3">3 — Extraordinarios</SelectItem>
                <SelectItem value="4">4 — Arrendamientos</SelectItem>
                <SelectItem value="5">5 — Venta Activos depreciables</SelectItem>
                <SelectItem value="6">6 — Otros Ingresos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Row 2: Vencimiento (condicional) */}
      {muestraVencimiento && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">
              Vencimiento {plazoActual?.esManual && <span className="text-red-500">*</span>}
            </Label>
            <Input
              type="date"
              value={fechaLimitePago}
              onChange={(e) => setFechaLimitePago(e.target.value)}
              min={today}
              className="mt-1 h-10"
            />
          </div>
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
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Código de modificación <span className="text-red-500">*</span></Label>
            <Select value={codigoModificacion || undefined} onValueChange={setCodigoModificacion}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue placeholder="Selecciona el motivo…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — Anula NCF</SelectItem>
                <SelectItem value="2">2 — Corrige texto</SelectItem>
                <SelectItem value="3">3 — Corrige monto</SelectItem>
                <SelectItem value="4">4 — Reemplazo en contingencia</SelectItem>
                <SelectItem value="5">5 — Referencia a Factura de Consumo</SelectItem>
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
        </div>
      )}
    </div>
  );
}
