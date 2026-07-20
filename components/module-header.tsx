'use client';

/**
 * ModuleHeader — barra superior de los módulos que NO son Facturación.
 *
 * Facturación arma su header dentro de su propio layout (lleva selector de
 * empresa, badge de DGII, turno de caja…). Administración Escolar y
 * Administración no tenían ninguno: se entraba y no había ni cambio de módulo,
 * ni buscador, ni avatar. Este header da esa base común, sin el selector de
 * empresa — dentro de un módulo ya se trabaja sobre la empresa activa.
 */

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { Menu as MenuIcon, Search } from 'lucide-react';
import { GlobalSearch } from '@/components/global-search';
import { ModuleSwitcher } from '@/components/module-switcher';
import { ProfileDropdown, type UserInfo } from '@/components/profile-dropdown';
import type { ModuleKey } from '@/lib/config/modules';

export function ModuleHeader({
  current,
  titulo,
  user,
  onAbrirMenu,
}: {
  /** Módulo en el que estamos: marca el activo en el switcher. */
  current: ModuleKey | null;
  /** Nombre del área cuando no es un módulo del catálogo (p. ej. Administración). */
  titulo?: string;
  user: UserInfo | null;
  /** Abre el cajón de navegación. Solo se muestra por debajo de md. */
  onAbrirMenu?: () => void;
}) {
  return (
    <>
      <GlobalSearch />
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor:      '#ffffff',
          color:        'text.primary',
          borderBottom: '1px solid #e5e7eb',
          height:       56,
          flexShrink:   0,
          zIndex:       30,
        }}
      >
        <Toolbar variant="dense" sx={{ height: 56, minHeight: 56, gap: 1, px: { xs: 1.5, sm: 2 } }}>
          {onAbrirMenu && (
            <IconButton
              onClick={onAbrirMenu}
              size="small"
              aria-label="Abrir menú"
              sx={{ display: { md: 'none' }, color: 'text.secondary' }}
            >
              <MenuIcon style={{ width: 20, height: 20 }} />
            </IconButton>
          )}

          {titulo && (
            <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'text.primary' }}>
              {titulo}
            </Typography>
          )}

          <ModuleSwitcher current={current} />

          <Box sx={{ flex: 1 }} />

          <Box
            component="button"
            onClick={() => document.querySelector<HTMLButtonElement>('#global-search-trigger')?.click()}
            sx={{
              display:      { xs: 'none', sm: 'flex' },
              alignItems:   'center',
              gap:          1,
              fontSize:     '0.875rem',
              color:        'text.secondary',
              px:           1.25,
              py:           0.75,
              borderRadius: '8px',
              bgcolor:      'transparent',
              border:       'none',
              cursor:       'pointer',
              transition:   'all 0.15s',
              '&:hover':    { bgcolor: 'grey.50', color: 'text.primary' },
            }}
          >
            <Search style={{ width: 16, height: 16 }} />
            <Box component="span" sx={{ display: { xs: 'none', md: 'block' } }}>Buscar</Box>
            <Box
              component="kbd"
              sx={{
                display:      { xs: 'none', md: 'block' },
                fontSize:     '0.6875rem',
                bgcolor:      'grey.100',
                borderRadius: '4px',
                px:           0.75,
                py:           0.25,
                fontFamily:   'monospace',
              }}
            >
              ⌘K
            </Box>
          </Box>

          <ProfileDropdown user={user} />
        </Toolbar>
      </AppBar>
    </>
  );
}
