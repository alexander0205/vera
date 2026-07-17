'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Info, Plus, X } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import { Tooltip } from '@/components/ui/tooltip';
import { getCampoHint } from '@/lib/factura/validator/ui-helpers';
import { Autocomplete } from '../components/Autocomplete';
import type { Cliente } from '../utils/types';

const CLIENTE_DROPDOWN_W = 520;

/**
 * Opción del dropdown: el contacto arriba (nombre + RNC/cédula) y, separados por
 * una línea, sus dependientes, uno por fila. El contacto va primero porque es a
 * quien se le factura.
 * Se listan TODOS los dependientes, no solo el que matcheó: buscando al padre se
 * ve la familia, y buscando al hijo se confirma que el contacto es el correcto.
 */
function renderClienteOption(c: Cliente) {
  const deps = c.dependientes ?? [];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium" title={c.razonSocial}>
          {c.razonSocial}
        </p>
        <span className="shrink-0 font-mono text-xs text-gray-500">{c.rnc || '—'}</span>
      </div>
      {deps.length > 0 && (
        <ul className="mt-1 border-t border-gray-200 pt-1">
          {deps.map((d) => (
            <li key={d} className="truncate text-xs text-blue-600" title={d}>
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
}

/**
 * Datos del cliente. Cliente autocomplete + RNC + teléfono + email.
 * El selector de beneficiario/dependiente fue movido a nivel de línea (ItemsTable).
 */
export function ClienteSection({
  clienteSeleccionado, buscarClientes, onSelectCliente, onClearCliente, onOpenNuevoCliente,
  regla, rncManual, rncManualNombre, setRncManual, setRncManualNombre,
  emailManual, setEmailManual, telefonoManual, setTelefonoManual,
  tipoEcf, totalDocumento,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Autocomplete<Cliente>
            placeholder="Buscar cliente por nombre, RNC o beneficiario…"
            value={clienteSeleccionado?.razonSocial ?? ''}
            onSearch={buscarClientes}
            onSelect={onSelectCliente}
            onClear={onClearCliente}
            onCreate={onOpenNuevoCliente}
            createLabel="Nuevo contacto"
            dropdownMinWidth={CLIENTE_DROPDOWN_W}
            renderOption={renderClienteOption}
          />
          {/* Botón limpiar — visible cuando hay cliente seleccionado */}
          {clienteSeleccionado && (
            <button
              type="button"
              onClick={onClearCliente}
              aria-label="Quitar cliente seleccionado"
              title="Quitar cliente"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1 transition-colors z-10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenNuevoCliente}
          className="text-teal-600 hover:text-teal-800 text-sm font-medium whitespace-nowrap flex items-center gap-1 transition-colors py-2 -my-1">
          <Plus className="h-3.5 w-3.5" />Nuevo contacto
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="min-w-0">
          <Label className="text-xs text-gray-600 uppercase tracking-wide flex items-center gap-1">
            {regla?.rncLabel ?? 'RNC o Cédula'}
            {regla?.requiereRncComprador && <span className="text-red-500 ml-0.5" aria-label="campo obligatorio">*</span>}
            <Tooltip text={getCampoHint(tipoEcf, 'rncComprador') || 'DGII #38 · RNC, cédula o pasaporte'}>
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
            className="mt-1 h-10"
            placeholder="___-___-____"
            value={telefonoManual}
            onChange={(e) => setTelefonoManual(e.target.value)}
          />
        </div>
        {/* Email siempre visible — si cliente seleccionado sin email, queda editable */}
        <div>
          <Label className="text-xs text-gray-600 uppercase tracking-wide">Email (para envío)</Label>
          <Input
            className="mt-1 h-10"
            type="email"
            placeholder="facturacion@empresa.com"
            value={emailManual}
            onChange={(e) => setEmailManual(e.target.value)}
          />
        </div>
      </div>

      {tipoEcf === '32' && totalDocumento >= 200000 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{totalDocumento >= 250000 ? 'DOP 250,000+: datos del comprador OBLIGATORIOS.' : 'Al superar DOP 250,000 los datos del comprador serán obligatorios.'}</span>
        </div>
      )}
    </div>
  );
}
