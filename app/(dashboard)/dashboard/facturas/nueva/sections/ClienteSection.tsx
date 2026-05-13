'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Info, Plus } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import { Tooltip } from '@/components/ui/tooltip';
import { getCampoHint, esCampoRequerido } from '@/lib/factura/validator/ui-helpers';
import { Autocomplete } from '../components/Autocomplete';
import type { Cliente, Plazo } from '../utils/types';

interface Props {
  clienteSeleccionado: Cliente | null;
  buscarClientes: (q: string) => Promise<Cliente[]>;
  onSelectCliente: (c: Cliente) => void;
  onClearCliente: () => void;
  onOpenNuevoCliente: () => void;
  regla: TipoEcfRegla | undefined;
  rncManual: string;
  rncManualNombre: string;
  setRncManual: (v: string) => void;
  setRncManualNombre: (v: string) => void;
  emailManual: string;
  setEmailManual: (v: string) => void;
  telefonoManual: string;
  setTelefonoManual: (v: string) => void;
  tipoEcf: string;
  totalDocumento: number;
  ncfModificado: string;
  setNcfModificado: (v: string) => void;
  /** Tipos 33, 34 — código de modificación (1..5). */
  codigoModificacion: string;
  setCodigoModificacion: (v: string) => void;
  /** Tipos 33, 34 — fecha del NCF original (YYYY-MM-DD). */
  fechaNcfModificado: string;
  setFechaNcfModificado: (v: string) => void;
  /** Tipos 31, 32, 44, 45, 46 — clasificación del ingreso (1..6). Oculto en 33, 34, 41, 43, 47. */
  tipoIngresos: string;
  setTipoIngresos: (v: string) => void;
  fechaEmision: string;
  setFechaEmision: (v: string) => void;
  plazoId: string;
  onPlazoChange: (id: string) => void;
  plazosDisponibles: Plazo[];
  plazoActual: Plazo | undefined;
  fechaLimitePago: string;
  setFechaLimitePago: (v: string) => void;
  today: string;
}

export function ClienteSection({
  clienteSeleccionado, buscarClientes, onSelectCliente, onClearCliente, onOpenNuevoCliente,
  regla, rncManual, rncManualNombre, setRncManual, setRncManualNombre,
  emailManual, setEmailManual, telefonoManual, setTelefonoManual,
  tipoEcf, totalDocumento, ncfModificado, setNcfModificado,
  codigoModificacion, setCodigoModificacion,
  fechaNcfModificado, setFechaNcfModificado,
  tipoIngresos, setTipoIngresos,
  fechaEmision, setFechaEmision, plazoId, onPlazoChange,
  plazosDisponibles, plazoActual, fechaLimitePago, setFechaLimitePago, today,
}: Props) {
  const muestraTipoIngresos = ['31', '32', '44', '45', '46'].includes(tipoEcf);
  return (
    <div className="px-8 pb-6 grid grid-cols-2 gap-8 border-b border-gray-100">
      {/* LEFT: client */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Autocomplete<Cliente>
              placeholder="Buscar..."
              value={clienteSeleccionado?.razonSocial ?? ''}
              onSearch={buscarClientes}
              onSelect={onSelectCliente}
              onClear={onClearCliente}
              onCreate={onOpenNuevoCliente}
              createLabel="Nuevo contacto"
              renderOption={(c) => (
                <div>
                  <p className="font-medium">{c.razonSocial}</p>
                  <p className="text-xs text-gray-600">{[c.rnc, c.email].filter(Boolean).join(' · ')}</p>
                </div>
              )}
            />
          </div>
          <button
            type="button"
            onClick={onOpenNuevoCliente}
            className="text-teal-600 hover:text-teal-800 text-sm font-medium whitespace-nowrap flex items-center gap-1 transition-colors">
            <Plus className="h-3.5 w-3.5" />Nuevo contacto
          </button>
        </div>

        <div className="space-y-2.5">
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide flex items-center gap-1">
              {regla?.rncLabel ?? 'RNC o Cédula'}
              {regla?.requiereRncComprador && <span className="text-red-500 ml-0.5" aria-label="campo obligatorio">*</span>}
              <Tooltip text={getCampoHint(tipoEcf, 'rncComprador') || 'DGII #38 · 9 u 11 dígitos'}>
                <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
              </Tooltip>
            </Label>
            <RncSearch
              className="mt-1"
              placeholder="Buscar RNC, Cédula o razón social…"
              value={
                clienteSeleccionado?.rnc
                  ? `${clienteSeleccionado.rnc} · ${clienteSeleccionado.razonSocial}`
                  : rncManual
                    ? `${rncManual}${rncManualNombre ? ` · ${rncManualNombre}` : ''}`
                    : undefined
              }
              onSelect={(r) => { setRncManual(r.rnc); setRncManualNombre(r.nombre); }}
              onClear={() => {
                if (clienteSeleccionado) onClearCliente();
                else { setRncManual(''); setRncManualNombre(''); }
              }}
              showSyncHint={!clienteSeleccionado}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Teléfono</Label>
            <Input
              className="mt-1 h-9"
              placeholder="___-___-____"
              value={telefonoManual}
              onChange={(e) => setTelefonoManual(e.target.value)}
            />
          </div>
        </div>

        {!clienteSeleccionado && (
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Email (para envío)</Label>
            <Input className="mt-1 h-9" type="email" placeholder="facturacion@empresa.com" value={emailManual} onChange={(e) => setEmailManual(e.target.value)} />
          </div>
        )}

        {tipoEcf === '32' && totalDocumento >= 200000 && (
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{totalDocumento >= 250000 ? 'DOP 250,000+: datos del comprador OBLIGATORIOS.' : 'Al superar DOP 250,000 los datos del comprador serán obligatorios.'}</span>
          </div>
        )}

        {regla?.requiereNcfModificado && (
          <>
            <div>
              <Label className="text-xs text-gray-600 uppercase tracking-wide">e-NCF que se modifica <span className="text-red-500">*</span></Label>
              <Input className="mt-1 h-9" placeholder="E310000000001" value={ncfModificado} onChange={(e) => setNcfModificado(e.target.value.toUpperCase())} maxLength={13} />
            </div>
            <div>
              <Label className="text-xs text-gray-600 uppercase tracking-wide">Código de modificación <span className="text-red-500">*</span></Label>
              <Select value={codigoModificacion || undefined} onValueChange={setCodigoModificacion}>
                <SelectTrigger className="mt-1 h-9">
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
                className="mt-1 h-9"
                type="date"
                value={fechaNcfModificado}
                onChange={(e) => setFechaNcfModificado(e.target.value)}
                max={today}
              />
            </div>
          </>
        )}
      </div>

      {/* RIGHT: dates */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 uppercase tracking-wide">Fecha <span className="text-red-500">*</span></Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 uppercase tracking-wide">Plazo de pago</Label>
          <Select value={plazoId} onValueChange={onPlazoChange}>
            <SelectTrigger className="mt-1 h-9">
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
        {(plazoActual?.esManual || (plazoActual?.dias != null)) && (
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">
              Vencimiento {plazoActual?.esManual && <span className="text-red-500">*</span>}
            </Label>
            <Input
              type="date"
              value={fechaLimitePago}
              onChange={(e) => setFechaLimitePago(e.target.value)}
              min={today}
              className="mt-1 h-9"
            />
          </div>
        )}
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
              <SelectTrigger className="mt-1 h-9">
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
    </div>
  );
}
