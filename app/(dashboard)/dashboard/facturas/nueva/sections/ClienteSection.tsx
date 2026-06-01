'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Info, Plus } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import { Tooltip } from '@/components/ui/tooltip';
import { getCampoHint } from '@/lib/factura/validator/ui-helpers';
import { Autocomplete } from '../components/Autocomplete';
import type { Cliente } from '../utils/types';

interface DependienteOpt {
  id: number;
  nombre: string;
  apellido: string;
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
  /** Callback called when a dependiente is selected/cleared. */
  onSelectDependiente?: (id: number | null, nombreCompleto: string | null) => void;
  /** Called after dependientes are loaded — passes whether the list is non-empty. */
  onDependienteListLoaded?: (hasDeps: boolean) => void;
  /** Current value (controlled from parent). */
  dependienteId?: number | null;
}

/**
 * Datos del cliente. Cliente autocomplete + RNC + teléfono + email + dependiente.
 * The "fechas / plazo / tipo ingresos / NCF modificado" fields used to live
 * here too — those moved to DetallesSection.
 */
export function ClienteSection({
  clienteSeleccionado, buscarClientes, onSelectCliente, onClearCliente, onOpenNuevoCliente,
  regla, rncManual, rncManualNombre, setRncManual, setRncManualNombre,
  emailManual, setEmailManual, telefonoManual, setTelefonoManual,
  tipoEcf, totalDocumento,
  onSelectDependiente, onDependienteListLoaded, dependienteId,
}: Props) {
  const [dependientes, setDependientes] = useState<DependienteOpt[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(false);

  // Fetch dependientes when client changes
  useEffect(() => {
    if (!clienteSeleccionado?.id) {
      setDependientes([]);
      onSelectDependiente?.(null, null);
      onDependienteListLoaded?.(false);
      return;
    }

    let cancelled = false;
    setLoadingDeps(true);
    fetch(`/api/clientes/${clienteSeleccionado.id}/dependientes`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const lista: DependienteOpt[] = Array.isArray(data.dependientes) ? data.dependientes : [];
        setDependientes(lista);
        // Reset selection when switching clients
        onSelectDependiente?.(null, null);
        onDependienteListLoaded?.(lista.length > 0);
      })
      .catch(() => {
        if (!cancelled) {
          setDependientes([]);
          onDependienteListLoaded?.(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDeps(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSeleccionado?.id]);

  function handleDependienteChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) {
      onSelectDependiente?.(null, null);
      return;
    }
    const id = parseInt(val, 10);
    const dep = dependientes.find(d => d.id === id);
    if (dep) {
      onSelectDependiente?.(id, `${dep.nombre} ${dep.apellido}`);
    }
  }

  const hasDependientes = dependientes.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px]">
          <Autocomplete<Cliente>
            placeholder="Buscar cliente por nombre, RNC o email…"
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
          className="text-teal-600 hover:text-teal-800 text-sm font-medium whitespace-nowrap flex items-center gap-1 transition-colors py-2 -my-1">
          <Plus className="h-3.5 w-3.5" />Nuevo contacto
        </button>
      </div>

      {/* Dependiente selector — only shown if client has dependientes */}
      {hasDependientes && (
        <div className="min-w-0">
          <Label className="text-xs text-gray-600 uppercase tracking-wide flex items-center gap-1">
            Beneficiario
            <span className="text-red-500 ml-0.5" aria-label="campo obligatorio">*</span>
            <Tooltip text="Selecciona el miembro del cliente para este comprobante">
              <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
            </Tooltip>
          </Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={dependienteId ?? ''}
            onChange={handleDependienteChange}
            disabled={loadingDeps}
            aria-required="true"
          >
            <option value="">— Selecciona beneficiario —</option>
            {dependientes.map(d => (
              <option key={d.id} value={d.id}>
                {d.nombre} {d.apellido}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="min-w-0">
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
