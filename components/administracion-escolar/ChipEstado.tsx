'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

/**
 * La pastilla de estado de la ficha escolar: Pagado, Vencido, Parcial…
 *
 * Existe porque `Badge` es un `Chip` de MUI y su variante por defecto pinta el
 * fondo con `primary.main` por `sx`. Esos estilos van sin capa y las clases de
 * Tailwind van en `@layer utilities`, así que el `sx` gana siempre: un
 * `<Badge className="bg-red-50 text-red-600">` salía azul de marca, igual que
 * Pagado, Parcial y Pendiente. Un estado que no se distingue por color no avisa
 * de nada. Aquí el color va por `sx`, que es lo único que MUI respeta.
 */
export const CHIP = {
  verde:   { bg: '#E8F6EF', fg: '#0F7A4A' },
  rojo:    { bg: '#FDECEC', fg: '#B4231F' },
  ambar:   { bg: '#FEF6E7', fg: '#B45309' },
  violeta: { bg: '#F3EFFE', fg: '#6D28D9' },
  azul:    { bg: '#EAF1FD', fg: '#1D4ED8' },
  gris:    { bg: '#F2F4FA', fg: '#4A5164' },
} as const;

export type TonoChip = keyof typeof CHIP;

export function ChipEstado({ tono, children }: { tono: TonoChip; children: React.ReactNode }) {
  const c = CHIP[tono];
  return (
    <Box component="span" sx={{
      display: 'inline-grid', placeItems: 'center', height: 22, px: 1.125,
      borderRadius: '6px', bgcolor: c.bg, color: c.fg,
      fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {children}
    </Box>
  );
}
