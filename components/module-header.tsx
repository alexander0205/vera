'use client';

/**
 * ModuleHeader — la ÚNICA barra superior del sistema.
 *
 * Antes había tres distintas: Facturación armaba la suya dentro de su layout
 * (con selector de empresa, badge DGII y turno de caja), Escolar y
 * Administración usaban una versión recortada, y el POS no tenía ninguna — no
 * se podía cambiar de empresa ni llegar al perfil desde ahí. Ahora los cuatro
 * módulos montan esta misma.
 *
 * Se alimenta sola (SWR a /api/user y /api/empresa/list)
 * en vez de recibir todo por props: SWR deduplica por clave, así que aunque el
 * layout de Facturación pida los mismos datos para su sidebar, la red se toca
 * una sola vez. Cada módulo solo dice cuál es.
 */

import useSWR from 'swr';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Menu as MenuIcon, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { GlobalSearch } from '@/components/global-search';
import { ModuleSwitcher } from '@/components/module-switcher';
import { CompanySwitcher } from '@/components/company-switcher';
import { TurnoCountdown } from '@/components/caja/TurnoCountdown';
import { ProfileDropdown, type UserInfo } from '@/components/profile-dropdown';
import type { ModuleKey } from '@/lib/config/modules';
import type { Team } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null));

export function ModuleHeader({
  current,
  titulo,
  user: userProp,
  onAbrirMenu,
  onFijarMenu,
  menuFijo,
  onSwitchEmpresa,
  breakpointMenu = 'md',
}: {
  /** Módulo en el que estamos: marca el activo en el switcher. */
  current: ModuleKey | null;
  /** Nombre del área cuando no es un módulo del catálogo. */
  titulo?: string;
  /** Usuario ya resuelto en el servidor. Si no viene, se pide por SWR. */
  user?: UserInfo | null;
  /** Abre el cajón de navegación. Solo se muestra por debajo de md. */
  onAbrirMenu?: () => void;
  /**
   * Fija o suelta el menú lateral. Suelto = rail de iconos que se expande al
   * pasar el mouse; fijo = abierto todo el tiempo. La preferencia se guarda y
   * vale para los 4 módulos (lib/hooks/useNavFijo).
   */
  onFijarMenu?: () => void;
  menuFijo?: boolean;
  /** Aviso de cambio de empresa, para estado optimista del que lo necesite. */
  onSwitchEmpresa?: (teamId: number) => void;
  /**
   * A partir de qué ancho se oculta la hamburguesa. Tiene que coincidir con el
   * breakpoint en que el módulo esconde su rail, o queda una franja donde el
   * botón aparece pero el cajón no abre nada. ModuleShell esconde en `md`;
   * Facturación esconde su sidebar en `lg`.
   */
  breakpointMenu?: 'md' | 'lg';
}) {
  const { data: userSwr } = useSWR<UserInfo | null>('/api/user', fetcher, {
    revalidateOnFocus: false, revalidateOnReconnect: false,
  });
  const { data: empresaData, mutate: mutateEmpresa } = useSWR<{
    teams?: Team[]; activeTeamId?: number | null;
  }>('/api/empresa/list', fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });

  const user = userProp ?? userSwr ?? null;
  const teams = empresaData?.teams ?? [];
  const activeTeamId = empresaData?.activeTeamId ?? teams[0]?.id ?? null;
  // El contador de turno no debe ni consultar si la empresa no tiene caja.
  const cajaHabilitada = (teams.find(t => t.id === activeTeamId) ?? teams[0])?.cajaHabilitada ?? false;

  function handleSwitch(teamId: number) {
    mutateEmpresa();
    onSwitchEmpresa?.(teamId);
  }

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
          {/* Hamburguesa móvil */}
          {onAbrirMenu && (
            <IconButton
              onClick={onAbrirMenu}
              size="small"
              aria-label="Abrir menú"
              sx={{ display: { [breakpointMenu]: 'none' }, color: 'text.secondary' }}
            >
              <MenuIcon style={{ width: 20, height: 20 }} />
            </IconButton>
          )}

          {/* Fijar / soltar el menú lateral (escritorio) */}
          {onFijarMenu && (
            <Tooltip title={menuFijo ? 'Soltar menú' : 'Fijar menú abierto'} placement="bottom">
              <IconButton
                onClick={onFijarMenu}
                size="small"
                aria-label={menuFijo ? 'Soltar menú' : 'Fijar menú abierto'}
                aria-pressed={!!menuFijo}
                sx={{ display: { xs: 'none', [breakpointMenu]: 'flex' }, color: menuFijo ? 'primary.main' : 'text.secondary' }}
              >
                {menuFijo
                  ? <PanelLeftClose style={{ width: 20, height: 20 }} />
                  : <PanelLeftOpen  style={{ width: 20, height: 20 }} />}
              </IconButton>
            </Tooltip>
          )}

          {/* Sin logotipo aquí: el rail ya lleva la marca justo al lado, y
              repetirla en la misma franja robaba sitio a lo que sí cambia —el
              título y la empresa. */}
          {titulo && (
            <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'text.primary' }}>
              {titulo}
            </Typography>
          )}

          <CompanySwitcher teams={teams} activeTeamId={activeTeamId} onSwitch={handleSwitch} />

          <ModuleSwitcher current={current} />

          {/* Turno de caja — solo cuando queda poco para el límite */}
          {cajaHabilitada && <TurnoCountdown />}

          <Box sx={{ flex: 1 }} />

          <Box
            component="button"
            onClick={() => document.querySelector<HTMLButtonElement>('#global-search-trigger')?.click()}
            aria-label="Buscar"
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
