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

/**
 * Deja solo dígitos y un punto decimal, con a lo sumo `decimales` decimales.
 *
 * La COMA es el separador de miles que la propia máscara pinta («2,500»), así
 * que al volver a leer lo que hay en el campo se descarta: leerla como decimal
 * convertía «2,5001» en «2.50» y el monto dejaba de aceptar dígitos justo al
 * pasar de mil. El decimal es solo el punto, como se escribe el dinero aquí.
 */
export function limpiarMonto(texto: string, decimales = 2): string {
  const t = texto.replace(/[^\d.]/g, '');
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

/** Cuántos caracteres «significativos» (dígitos y punto) hay antes de `pos`. */
function significativosAntes(texto: string, pos: number): number {
  return texto.slice(0, pos).replace(/[^\d.]/g, '').length;
}

/** La posición en `texto` donde ya pasaron `n` caracteres significativos. */
function posicionDe(texto: string, n: number): number {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/[\d.]/.test(texto[i])) vistos++;
    if (vistos === n) return i + 1;
  }
  return texto.length;
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
  value, onValueChange, className, placeholder = '0.00', maxLength = 18, ...resto
}: Props) {
  const caja = React.useRef<HTMLDivElement>(null);
  /** Dónde debe quedar el cursor tras pintar el valor con su máscara. */
  const cursor = React.useRef<number | null>(null);
  const visible = conMiles(value);

  // Al reescribir el valor con comas el navegador manda el cursor al final, y
  // editar un dígito del medio acababa escribiendo en otro sitio. Se coloca
  // contando los dígitos que había a su izquierda.
  React.useLayoutEffect(() => {
    const n = cursor.current;
    if (n == null) return;
    cursor.current = null;
    const input = caja.current?.querySelector('input');
    if (!input || document.activeElement !== input) return;
    const p = posicionDe(input.value, n);
    input.setSelectionRange(p, p);
  }, [visible]);

  return (
    <div ref={caja} className="relative w-full">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-gray-400">
        RD$
      </span>
      <Input
        {...resto}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        // Con las comas de miles lo escrito mide más que el número: el tope
        // se cuenta sobre el número crudo (en `limpiarMonto`), no aquí.
        maxLength={maxLength}
        className={['pl-11 text-right font-mono tabular-nums', className].filter(Boolean).join(' ')}
        value={visible}
        onChange={(e) => {
          const el = e.target;
          cursor.current = significativosAntes(el.value, el.selectionStart ?? el.value.length);
          const nuevo = limpiarMonto(el.value);
          // Si no cambió el valor crudo (p. ej. se tecleó una letra) no habrá
          // re-render que reponga el cursor: se suelta la marca.
          if (nuevo === value) cursor.current = null;
          onValueChange(nuevo);
        }}
        // Al salir, «2500.5» pasa a «2500.50»: lo que se ve es lo que se cobra.
        onBlur={() => {
          if (value && value !== '.') onValueChange(Number(value).toFixed(2));
        }}
      />
    </div>
  );
}
