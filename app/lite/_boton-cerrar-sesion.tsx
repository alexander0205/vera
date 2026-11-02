'use client';

import { LogOut } from 'lucide-react';
import Box from '@mui/material/Box';

/**
 * Cerrar sesión desde Lite. Igual que `ProfileDropdown`: borra la sesión y
 * recarga entero, porque una navegación suave conservaría la caché del usuario
 * que se acaba de ir (el porqué completo está allí).
 */
export function BotonCerrarSesion() {
  async function salir() {
    await fetch('/api/user', { method: 'DELETE' });
    window.location.href = '/sign-in';
  }

  return (
    <Box
      component="button"
      type="button"
      onClick={salir}
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      sx={{ display: 'flex', alignItems: 'center', color: '#4b5563', '&:hover': { color: '#111827' }, p: '4px', border: 0, bgcolor: 'transparent', cursor: 'pointer' }}
    >
      <LogOut size={16} />
    </Box>
  );
}
