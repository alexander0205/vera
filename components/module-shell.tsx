'use client';

/**
 * ModuleShell — armazón común de los módulos que no son Facturación.
 *
 * Junta rail + header + contenido, y sobre todo resuelve el móvil: el rail se
 * oculta por debajo de `md`, así que sin esto la pantalla angosta se quedaba
 * SIN NINGUNA navegación — ni menú, ni forma de salir del módulo. Aquí el
 * mismo rail se reutiliza dentro de un Drawer que abre la hamburguesa del
 * header.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { ModuleHeader } from '@/components/module-header';
import type { UserInfo } from '@/components/profile-dropdown';
import type { ModuleKey } from '@/lib/config/modules';

export function ModuleShell({
  rail,
  railMovil,
  current,
  titulo,
  user,
  children,
}: {
  /** Rail de escritorio (se oculta solo por debajo de md). */
  rail: React.ReactNode;
  /** El mismo rail en variante 'drawer', para el cajón móvil. */
  railMovil: React.ReactNode;
  current: ModuleKey | null;
  titulo?: string;
  user: UserInfo | null;
  children: React.ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      {rail}

      <Drawer
        open={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        // Cerrar al navegar: si no, el cajón tapa la pantalla recién abierta.
        onClick={() => setMenuAbierto(false)}
        sx={{ display: { md: 'none' } }}
        slotProps={{ paper: { sx: { border: 'none' } } }}
      >
        {railMovil}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <ModuleHeader
          current={current}
          titulo={titulo}
          user={user}
          onAbrirMenu={() => setMenuAbierto(true)}
        />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
