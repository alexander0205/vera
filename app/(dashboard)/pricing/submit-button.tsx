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
      startIcon={pending ? <CircularProgress size={14} sx={{ color: destacado ? '#2a45c4' : '#fff' }} /> : undefined}
      sx={{
        borderRadius: '99px',
        textTransform: 'none',
        fontSize: '0.875rem',
        fontWeight: 500,
        py: 1.25,
        ...(destacado
          ? { bgcolor: '#fff', color: '#2a45c4', '&:hover': { bgcolor: '#eef2fe' }, '&:disabled': { bgcolor: '#fff', opacity: 0.7 } }
          : { bgcolor: '#3658e1', color: '#fff', '&:hover': { bgcolor: '#2a45c4' } }),
      }}
    >
      {pending ? 'Cargando…' : label}
    </Button>
  );
}
