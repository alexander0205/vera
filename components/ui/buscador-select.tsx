'use client';

import * as React from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ListSubheader from '@mui/material/ListSubheader';

export interface OpcionBuscador {
  valor: string;
  etiqueta: string;
  /** Encabezado bajo el que se agrupa. Las de un mismo grupo van seguidas. */
  grupo?: string;
  /**
   * Cómo se lee dentro de la lista, si repetir la etiqueta entera sobra.
   *
   * Una sección se llama "Kinder — Inicial · Matutina — A": el campo necesita
   * ese nombre completo para decir qué hay elegido, pero dentro del grupo
   * "Kinder — Inicial · Matutina" lo único nuevo es la "A", y escribirlo todo
   * empujaba justo esa letra fuera del ancho visible.
   */
  etiquetaLista?: string;
  /** Segunda línea, para desempatar homónimos (código, cédula…). */
  detalle?: string;
}

/**
 * Deja un texto en minúsculas y sin tildes.
 *
 * Buscar "jose" tiene que encontrar a "José": quien escribe rápido no pone
 * tildes, y en un listado de nombres dominicanos eso es la mayoría de las
 * búsquedas.
 */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * El filtro de MUI compara contra `getOptionLabel` y respeta las tildes. Se
 * reemplaza por uno que normaliza los dos lados y que además mira el detalle:
 * en un listado de homónimos, el código o la cédula es lo único que distingue
 * a dos "José Pérez", y es por ahí por donde la secretaria escribe.
 */
const filtrar = createFilterOptions<OpcionBuscador>({
  stringify: (o) => normalizar(`${o.etiqueta} ${o.detalle ?? ''}`),
});

/**
 * Buscador con lista desplegable, sobre el Autocomplete de MUI.
 *
 * Antes era un combo escrito a mano —contenedor, lista, teclado, resaltado y
 * cierre al hacer clic fuera, todo propio— porque no había un componente que
 * lo diera. Ahora lo da MUI, y la versión a mano se quedaba corta en teclado
 * y en lectores de pantalla.
 *
 * La API no cambió: sigue recibiendo y devolviendo el `valor` en texto plano,
 * no el objeto. Es lo que espera el único sitio que lo usa (`MatriculaDialog`)
 * y lo que hace que encaje con el resto de campos del formulario.
 */
export function BuscadorSelect({
  value,
  onChange,
  opciones,
  placeholder = 'Buscar…',
  vacio = 'Sin resultados',
  disabled,
  id,
  className,
}: {
  value: string;
  onChange: (valor: string) => void;
  opciones: OpcionBuscador[];
  placeholder?: string;
  /** Qué decir cuando lo escrito no encuentra nada. */
  vacio?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const seleccionada = React.useMemo(
    () => opciones.find((o) => o.valor === value) ?? null,
    [opciones, value],
  );

  return (
    <Autocomplete
      id={id}
      className={className}
      disabled={disabled}
      options={opciones}
      value={seleccionada}
      onChange={(_e, opcion) => onChange(opcion?.valor ?? '')}
      isOptionEqualToValue={(a, b) => a.valor === b.valor}
      getOptionLabel={(o) => o.etiqueta}
      filterOptions={filtrar}
      groupBy={(o) => o.grupo ?? ''}
      noOptionsText={vacio}
      size="small"
      fullWidth
      autoHighlight
      // Sin esto, elegir una opción deja el texto escrito y la siguiente
      // apertura arranca filtrada por él.
      blurOnSelect
      renderInput={(params) => (
        <TextField {...params} placeholder={placeholder} />
      )}
      renderGroup={(params) => (
        <li key={params.key}>
          {params.group ? (
            <ListSubheader sx={{ fontSize: '0.75rem', fontWeight: 600, lineHeight: 2.2 }}>
              {params.group}
            </ListSubheader>
          ) : null}
          <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>{params.children}</Box>
        </li>
      )}
      renderOption={(props, o) => {
        const { key, ...resto } = props as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
        return (
          <Box component="li" key={key ?? o.valor} {...resto} sx={{ display: 'block !important', py: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: '0.875rem', lineHeight: 1.35 }}>
              {o.etiquetaLista ?? o.etiqueta}
            </Typography>
            {o.detalle && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {o.detalle}
              </Typography>
            )}
          </Box>
        );
      }}
      sx={{ '& .MuiAutocomplete-input': { fontSize: '0.875rem' } }}
    />
  );
}
