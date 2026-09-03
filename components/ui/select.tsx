'use client';

import * as React from 'react';
import FormControl from '@mui/material/FormControl';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

/**
 * Select compuesto, sobre MUI.
 *
 * Conserva la forma que traía de Radix —`Select > SelectTrigger > SelectValue`
 * y `SelectContent > SelectItem`— porque son 18 sitios los que la escriben así
 * y 41 opciones repartidas entre ellos. Cambiar la forma habría obligado a
 * reescribir todos para no ganar nada visible.
 *
 * Por dentro ya no queda nada de Radix: era el último que lo importaba.
 *
 * El truco está en que `SelectTrigger`, `SelectValue` y `SelectContent` no
 * pintan nada por su cuenta. Son marcas: `Select` recorre sus hijos, saca de
 * ellas el ancho, el texto de relleno y las opciones, y arma UN solo
 * `MuiSelect`. Radix necesitaba esa anidación porque el disparador y el
 * panel son dos piezas separadas; MUI los dibuja juntos.
 */

interface SelectCtx {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}
const Ctx = React.createContext<SelectCtx>({});

/* ── Marcas: no pintan, solo llevan props que `Select` lee ─────────────────── */

function SelectTrigger(_props: {
  children?: React.ReactNode;
  className?: string;
  sx?: React.ComponentProps<typeof MuiSelect>['sx'];
}) {
  return null;
}

function SelectValue(_props: { placeholder?: string; children?: React.ReactNode }) {
  return null;
}

function SelectContent({ children }: { children?: React.ReactNode; className?: string }) {
  return <>{children}</>;
}

/* ── Opciones ─────────────────────────────────────────────────────────────── */

function SelectItem({
  value,
  children,
  className,
  disabled,
}: {
  value: string;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <MenuItem value={value} className={className} disabled={disabled} sx={{ fontSize: '0.875rem' }}>
      {children}
    </MenuItem>
  );
}

function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function SelectLabel({ children }: { children?: React.ReactNode }) {
  return <ListSubheader sx={{ fontSize: '0.75rem', lineHeight: 2.2 }}>{children}</ListSubheader>;
}

function SelectSeparator() {
  return <Divider sx={{ my: 0.5 }} />;
}

/** Existían porque Radix dibujaba flechas al desbordar. MUI desplaza solo. */
function SelectScrollUpButton() { return null; }
function SelectScrollDownButton() { return null; }

/* ── El contenedor, que es quien de verdad pinta ───────────────────────────── */

function Select({
  value,
  onValueChange,
  disabled,
  children,
  id,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  /**
   * Id del control. Lo inyecta el `<Field>` compartido (clona su hijo con un
   * `id`) para que su `<Label htmlFor>` apunte al control. Sin reenviarlo aquí,
   * la etiqueta quedaba colgada: un `<Input>` sí recibe el id, pero este Select
   * lo ignoraba, así que hacer clic en la etiqueta —«Sexo», p. ej.— no abría
   * nada. Se pasa al MuiSelect para reponer esa asociación.
   */
  id?: string;
}) {
  /**
   * Se recorre un solo nivel a propósito. Los 18 consumidores escriben el
   * trigger y el content como hijos directos; buscar en profundidad abriría la
   * puerta a que un `SelectItem` de otro Select anidado se cuele en este.
   */
  let placeholder: string | undefined;
  let triggerClassName: string | undefined;
  let triggerSx: React.ComponentProps<typeof MuiSelect>['sx'];
  const opciones: React.ReactNode[] = [];

  for (const hijo of React.Children.toArray(children)) {
    if (!React.isValidElement(hijo)) continue;

    if (hijo.type === SelectTrigger) {
      const p = hijo.props as React.ComponentProps<typeof SelectTrigger>;
      triggerClassName = p.className;
      triggerSx = p.sx;
      for (const nieto of React.Children.toArray(p.children)) {
        if (React.isValidElement(nieto) && nieto.type === SelectValue) {
          placeholder = (nieto.props as React.ComponentProps<typeof SelectValue>).placeholder;
        }
      }
    } else if (hijo.type === SelectContent) {
      opciones.push(...React.Children.toArray((hijo.props as { children?: React.ReactNode }).children));
    }
  }

  return (
    <FormControl size="small" disabled={disabled} className={triggerClassName}>
      <MuiSelect
        id={id}
        value={value ?? ''}
        onChange={(e) => onValueChange?.(String(e.target.value))}
        displayEmpty
        // Sin esto, un valor vacío deja la caja en blanco y el usuario no sabe
        // qué filtro está mirando. Radix pintaba el placeholder por su cuenta.
        renderValue={(v) => {
          if (v === '' || v == null) {
            return <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.disabled' }}>{placeholder ?? ''}</Typography>;
          }
          for (const op of opciones) {
            if (React.isValidElement(op) && (op.props as { value?: string }).value === v) {
              return (op.props as { children?: React.ReactNode }).children;
            }
          }
          return String(v);
        }}
        sx={{ fontSize: '0.875rem', ...triggerSx }}
      >
        {opciones}
      </MuiSelect>
    </FormControl>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
