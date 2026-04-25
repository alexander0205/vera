'use client';

/**
 * Componente reutilizable para seleccionar Provincia y Municipio
 * de la República Dominicana.
 *
 * Fuente de datos: /api/catalogos/provincias y /api/catalogos/municipios
 * (que proxean a ecf-api, respetando los códigos DGII oficiales).
 *
 * Props:
 *   provincia / municipio  → código DGII (ej. "01", "01001")
 *   onProvinciaChange / onMunicipioChange → emiten el código DGII
 *
 * Usado en: /dashboard/configuracion y /dashboard/habilitacion
 */

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CatalogItem {
  codigo: string;
  nombre: string;
}

// ─── AutocompleteInput ────────────────────────────────────────────────────────

function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hasError,
  loading,
}: {
  value: string;
  onChange: (codigo: string) => void;
  options: CatalogItem[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const containerRef      = useRef<HTMLDivElement>(null);

  // Sync display when value (code) or options change
  useEffect(() => {
    const match = options.find(o => o.codigo === value);
    setQuery(match ? match.nombre : value ?? '');
  }, [value, options]);

  const filtered = options
    .filter(o => o.nombre.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 40);

  function select(item: CatalogItem) {
    onChange(item.codigo);
    setQuery(item.nombre);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    // Si el texto no coincide con el valor actual, emitir '' para invalidar
    const match = options.find(o => o.nombre === e.target.value);
    onChange(match ? match.codigo : '');
    setOpen(true);
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    // Si no hay coincidencia exacta, restaurar el nombre del código actual
    const match = options.find(o => o.codigo === value);
    setQuery(match ? match.nombre : '');
  }

  const isDisabled = disabled || loading;

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <Input
        value={loading ? 'Cargando…' : query}
        disabled={isDisabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={handleInputChange}
        onFocus={() => { if (!isDisabled) setOpen(true); }}
        className={[
          isDisabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : '',
          hasError   ? 'border-red-400' : '',
        ].filter(Boolean).join(' ')}
      />
      {open && filtered.length > 0 && !isDisabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(item => (
            <button
              key={item.codigo}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(item); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {item.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ProvinciaMunicipioSelect ─────────────────────────────────────────────────

export interface ProvinciaMunicipioSelectProps {
  /** Código DGII de provincia, ej. "01" */
  provincia: string;
  /** Código DGII de municipio, ej. "01001" */
  municipio: string;
  onProvinciaChange: (codigo: string) => void;
  onMunicipioChange: (codigo: string) => void;
  /** Marca campos requeridos con * */
  required?: boolean;
  /** Mensajes de error por campo */
  errors?: { provincia?: string; municipio?: string };
  className?: string;
}

export function ProvinciaMunicipioSelect({
  provincia,
  municipio,
  onProvinciaChange,
  onMunicipioChange,
  required = false,
  errors,
  className = 'grid grid-cols-2 gap-3',
}: ProvinciaMunicipioSelectProps) {
  const [provincias,   setProvincias]   = useState<CatalogItem[]>([]);
  const [municipios,   setMunicipios]   = useState<CatalogItem[]>([]);
  const [loadingProv,  setLoadingProv]  = useState(true);
  const [loadingMun,   setLoadingMun]   = useState(false);

  // Cargar provincias al montar
  useEffect(() => {
    setLoadingProv(true);
    fetch('/api/catalogos/provincias')
      .then(r => r.json())
      .then((data: CatalogItem[]) => setProvincias(Array.isArray(data) ? data : []))
      .catch(() => setProvincias([]))
      .finally(() => setLoadingProv(false));
  }, []);

  // Cargar municipios cuando cambia la provincia seleccionada
  useEffect(() => {
    if (!provincia) {
      setMunicipios([]);
      return;
    }
    setLoadingMun(true);
    fetch(`/api/catalogos/municipios?provincia=${encodeURIComponent(provincia)}`)
      .then(r => r.json())
      .then((data: CatalogItem[]) => setMunicipios(Array.isArray(data) ? data : []))
      .catch(() => setMunicipios([]))
      .finally(() => setLoadingMun(false));
  }, [provincia]);

  function handleProvinciaChange(codigo: string) {
    onProvinciaChange(codigo);
    // Limpiar municipio si cambia la provincia
    onMunicipioChange('');
  }

  return (
    <div className={className}>
      {/* Provincia */}
      <div>
        <Label className="text-xs mb-1.5 block">
          Provincia {required && <span className="text-red-500">*</span>}
        </Label>
        <AutocompleteInput
          value={provincia}
          options={provincias}
          placeholder="Buscar provincia…"
          loading={loadingProv}
          hasError={!!errors?.provincia}
          onChange={handleProvinciaChange}
        />
        {errors?.provincia && (
          <p className="text-xs text-red-500 mt-1">{errors.provincia}</p>
        )}
      </div>

      {/* Municipio */}
      <div>
        <Label className="text-xs mb-1.5 block">
          Municipio {required && <span className="text-red-500">*</span>}
        </Label>
        <AutocompleteInput
          value={municipio}
          options={municipios}
          placeholder={provincia ? 'Buscar municipio…' : 'Selecciona provincia primero'}
          disabled={!provincia}
          loading={loadingMun}
          hasError={!!errors?.municipio}
          onChange={onMunicipioChange}
        />
        {errors?.municipio && (
          <p className="text-xs text-red-500 mt-1">{errors.municipio}</p>
        )}
      </div>
    </div>
  );
}
