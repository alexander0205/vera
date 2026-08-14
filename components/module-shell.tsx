'use client';

/**
 * ModuleShell — armazón común de los módulos que no son Facturación.
 *
 * Junta rail + header + contenido, y sobre todo resuelve el móvil: el rail se
 * oculta por debajo de `lg`, así que sin esto la pantalla angosta se quedaba
 * SIN NINGUNA navegación — ni menú, ni forma de salir del módulo. Aquí el
 * mismo rail se reutiliza dentro de un Drawer que abre la hamburguesa del
 * header.
 *
 * El provider de "menú fijo" envuelve todo y el contenido lo consume desde
 * adentro: el rail y el header tienen que leer el MISMO estado, y el provider
 * debe estar por encima de ambos.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { ModuleHeader } from '@/components/module-header';
import { BannerSuscripcion } from '@/components/banner-suscripcion';
import { NavFijoProvider, useNavFijo } from '@/lib/hooks/useNavFijo';
import type { UserInfo } from '@/components/profile-dropdown';
import type { ModuleKey } from '@/lib/config/modules';

interface Props {
  /** Rail de escritorio (se oculta solo por debajo de lg). */
  rail: React.ReactNode;
  /** El mismo rail en variante 'drawer', para el cajón móvil. */
  railMovil: React.ReactNode;
  current: ModuleKey | null;
  titulo?: string;
  user: UserInfo | null;
  children: React.ReactNode;
}

export function ModuleShell(props: Props) {
  return (
    <NavFijoProvider>
      <ShellInterno {...props} />
    </NavFijoProvider>
  );
}

function ShellInterno({ rail, railMovil, current, titulo, user, children }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { fijo, alternar } = useNavFijo();

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      {rail}

      <Drawer
        open={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        // Cerrar al navegar: si no, el cajón tapa la pantalla recién abierta.
        onClick={() => setMenuAbierto(false)}
        sx={{ display: { lg: 'none' } }}
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
          breakpointMenu="lg"
          onFijarMenu={alternar}
          menuFijo={fijo}
        />
        {/* Fuera del área que hace scroll: un aviso de cobro que se pierde al
            bajar la página no sirve de nada. */}
        <BannerSuscripcion />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
