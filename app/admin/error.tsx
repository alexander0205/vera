'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { AlertTriangle } from 'lucide-react';

/**
 * Si una sección del panel falla al cargar, el resto del panel (menú, campana)
 * sigue vivo y aquí se ofrece reintentar. No se enseña el mensaje del error: en
 * producción Next lo tapa y en desarrollo puede traer datos.
 */
export default function ErrorAdmin({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Box role="alert" sx={{ maxWidth: 520, mx: 'auto', mt: 8, p: 4, textAlign: 'center', bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
      <AlertTriangle size={36} color="#f59e0b" style={{ margin: '0 auto 12px' }} />
      <Typography sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>No se pudo cargar esta sección</Typography>
      <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 2 }}>
        Puede ser la conexión con la base de datos. Intenta de nuevo; si sigue, avisa al equipo.
        {error.digest && <Box component="span" sx={{ display: 'block', mt: 1, fontFamily: 'monospace', fontSize: '0.6875rem', color: '#9ca3af' }}>Código: {error.digest}</Box>}
      </Typography>
      <Button onClick={reset} variant="contained" disableElevation sx={{ textTransform: 'none', borderRadius: '8px' }}>Reintentar</Button>
    </Box>
  );
}
