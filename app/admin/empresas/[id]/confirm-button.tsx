'use client';

import { Button } from '@mui/material';

interface Props {
  action:    (formData: FormData) => Promise<void>;
  message:   string;
  className?: string;
  children:  React.ReactNode;
  fields:    Record<string, string | number>;
  variant?:  'text' | 'outlined' | 'contained';
  color?:    'primary' | 'error' | 'inherit';
  size?:     'small' | 'medium';
}

export function ConfirmButton({ action, message, children, fields, variant = 'text', color = 'inherit', size = 'small' }: Props) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <Button
        type="submit"
        variant={variant}
        color={color}
        size={size}
        disableElevation
        onClick={e => { if (!confirm(message)) e.preventDefault(); }}
        sx={{ textTransform: 'none', minWidth: 0, p: 0, fontWeight: 500 }}
      >
        {children}
      </Button>
    </form>
  );
}
