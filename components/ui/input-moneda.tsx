'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

/**
 * Campo de monto en pesos dominicanos con máscara: «RD$ 12,500.50».
 *
 * El valor que entra y sale es el número crudo como texto —`"12500.50"`, sin
 * comas—, que es lo que el resto de las pantallas ya hacen con `Number(...)` y
 * envían a la API. La máscara es solo de lo que se ve: así sustituye a un
 * `<Input type="number">` sin tocar lo que hay detrás.
 *
 * `type="number"` no sirve para dinero: no separa miles (25000 se lee mal),
 * acepta `e` y signos, y cambia con la rueda del ratón. Aquí solo caben dígitos
 * y un punto, con dos decimales como máximo.
 */

/** Deja solo dígitos y un punto decimal, con a lo sumo `decimales` decimales. */
export function limpiarMonto(texto: string, decimales = 2): string {
  const t = texto.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const i = t.indexOf('.');
  if (i === -1) return t.replace(/^0+(?=\d)/, '');
  const entero = t.slice(0, i).replace(/^0+(?=\d)/, '') || '0';
  const dec = t.slice(i + 1).replace(/\./g, '').slice(0, decimales);
  return `${entero}.${dec}`;
}

/** «12500.5» → «12,500.5»: solo los miles; los decimales se dejan como van. */
export function conMiles(crudo: string): string {
  if (!crudo) return '';
  const [entero, dec] = crudo.split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === undefined ? miles : `${miles}.${dec}`;
}

type Props = {
  /** Número crudo («12500.50») o vacío. */
  value: string;
  onValueChange: (crudo: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  maxLength?: number;
  'aria-label'?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

export function InputMoneda({
  value, onValueChange, className, placeholder = '0.00', maxLength = 15, ...resto
}: Props) {
  return (
    <div className="relative w-full">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-gray-400">
        RD$
      </span>
      <Input
        {...resto}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={maxLength}
        className={['pl-11 text-right font-mono tabular-nums', className].filter(Boolean).join(' ')}
        value={conMiles(value)}
        onChange={(e) => onValueChange(limpiarMonto(e.target.value))}
        // Al salir, «2500.5» pasa a «2500.50»: lo que se ve es lo que se cobra.
        onBlur={() => {
          if (value && value !== '.') onValueChange(Number(value).toFixed(2));
        }}
      />
    </div>
  );
}
