'use client';

import * as React from 'react';
import MuiButton from '@mui/material/Button';
import MuiIconButton from '@mui/material/IconButton';
import { Slot as RadixSlot } from 'radix-ui';
import type { SxProps, Theme } from '@mui/material/styles';

type ShadcnVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ShadcnSize   = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ShadcnVariant;
  size?:     ShadcnSize;
  asChild?:  boolean;
  children?: React.ReactNode;
  className?: string;
}

function getMuiVariant(v?: ShadcnVariant): 'contained' | 'outlined' | 'text' {
  if (v === 'outline' || v === 'secondary') return 'outlined';
  if (v === 'ghost'   || v === 'link')      return 'text';
  return 'contained';
}

function getMuiColor(v?: ShadcnVariant): 'primary' | 'error' | 'inherit' {
  if (v === 'destructive') return 'error';
  if (v === 'secondary' || v === 'ghost') return 'inherit';
  return 'primary';
}

function getMuiSize(s?: ShadcnSize): 'small' | 'medium' | 'large' {
  if (s === 'sm') return 'small';
  if (s === 'lg') return 'large';
  return 'medium';
}

function getLinkSx(v?: ShadcnVariant): SxProps<Theme> {
  if (v === 'link') return { textDecoration: 'underline', '&:hover': { textDecoration: 'underline' } };
  return {};
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  type = 'button',
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>;
    const muiVariant  = getMuiVariant(variant);
    const muiColor    = getMuiColor(variant);
    const muiSize     = getMuiSize(size);

    return (
      <MuiButton
        variant={muiVariant}
        color={muiColor}
        size={muiSize}
        disabled={disabled}
        sx={getLinkSx(variant)}
        component={React.forwardRef<HTMLElement, Record<string, unknown>>((p, ref) =>
          React.cloneElement(child, { ...p, ref })
        )}
        className={className}
      >
        {(child.props as { children?: React.ReactNode }).children ?? children}
      </MuiButton>
    );
  }

  if (size === 'icon') {
    return (
      <MuiIconButton
        size="small"
        disabled={disabled}
        onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
        className={className}
        type={type as 'button' | 'submit' | 'reset'}
        {...(rest as object)}
      >
        {children}
      </MuiIconButton>
    );
  }

  return (
    <MuiButton
      variant={getMuiVariant(variant)}
      color={getMuiColor(variant)}
      size={getMuiSize(size)}
      disabled={disabled}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      type={type as 'button' | 'submit' | 'reset'}
      sx={getLinkSx(variant)}
      className={className}
      {...(rest as object)}
    >
      {children}
    </MuiButton>
  );
}

export { Button };
export type { ButtonProps };
