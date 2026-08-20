'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * `<select>` nativo estilizado como los Input.
 *
 * Se usa EN VEZ del Select de Radix cuando el control vive DENTRO de un diálogo:
 * un Radix Select dentro del `Dialog` no deja elegir opción (el modal deja el
 * `body` en `pointer-events:none` y el popover del Select se porta ahí). El
 * nativo lo pinta el sistema operativo, así que es inmune a ese problema y
 * funciona igual en móvil. La API imita lo justo: `value` + `onChange`.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900',
        'outline-none transition-colors hover:border-gray-400 focus:border-zero-500 focus:ring-1 focus:ring-zero-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
