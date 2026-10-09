'use client';

// Pequeño reemplazo de `EmptyState` de components/app/Primitivos del CRM, que
// no existe en Zero. No es un port de ningún fichero de la lista de la tarea:
// se necesitaba un estado vacío consistente para el lienzo del constructor y
// la lista de formularios, y no vale la pena traer un sistema de componentes
// entero por esto.
import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function EmptyState({
  icon, titulo, descripcion, accion,
}: {
  icon: ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.disabled' }}>
      <Box sx={{ display: 'inline-flex', mb: 1.5 }}>{icon}</Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.secondary' }}>{titulo}</Typography>
      {descripcion && (
        <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 360, mx: 'auto' }}>{descripcion}</Typography>
      )}
      {accion && <Box sx={{ mt: 2 }}>{accion}</Box>}
    </Box>
  );
}
