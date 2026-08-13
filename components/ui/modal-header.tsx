'use client';

import type { ReactNode } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Encabezado de modal: título + subtítulo.
 *
 * Antes llevaba delante un ícono dentro de un cuadro de color. Se quitó: no
 * decía nada que el título no dijera ya, y en los diálogos estrechos comía el
 * ancho del texto.
 */
export function ModalHeader({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
    </DialogHeader>
  );
}
