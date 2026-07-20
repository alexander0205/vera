'use client';

import { X, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Autocomplete } from '../components/Autocomplete';
import { MOTIVOS_NOTA } from './DetallesSection';

/** Resumen de factura devuelto por GET /api/facturas (para el selector de origen). */
export interface FacturaResumen {
  id: number;
  encf: string;
  codigo: string | null;
  tipoEcf: string;
  estado: string;
  razonSocialComprador: string | null;
  montoTotal: number; // centavos
  fechaEmision: string | null;
}

interface Props {
  /** '33' (ND) o '34' (NC) — define el texto de la etiqueta. */
  tipoEcf: string;
  /** Factura de origen ya seleccionada (o cargada por ?padreId). */
  padreSeleccionado: { id: number; encf: string; codigo: string | null; razonSocial?: string } | null;
  /** La factura de origen tiene e-NCF real (E…) → e-NCF y fecha se cargan solos y van read-only. */
  conEcfReal: boolean;
  /** La factura de origen es sin-ncf (sin comprobante fiscal) → nota interna, sin e-NCF. */
  esPadreSinNcf: boolean;
  buscarFacturas: (q: string) => Promise<FacturaResumen[]>;
  onSelect: (f: FacturaResumen) => void;
  onClear: () => void;
  // Datos de modificación DGII (e-NCF que se modifica, motivo, fecha).
  ncfModificado: string;
  setNcfModificado: (v: string) => void;
  motivoNota: string;
  setMotivoNota: (v: string) => void;
  fechaNcfModificado: string;
  setFechaNcfModificado: (v: string) => void;
  razonModificacion: string;
  setRazonModificacion: (v: string) => void;
  today: string;
}

/**
 * Selector de la factura de origen para una Nota de Crédito/Débito + los datos
 * de modificación (e-NCF que se modifica, motivo, fecha). Al elegir una factura
 * se cargan e-NCF modificado, cliente y líneas. Si la factura tiene e-NCF real,
 * el e-NCF y la fecha van read-only (vienen del original); solo el motivo es
 * editable. Si no tiene e-NCF (no emitida en el sistema), el usuario los escribe.
 */
export function FacturaOrigenSection({
  tipoEcf, padreSeleccionado, conEcfReal, esPadreSinNcf, buscarFacturas, onSelect, onClear,
  ncfModificado, setNcfModificado, motivoNota, setMotivoNota,
  fechaNcfModificado, setFechaNcfModificado, razonModificacion, setRazonModificacion,
  today,
}: Props) {
  const esNc = tipoEcf === '34';
  const label = `Factura de origen — ${esNc ? 'nota de crédito' : 'nota de débito'}`;

  const valorActual = padreSeleccionado
    ? `${padreSeleccionado.encf || padreSeleccionado.codigo || `#${padreSeleccionado.id}`}`
      + (padreSeleccionado.razonSocial ? ` · ${padreSeleccionado.razonSocial}` : '')
    : '';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 md:px-5 md:py-4">
      <label className="text-xs text-gray-600 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
        <FileText className="h-3.5 w-3.5" />
        {label}
        <span className="text-red-500" aria-label="campo obligatorio">*</span>
      </label>

      <div className="relative">
        <Autocomplete<FacturaResumen>
          placeholder="Buscar factura por e-NCF o cliente…"
          value={valorActual}
          onSearch={buscarFacturas}
          onSelect={onSelect}
          onClear={onClear}
          renderOption={(f) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{f.encf || f.codigo || `#${f.id}`}</p>
                <p className="text-xs text-gray-600 truncate">{f.razonSocialComprador ?? 'Sin cliente'}</p>
              </div>
              <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                RD$ {(f.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        />
        {padreSeleccionado && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Quitar factura de origen"
            title="Quitar factura de origen"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1 transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!padreSeleccionado && (
        <p className="text-[11px] text-gray-500 mt-1.5">
          Selecciona la factura de origen. Se cargarán el e-NCF modificado, el cliente y las líneas.
        </p>
      )}

      {/* Factura sin comprobante fiscal → nota interna, sin e-NCF que referenciar. */}
      {padreSeleccionado && esPadreSinNcf && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          <p className="text-[11px] text-gray-500">Sin comprobante fiscal — nota interna.</p>
          <div className="sm:max-w-sm">
            <Label className="text-xs text-gray-600 uppercase tracking-wide">Motivo</Label>
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
          {motivoNota === 'otro' && (
            <div>
              <Label className="text-xs text-gray-600 uppercase tracking-wide">Especifica el motivo</Label>
              <Input
                className="mt-1 h-10"
                placeholder="Describe brevemente el motivo de la nota…"
                value={razonModificacion}
                onChange={(e) => setRazonModificacion(e.target.value)}
                maxLength={500}
              />
            </div>
          )}
        </div>
      )}

      {/* Datos de modificación DGII — aparecen al elegir la factura de origen. */}
      {padreSeleccionado && !esPadreSinNcf && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">
              e-NCF que se modifica <span className="text-red-500">*</span>
            </Label>
            <Input
              className="mt-1 h-10 disabled:bg-gray-50 disabled:text-gray-600"
              placeholder="E310000000001"
              value={ncfModificado}
              onChange={(e) => setNcfModificado(e.target.value.toUpperCase())}
              maxLength={13}
              disabled={conEcfReal}
            />
            {!conEcfReal && (
              <p className="text-[10px] text-amber-700 mt-1">La factura de origen no tiene e-NCF — escríbelo para emitir.</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-gray-600 uppercase tracking-wide">
              Motivo <span className="text-red-500">*</span>
            </Label>
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
            <Label className="text-xs text-gray-600 uppercase tracking-wide">
              Fecha del e-NCF original <span className="text-red-500">*</span>
            </Label>
            <Input
              className="mt-1 h-10 disabled:bg-gray-50 disabled:text-gray-600"
              type="date"
              value={fechaNcfModificado}
              onChange={(e) => setFechaNcfModificado(e.target.value)}
              max={today}
              disabled={conEcfReal}
            />
          </div>
          {motivoNota === 'otro' && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="text-xs text-gray-600 uppercase tracking-wide">
                Especifica el motivo <span className="text-red-500">*</span>
              </Label>
              <Input
                className="mt-1 h-10"
                placeholder="Describe brevemente el motivo de la nota…"
                value={razonModificacion}
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
