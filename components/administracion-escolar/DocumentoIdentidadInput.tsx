'use client';

/**
 * DocumentoIdentidadInput (shadcn) — selector de tipo + campo de documento,
 * gemelo del de `components/shared` pero con los controles del lado escolar
 * (NativeSelect + Input, colores zero-*). Se usa dentro de diálogos: por eso el
 * `<select>` es nativo (el Radix no despliega dentro de un Dialog).
 *
 * Misma idea: el usuario elige PRIMERO qué documento va a poner y el campo se
 * ajusta (placeholder, teclado, validación). El tipo se deduce del valor al
 * editar y no se guarda. Ver `lib/documento/identidad.ts`.
 */

import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import {
  type TipoDocumento, TIPOS_DOCUMENTO, inferirTipo,
  PLACEHOLDER_DOCUMENTO, MAXLEN_DOCUMENTO, INPUTMODE_DOCUMENTO,
  formatearMientrasEscribe, normalizarDocumento, validarDocumento,
  tipoSugerido, etiquetaTipo,
} from '@/lib/documento/identidad';

/** «cédula (persona física)» es el matiz que el usuario reconoce al vuelo. */
function fraseTipo(tipo: TipoDocumento): string {
  return tipo === 'cedula' ? 'una cédula (persona física)'
    : tipo === 'rnc' ? 'un RNC'
    : 'un pasaporte';
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Marca el campo en rojo. */
  error?: boolean;
  disabled?: boolean;
  /** id/name del input, por si el formulario los necesita. */
  id?: string;
  name?: string;
  /** Restringe los tipos ofrecidos (p. ej. una empresa no usa pasaporte). */
  tipos?: ReadonlyArray<TipoDocumento>;
}

export function DocumentoIdentidadInput({
  value, onChange, error = false, disabled = false, id, name, tipos,
}: Props) {
  const opciones = tipos && tipos.length
    ? TIPOS_DOCUMENTO.filter((t) => tipos.includes(t.value))
    : TIPOS_DOCUMENTO;
  const [tipo, setTipo] = useState<TipoDocumento>(() => {
    const t = inferirTipo(value);
    return opciones.some((o) => o.value === t) ? t : opciones[0].value;
  });
  const mensaje = error ? validarDocumento(tipo, value) : null;
  const sugerido = tipoSugerido(tipo, value);
  const sugerenciaVisible = sugerido && opciones.some((o) => o.value === sugerido);

  function cambiarTipo(nuevo: TipoDocumento) {
    setTipo(nuevo);
    // Guarda pelado (sin guiones); el formato bonito es solo de pantalla.
    if (value) onChange(normalizarDocumento(formatearMientrasEscribe(nuevo, value)));
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <NativeSelect
          value={tipo}
          disabled={disabled}
          onChange={(e) => cambiarTipo(e.target.value as TipoDocumento)}
          className="w-[116px] shrink-0"
        >
          {opciones.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </NativeSelect>
        <Input
          id={id}
          name={name}
          // Muestra con guiones (cédula 000-0000000-0), guarda pelado.
          value={formatearMientrasEscribe(tipo, value)}
          disabled={disabled}
          error={error || !!mensaje}
          placeholder={PLACEHOLDER_DOCUMENTO[tipo]}
          inputMode={INPUTMODE_DOCUMENTO[tipo]}
          maxLength={tipo === 'rnc' ? 11 : MAXLEN_DOCUMENTO[tipo]}
          onChange={(e) => onChange(normalizarDocumento(formatearMientrasEscribe(tipo, e.target.value)))}
        />
      </div>
      {sugerenciaVisible && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          Esto parece {fraseTipo(sugerido!)}.
          <button
            type="button"
            onClick={() => cambiarTipo(sugerido!)}
            className="rounded-md bg-zero-50 px-1.5 py-0.5 font-semibold text-zero-700 transition-colors hover:bg-zero-100"
          >
            Cambiar a {etiquetaTipo(sugerido!)}
          </button>
        </p>
      )}
      {mensaje && <p className="text-xs text-red-600">{mensaje}</p>}
    </div>
  );
}
