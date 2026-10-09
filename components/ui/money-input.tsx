'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { limpiarMonto, mascaraMonto, posicionTrasMascara, significativosAntes } from '@/lib/utils/monto-mascara';

type MoneyInputProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** Valor crudo: «1234.5», sin comas. */
  value: string;
  /** Recibe el valor crudo ya limpio. */
  onChange: (valor: string) => void;
};

/**
 * Input de montos en pesos con separador de miles mientras se escribe, en el
 * mismo campo: se ve «1,234,567.50» y el formulario guarda «1234567.50». Acepta
 * pegar «RD$ 1,234.50»; no deja letras, más de 2 decimales ni negativos, y el
 * cursor se queda donde estaba aunque se inserten comas.
 */
function MoneyInput({ value, onChange, placeholder = '0.00', ...resto }: MoneyInputProps) {
  const alCambiar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const nuevo = limpiarMonto(el.value);
    const significativos = significativosAntes(el.value, el.selectionStart ?? el.value.length);
    onChange(nuevo);
    // React pinta el valor enmascarado después: ahí se devuelve el cursor.
    const visible = mascaraMonto(nuevo);
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      const pos = posicionTrasMascara(visible, significativos);
      try { el.setSelectionRange(pos, pos); } catch { /* el input ya no está */ }
    });
  };
  return <Input {...resto} type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder} value={mascaraMonto(value)} onChange={alCambiar} />;
}

export { MoneyInput };
