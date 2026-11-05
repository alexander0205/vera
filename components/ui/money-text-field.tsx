'use client';

import * as React from 'react';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { limpiarMonto, mascaraMonto, posicionTrasMascara, significativosAntes } from '@/lib/utils/monto-mascara';

type MoneyTextFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type' | 'select'> & {
  /** Valor crudo: «1234.5», sin comas. */
  value: string;
  /** Recibe el valor crudo ya limpio. */
  onChange: (valor: string) => void;
};

/**
 * La versión MUI de `MoneyInput`: separador de miles mientras se escribe, en el
 * mismo campo, y el estado guarda el número crudo («1234567.50»).
 */
export function MoneyTextField({ value, onChange, slotProps, ...resto }: MoneyTextFieldProps) {
  const alCambiar = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.target;
    const nuevo = limpiarMonto(el.value);
    const significativos = significativosAntes(el.value, el.selectionStart ?? el.value.length);
    onChange(nuevo);
    const visible = mascaraMonto(nuevo);
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      const pos = posicionTrasMascara(visible, significativos);
      try { el.setSelectionRange(pos, pos); } catch { /* el input ya no está */ }
    });
  };
  const slots = (slotProps ?? {}) as { htmlInput?: Record<string, unknown> } & Record<string, unknown>;
  return (
    <TextField
      {...resto}
      type="text"
      value={mascaraMonto(value)}
      onChange={alCambiar}
      slotProps={{ ...slots, htmlInput: { ...(slots.htmlInput ?? {}), inputMode: 'decimal', autoComplete: 'off' } }}
    />
  );
}
