'use client';

import * as React from 'react';
import { styled } from '@mui/material/styles';

/**
 * `<select>` nativo con el aspecto de los campos de MUI.
 *
 * Sigue siendo NATIVO a propósito. La razón original —que el Select de Radix
 * dentro de un diálogo no dejaba elegir, porque el modal ponía el `body` en
 * `pointer-events:none` y el popover se portaba ahí— ya no aplica ahora que el
 * diálogo es de MUI. Pero quedan dos que sí:
 *
 *   1. En móvil el sistema operativo pinta su propia rueda de selección, que
 *      se maneja mucho mejor con el pulgar que una lista flotante.
 *   2. Los 16 sitios que lo usan le pasan `<option>` como hijos. Cambiarlo a
 *      `MenuItem` obligaría a tocar los dieciséis para no ganar nada.
 *
 * Se estiliza con `styled()` y NO con el componente `NativeSelect` de MUI: ese
 * tipa sus eventos contra `HTMLDivElement` (por el envoltorio que dibuja) y
 * aquí los consumidores pasan manejadores de `HTMLSelectElement`. Envolverlo
 * obligaría a recortar media docena de props para callar al compilador; con
 * `styled` el elemento sigue siendo un `<select>` de verdad, con su tipado
 * intacto, y el borde, el radio y el foco salen del tema.
 */
const SelectEstilizado = styled('select')(({ theme }) => ({
  height:          40,
  width:           '100%',
  cursor:          'pointer',
  borderRadius:    theme.shape.borderRadius,
  border:          `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  color:           theme.palette.text.primary,
  paddingInline:   theme.spacing(1.5),
  fontSize:        '0.875rem',
  fontFamily:      theme.typography.fontFamily,
  outline:         'none',
  transition:      theme.transitions.create(['border-color', 'box-shadow'], {
    duration: theme.transitions.duration.shorter,
  }),
  '&:hover:not(:disabled)': {
    borderColor: theme.palette.text.secondary,
  },
  '&:focus': {
    borderColor: theme.palette.primary.main,
    boxShadow:   `0 0 0 1px ${theme.palette.primary.main}`,
  },
  '&:disabled': {
    cursor:  'not-allowed',
    opacity: 0.5,
  },
}));

export function NativeSelect(props: React.ComponentProps<'select'>) {
  return <SelectEstilizado {...props} />;
}
