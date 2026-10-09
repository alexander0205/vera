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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import type { SxProps, Theme } from '@mui/material/styles';

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
  label,
}: {
  value: string;
  onChange: (codigo: string) => void;
  options: CatalogItem[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  loading?: boolean;
  label: string;
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
    <Box ref={containerRef} sx={{ position: 'relative' }} onBlur={handleBlur}>
      <TextField
        size="small"
        fullWidth
        label={label}
        value={loading ? 'Cargando…' : query}
        disabled={isDisabled}
        placeholder={placeholder}
        autoComplete="off"
        error={hasError}
        onChange={handleInputChange}
        onFocus={() => { if (!isDisabled) setOpen(true); }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
      />
      {open && filtered.length > 0 && !isDisabled && (
        <Paper
          elevation={4}
          sx={{
            position: 'absolute', zIndex: 50, left: 0, right: 0, mt: 0.5,
            borderRadius: '12px', border: '1px solid #e5e7eb',
            maxHeight: 208, overflowY: 'auto',
          }}
        >
          {filtered.map(item => (
            <Box
              key={item.codigo}
              component="button"
              type="button"
              onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); select(item); }}
              sx={{
                width: '100%', textAlign: 'left', px: 2, py: 1.25,
                fontSize: '0.875rem', color: '#374151', border: 'none',
                bgcolor: 'transparent', cursor: 'pointer', display: 'block',
                '&:hover': { bgcolor: '#eef2fe', color: '#2a45c4' },
                '&:first-of-type': { borderRadius: '12px 12px 0 0' },
                '&:last-of-type': { borderRadius: '0 0 12px 12px' },
                transition: 'background-color 0.12s, color 0.12s',
              }}
            >
              {item.nombre}
            </Box>
          ))}
        </Paper>
      )}
    </Box>
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
  /** MUI sx prop for the container grid Box */
  sx?: SxProps<Theme>;
}

export function ProvinciaMunicipioSelect({
  provincia,
  municipio,
  onProvinciaChange,
  onMunicipioChange,
  required = false,
  errors,
  sx,
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

  const defaultSx: SxProps<Theme> = {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
    gap: 2,
  };

  return (
    <Box sx={sx ?? defaultSx}>
      {/* Provincia */}
      <Box>
        <AutocompleteInput
          label={required ? 'Provincia *' : 'Provincia'}
          value={provincia}
          options={provincias}
          placeholder="Buscar provincia…"
          loading={loadingProv}
          hasError={!!errors?.provincia}
          onChange={handleProvinciaChange}
        />
        {errors?.provincia && (
          <Typography sx={{ fontSize: '0.75rem', color: '#ef4444', mt: 0.5 }}>
            {errors.provincia}
          </Typography>
        )}
      </Box>

      {/* Municipio */}
      <Box>
        <AutocompleteInput
          label={required ? 'Municipio *' : 'Municipio'}
          value={municipio}
          options={municipios}
          placeholder={provincia ? 'Buscar municipio…' : 'Selecciona provincia primero'}
          disabled={!provincia}
          loading={loadingMun}
          hasError={!!errors?.municipio}
          onChange={onMunicipioChange}
        />
        {errors?.municipio && (
          <Typography sx={{ fontSize: '0.75rem', color: '#ef4444', mt: 0.5 }}>
            {errors.municipio}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
