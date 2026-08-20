'use client';

/**
 * DocumentoIdentidadInput (MUI) — selector de tipo + campo de documento.
 *
 * El usuario elige PRIMERO qué va a escribir (RNC / Cédula / Pasaporte) y el
 * campo se ajusta: placeholder, teclado, validación y —en modo `busqueda`— si
 * consulta el padrón. Antes el mismo campo aceptaba las tres cosas y el sistema
 * adivinaba por el largo; nueve dígitos de una cédula a medio teclear pasaban
 * por RNC sin avisar.
 *
 * La intención del selector MANDA sobre la autodetección: si lo tecleado apunta
 * a otro tipo (p. ej. 11 dígitos con RNC elegido), no se cambia solo — se ofrece
 * una sugerencia «Esto parece una cédula. ¿Cambiar el selector?» y el usuario
 * decide. Así el «persona física» de una cédula solo aparece cuando de verdad
 * se está poniendo en otro tipo, como pista para corregir.
 *
 * El tipo no se persiste: al abrir en modo edición se deduce del valor con
 * `inferirTipo`. Ver `lib/documento/identidad.ts`.
 *
 * Dos modos:
 *   · plano (por defecto): Select + TextField. Proveedor de gasto, vendedor…
 *   · busqueda: para RNC/cédula monta el autocompletado del padrón (RncSearch);
 *     para pasaporte, que no está en ningún padrón, un TextField normal. Lo usa
 *     la ficha de cliente/contacto.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { RncSearch, type RncResult } from '@/components/RncSearch';
import {
  type TipoDocumento, TIPOS_DOCUMENTO, inferirTipo, tienePadron,
  PLACEHOLDER_DOCUMENTO, MAXLEN_DOCUMENTO, INPUTMODE_DOCUMENTO,
  formatearMientrasEscribe, normalizarDocumento, validarDocumento,
  tipoSugerido, etiquetaTipo,
} from '@/lib/documento/identidad';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Modo búsqueda: RNC/cédula consultan el padrón; llega aquí lo elegido. */
  busqueda?: boolean;
  /** En modo búsqueda, para autocompletar la razón social con lo del padrón. */
  onSelectPadron?: (r: RncResult) => void;
  /** Marca el campo en rojo (lo controla el formulario que lo monta). */
  error?: boolean;
  /** No poner placeholder de padrón vacío en el desplegable de búsqueda. */
  showSyncHint?: boolean;
  disabled?: boolean;
  /** Restringe los tipos ofrecidos (p. ej. una empresa no usa pasaporte). */
  tipos?: ReadonlyArray<TipoDocumento>;
}

const selectSx = {
  borderRadius: '8px',
  fontSize: '0.875rem',
  minWidth: 116,
  bgcolor: '#f9fafb',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' },
} as const;

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } as const;

/** «cédula (persona física)» es el matiz que el usuario reconoce al vuelo. */
function fraseTipo(tipo: TipoDocumento): string {
  return tipo === 'cedula' ? 'una cédula (persona física)'
    : tipo === 'rnc' ? 'un RNC'
    : 'un pasaporte';
}

export function DocumentoIdentidadInput({
  value, onChange, busqueda = false, onSelectPadron,
  error = false, showSyncHint = false, disabled = false, tipos,
}: Props) {
  const opciones = tipos && tipos.length
    ? TIPOS_DOCUMENTO.filter((t) => tipos.includes(t.value))
    : TIPOS_DOCUMENTO;
  // El tipo arranca deducido del valor (edición); a partir de ahí lo manda el
  // selector. Se guarda aquí porque no viaja a la base.
  const [tipo, setTipo] = useState<TipoDocumento>(() => {
    const t = inferirTipo(value);
    return opciones.some((o) => o.value === t) ? t : opciones[0].value;
  });
  // En búsqueda el texto en vivo vive dentro de RncSearch (no en `value`, que
  // solo cambia al elegir); lo espejamos aquí para poder sugerir cambio de tipo.
  const [texto, setTexto] = useState(value);
  const textoActual = busqueda ? texto : value;

  const mensaje = error ? validarDocumento(tipo, value) : null;
  const sugerido = tipoSugerido(tipo, textoActual);
  const sugerenciaVisible = sugerido && opciones.some((o) => o.value === sugerido);

  function cambiarTipo(nuevo: TipoDocumento) {
    setTipo(nuevo);
    // Reformatea lo ya escrito al nuevo tipo sin borrarlo: si el usuario se
    // equivocó de tipo, no pierde lo tecleado. En búsqueda el texto vive en
    // RncSearch, así que se empuja a `value` para que reaparezca allí.
    // Se guarda pelado (sin guiones); el formato bonito es solo de pantalla.
    const base = value || texto;
    const limpio = base ? normalizarDocumento(formatearMientrasEscribe(nuevo, base)) : '';
    setTexto(limpio);
    if (base) onChange(limpio);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Select
          size="small"
          value={tipo}
          disabled={disabled}
          onChange={(e) => cambiarTipo(e.target.value as TipoDocumento)}
          sx={selectSx}
        >
          {opciones.map((t) => (
            <MenuItem key={t.value} value={t.value} sx={{ fontSize: '0.875rem' }}>
              {t.label}
            </MenuItem>
          ))}
        </Select>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {busqueda && tienePadron(tipo) ? (
            <RncSearch
              placeholder={tipo === 'cedula' ? 'Buscar cédula o nombre…' : 'Buscar RNC o razón social…'}
              value={value || undefined}
              tipo={tipo as 'rnc' | 'cedula'}
              hideNoData
              onQueryChange={(t) => {
                setTexto(t);
                // `value` sigue exactamente al texto: se guarda el documento en
                // cuanto es válido y completo (un RNC/cédula fuera del padrón
                // queda registrado sin pedir «usar de todos modos»), y a medio
                // teclear queda en '' porque aún no hay documento que guardar.
                // RncSearch no borra el texto mientras se escribe: su sync con
                // `value` está protegido por el foco. Se guarda pelado.
                onChange(validarDocumento(tipo, t) === null ? normalizarDocumento(t) : '');
              }}
              onSelect={(r) => { onChange(r.rnc); setTexto(r.rnc); onSelectPadron?.(r); }}
              onClear={() => { onChange(''); setTexto(''); }}
              showSyncHint={showSyncHint}
            />
          ) : (
            <TextField
              fullWidth
              size="small"
              disabled={disabled}
              error={!!mensaje}
              placeholder={PLACEHOLDER_DOCUMENTO[tipo]}
              // Muestra con guiones (cédula 000-0000000-0), guarda pelado.
              value={formatearMientrasEscribe(tipo, value)}
              onChange={(e) => {
                const limpio = normalizarDocumento(formatearMientrasEscribe(tipo, e.target.value));
                onChange(limpio); setTexto(limpio);
              }}
              slotProps={{ htmlInput: {
                inputMode: INPUTMODE_DOCUMENTO[tipo],
                // RNC deja escribir hasta 11 para poder sugerir «parece cédula».
                maxLength: tipo === 'rnc' ? 11 : MAXLEN_DOCUMENTO[tipo],
              } }}
              sx={fieldSx}
            />
          )}
        </Box>
      </Box>

      {sugerenciaVisible && (
        <Box sx={{ pl: '124px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: '#6b7280' }}>
          <Box component="span">Esto parece {fraseTipo(sugerido!)}.</Box>
          <Box
            component="button"
            type="button"
            onClick={() => cambiarTipo(sugerido!)}
            sx={{
              border: 'none', bgcolor: '#eef2fe', color: '#2a45c4', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, borderRadius: '6px',
              px: 1, py: 0.25, transition: 'background-color 0.15s', '&:hover': { bgcolor: '#e0e7fd' },
            }}
          >
            Cambiar a {etiquetaTipo(sugerido!)}
          </Box>
        </Box>
      )}

      {mensaje && (
        <Box component="span" sx={{ fontSize: '0.75rem', color: '#dc2626', pl: '124px' }}>
          {mensaje}
        </Box>
      )}
    </Box>
  );
}
