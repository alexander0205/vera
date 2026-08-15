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

import { useState } from 'react';
import useSWR from 'swr';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { GlobalSearch, MS_FOCO } from '@/components/global-search';
import { ModuleSwitcher } from '@/components/module-switcher';
import { LoaderLlegada } from '@/components/loader-llegada';
import { CompanySwitcher } from '@/components/company-switcher';
import { TurnoCountdown } from '@/components/caja/TurnoCountdown';
import { ProfileDropdown, type UserInfo } from '@/components/profile-dropdown';
import type { ModuleKey } from '@/lib/config/modules';
import type { Team } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null));

/**
 * MODO FOCO — props de un bloque que se aparta mientras el buscador está abierto.
 *
 * Se anima `max-width` + `opacity` en vez de sacar el bloque del DOM: si se
 * desmonta, la barra da un salto seco y el campo aparece de golpe en vez de
 * crecer. Animando, el hueco que dejan los vecinos ES el que gana el campo, y
 * las dos cosas se leen como un solo movimiento.
 *
 * `inert` (React 19) saca del orden de tabulación TODO lo que hay dentro, no
 * solo el contenedor: tabulando desde el buscador el foco se iba a un
 * conmutador de empresa invisible y no había forma de saber dónde estabas.
 * `aria-hidden` hace lo propio con el lector de pantalla.
 *
 * El margen negativo come el `gap` de la barra: sin él, un bloque de ancho cero
 * seguía dejando su separación y quedaban ocho píxeles de aire por cada uno.
 *
 * @param anchoMax  Tope al que vuelve el bloque al cerrar. Solo tiene que ser
 *                  mayor que su contenido real: el ancho de verdad lo pone el
 *                  contenido, esto solo destapa o tapa el hueco.
 * @param encogible Si en móvil puede ceder ancho. El bloque de empresa+módulos
 *                  mide 424 px y a 375 desbordaba la barra entera —el icono de
 *                  buscar y el avatar se salían de la pantalla—; el avatar, en
 *                  cambio, son 40 px que no se tocan.
 */
function apartar(oculto: boolean, anchoMax: number, encogible = false) {
  return {
    'aria-hidden': oculto || undefined,
    inert: oculto || undefined,
    sx: {
      display:       'flex',
      alignItems:    'center',
      gap:           1,
      minWidth:      0,
      flexShrink:    encogible ? { xs: 1, sm: 0 } : 0,
      // Que el apretón lo repartan los de dentro. Sin esto, el conmutador de
      // empresa se planta en su ancho natural, el de módulos se le monta
      // encima y el recorte del bloque parte la palabra por la mitad.
      ...(encogible ? { '& > *': { minWidth: 0 } } : {}),
      overflow:      'hidden',
      whiteSpace:    'nowrap',
      opacity:       oculto ? 0 : 1,
      maxWidth:      oculto ? 0 : anchoMax,
      ml:            oculto ? -1 : 0,
      pointerEvents: oculto ? 'none' : 'auto',
      transition:    `opacity ${MS_FOCO}ms ease, max-width ${MS_FOCO}ms ease, margin-left ${MS_FOCO}ms ease`,
      // Quien pidió que no le muevan la pantalla: aparece y desaparece, sin viaje.
      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
    },
  } as const;
}

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
  const { data: userSwr, isLoading: userCargando } = useSWR<UserInfo | null>('/api/user', fetcher, {
    revalidateOnFocus: false, revalidateOnReconnect: false,
  });
  const { data: empresaData, isLoading: empresaCargando, mutate: mutateEmpresa } = useSWR<{
    teams?: Team[]; activeTeamId?: number | null;
  }>('/api/empresa/list', fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });

  // Modo foco: mientras el buscador está abierto, la barra se aparta para él.
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);

  const user = userProp ?? userSwr ?? null;
  // `userProp` llega ya resuelto (o `null` mientras carga) desde el layout que
  // monta el header, así que no sirve para saber si terminó de cargar: se usa
  // el propio isLoading de este hook, que SWR deduplica con el del layout.
  const datosListos = !userCargando && !empresaCargando;
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
      {/* Sostiene el loader un momento tras aterrizar de otro módulo, para que
          no se vea la pantalla montarse a pedazos. */}
      <LoaderLlegada datosListos={datosListos} />
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
          {/*
            Bloque izquierdo, agrupado y sin encoger… de `sm` para arriba.

            Suelto en la barra, cada pieza era un item de flex encogible: al
            darle al buscador un hueco elástico, el navegador repartía la falta
            de sitio entre TODOS y el conmutador de empresa acababa recortado a
            media palabra. Agrupado y sin encoger, quien cede cuando no hay
            sitio es siempre el centro.

            Aquí van solo la hamburguesa, el fijar-menú y el título: cuatro
            docenas de píxeles que nunca ceden. Lo que sí cede en móvil es el
            bloque de empresa+módulos que va justo detrás.
          */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexShrink: 0 }}>
          {/*
            La hamburguesa y el fijar-menú NO se apartan en modo foco: son la
            única forma de abrir la navegación en móvil, y esconder la salida
            del menú mientras se busca deja al usuario sin por dónde salir.
          */}
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
          </Box>

          {/* Modo foco: empresa, módulos y turno se apartan mientras se busca. */}
          <Box {...apartar(buscadorAbierto, 560, true)}>
            <CompanySwitcher teams={teams} activeTeamId={activeTeamId} onSwitch={handleSwitch} />

            <ModuleSwitcher current={current} />

            {/* Turno de caja — solo cuando queda poco para el límite */}
            {cajaHabilitada && <TurnoCountdown />}
          </Box>

          {/*
            El buscador, en medio y no en la esquina.

            Este hueco se come TODO lo que queda entre el bloque de la izquierda
            y el perfil, y el campo lo llena hasta su tope (ANCHO_BUSCADOR en
            components/global-search.tsx). No se centra contra la ventana con
            posición absoluta a propósito: el bloque de la izquierda cambia de
            ancho según el módulo (título + empresa + módulos + turno de caja) y
            a 1024 px se solaparían.

            `minWidth: 0` es lo que le permite encogerse en pantallas estrechas
            en vez de empujar al conmutador de empresa fuera de la barra: es el
            primero de la barra en ceder.

            En `xs` deja de ser elástico: ahí dentro no hay un campo sino un
            icono de 34 px, y con `flex: 1` el hueco se comía todo el sobrante y
            luego lo devolvía aplastado a cero, dejando el icono fuera de la
            pantalla. Ancho de su contenido y pegado a la derecha con `ml: auto`.
          */}
          <Box sx={{
            flex: { xs: '0 0 auto', sm: 1 },
            minWidth: 0,
            ml: { xs: 'auto', sm: 0 },
            display: 'flex',
            justifyContent: 'center',
            px: { xs: 0, sm: 1 },
          }}>
            {/* `current` y no la URL: en los subdominios el proxy sirve la portada
                por rewrite y la ruta es `/`, así que deducirlo de ahí caía
                siempre a facturación. */}
            <GlobalSearch modulo={current ?? undefined} onAbiertoChange={setBuscadorAbierto} />
          </Box>

          <Box {...apartar(buscadorAbierto, 56)}>
            <ProfileDropdown user={user} />
          </Box>
        </Toolbar>
      </AppBar>
    </>
  );
}
