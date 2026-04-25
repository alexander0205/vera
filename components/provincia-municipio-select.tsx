'use client';

/**
 * Componente reutilizable para seleccionar Provincia y Municipio
 * de la República Dominicana. Fuente de datos: lib/dgii/provincias.ts
 *
 * Usado en: /dashboard/configuracion y /dashboard/habilitacion
 */

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PROVINCIAS, getMunicipios } from '@/lib/dgii/provincias';

const PROVINCIA_NAMES = PROVINCIAS.map(p => p.nombre);

// ─── AutocompleteInput ────────────────────────────────────────────────────────

function AutocompleteInput({
  value, onChange, options, placeholder, disabled, hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = options
    .filter(o => o.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 40);

  function select(opt: string) {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (!disabled) setOpen(true); }}
        className={[
          disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : '',
          hasError ? 'border-red-400' : '',
        ].filter(Boolean).join(' ')}
      />
      {open && filtered.length > 0 && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(opt); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ProvinciaMunicipioSelect ─────────────────────────────────────────────────

export interface ProvinciaMunicipioSelectProps {
  provincia: string;
  municipio: string;
  onProvinciaChange: (v: string) => void;
  onMunicipioChange: (v: string) => void;
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
  const municipios = getMunicipios(provincia);

  function handleProvinciaChange(v: string) {
    onProvinciaChange(v);
    // Si el municipio actual no pertenece a la nueva provincia, limpiar
    const muns = getMunicipios(v);
    if (!muns.includes(municipio)) {
      onMunicipioChange('');
    }
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
          options={PROVINCIA_NAMES}
          placeholder="Buscar provincia…"
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
          disabled={!provincia || municipios.length === 0}
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
