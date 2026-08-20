'use client';

/**
 * «Volver» del 404.
 *
 * Es lo único que necesita cliente en esa página, así que vive aparte para que
 * el resto siga siendo Server Component. `router.back()` y no un href fijo:
 * quien cayó aquí desde un enlace roto de la app quiere volver a donde estaba,
 * no a una ruta que nosotros adivinemos.
 */

import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
import { ArrowLeft } from 'lucide-react';

export function BotonVolver() {
  const router = useRouter();

  return (
    <Button
      variant="outlined"
      onClick={() => router.back()}
      startIcon={<ArrowLeft style={{ width: 16, height: 16 }} />}
      sx={{
        borderRadius: '10px', textTransform: 'none', fontWeight: 600,
        borderColor: '#d1d5db', color: '#374151',
        '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' },
      }}
    >
      Volver
    </Button>
  );
}
