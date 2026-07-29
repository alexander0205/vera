'use client';

import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { ArrowRight } from 'lucide-react';
import { useFormStatus } from 'react-dom';

export function SubmitButton({
  destacado = false,
  label = 'Empezar prueba gratis',
}: {
  destacado?: boolean;
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      fullWidth
      variant="contained"
      disableElevation
      disabled={pending}
      endIcon={pending ? undefined : <ArrowRight size={16} />}
      startIcon={pending ? <CircularProgress size={14} sx={{ color: destacado ? '#0f766e' : '#fff' }} /> : undefined}
      sx={{
        borderRadius: '99px',
        textTransform: 'none',
        fontSize: '0.875rem',
        fontWeight: 500,
        py: 1.25,
        ...(destacado
          ? { bgcolor: '#fff', color: '#0f766e', '&:hover': { bgcolor: '#f0fdfa' }, '&:disabled': { bgcolor: '#fff', opacity: 0.7 } }
          : { bgcolor: '#0d9488', color: '#fff', '&:hover': { bgcolor: '#0f766e' } }),
      }}
    >
      {pending ? 'Cargando…' : label}
    </Button>
  );
}
