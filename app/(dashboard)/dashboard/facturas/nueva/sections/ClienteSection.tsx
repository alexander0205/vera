'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Plus } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import type { TipoEcfRegla } from '@/lib/ecf/types';
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
  fechaEmision, setFechaEmision, plazoId, onPlazoChange,
  plazosDisponibles, plazoActual, fechaLimitePago, setFechaLimitePago, today,
}: Props) {
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
                  <p className="text-xs text-gray-400">{[c.rnc, c.email].filter(Boolean).join(' · ')}</p>
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
            <Label className="text-xs text-gray-400 uppercase tracking-wide">
              {regla?.rncLabel ?? 'RNC o Cédula'}
              {regla?.requiereRncComprador && <span className="text-red-500 ml-0.5">*</span>}
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
            <Label className="text-xs text-gray-400 uppercase tracking-wide">Teléfono</Label>
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
            <Label className="text-xs text-gray-400 uppercase tracking-wide">Email (para envío)</Label>
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
          <div>
            <Label className="text-xs text-gray-400 uppercase tracking-wide">e-NCF que se modifica <span className="text-red-500">*</span></Label>
            <Input className="mt-1 h-9" placeholder="E310000000001" value={ncfModificado} onChange={(e) => setNcfModificado(e.target.value.toUpperCase())} maxLength={13} />
          </div>
        )}
      </div>

      {/* RIGHT: dates */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-400 uppercase tracking-wide">Fecha <span className="text-red-500">*</span></Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400 uppercase tracking-wide">Plazo de pago</Label>
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
            <Label className="text-xs text-gray-400 uppercase tracking-wide">
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
      </div>
    </div>
  );
}
