'use client';

/**
 * La lista del menú lateral: secciones sueltas y secciones con desplegable,
 * ordenadas por uso. Es el mismo componente en los cuatro módulos — cada rail
 * solo aporta SUS secciones.
 *
 * Lo que resuelve aquí dentro, y por eso no se repite cuatro veces:
 *  · el orden por uso (useOrdenNav) y el conteo de visitas,
 *  · qué sección está activa y qué grupo se abre solo por eso,
 *  · la máquina de estados de los desplegables (useDesplegables).
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import { ChevronDown, Plus } from 'lucide-react';
import type { SxProps, Theme } from '@mui/material/styles';
import { useOrdenNav, registrarVisitaNav } from '@/lib/hooks/useOrdenNav';
import { CURVA_DESPLIEGUE, FUENTE_SECCION, TINTA } from './estilos';
import { useDesplegables } from './useDesplegables';
import type { RailItem, RailSeccion } from './tipos';

/** Marca de entidad compartida entre módulos (mismos productos, mismos
 *  contactos). Se pinta igual colgando de un grupo que en una sección suelta. */
function Compartido() {
  return (
    <Box
      component="span"
      className="nav-text"
      title="Compartido con Facturación — mismos productos y contactos en ambos módulos"
      sx={{
        flexShrink: 0, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase', px: 0.625, py: '1px', borderRadius: '4px',
        bgcolor: 'rgba(255,255,255,0.16)', color: 'rgba(224,231,253,0.95)',
      }}
    >
      Compartido
    </Box>
  );
}

/**
 * Una fila de sección que lleva a una pantalla. Se exporta suelta porque hay
 * enlaces que NO entran en la lista reordenable —el aviso de "Activar
 * facturación electrónica", clavado arriba— y tienen que verse idénticos.
 */
export function EnlaceSeccion({
  item,
  activo,
  onNavegar,
  tamanoIcono = 19,
  sx,
}: {
  item: RailItem;
  activo: boolean;
  onNavegar?: () => void;
  /** Los enlaces que van en letra más chica bajan también el icono. */
  tamanoIcono?: number;
  sx?: SxProps<Theme>;
}) {
  const Icono = item.icon;
  return (
    <Box
      component={Link}
      href={item.href}
      onClick={onNavegar}
      // En array porque `sx` puede llegar como objeto, array o función: lo de
      // después pisa a lo de antes y MUI se ocupa de fundirlo.
      sx={[
        {
          display:      'flex',
          alignItems:   'center',
          gap:          1.5,
          px:           1.75,
          py:           1.25,
          borderRadius: '10px',
          ...FUENTE_SECCION,
          lineHeight:   1.3,
          fontWeight:   activo ? 700 : 600,
          color:        activo ? TINTA.activa : TINTA.reposo,
          bgcolor:      activo ? 'rgba(255,255,255,0.22)' : 'transparent',
          boxShadow:    activo ? 'inset 0 0 0 1px rgba(255,255,255,0.16)' : 'none',
          textDecoration: 'none',
          overflow:     'hidden',
          transition:   'background-color 0.15s, color 0.15s',
          '&:hover':    { bgcolor: 'rgba(255,255,255,0.12)', color: TINTA.hover },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Icono style={{ width: tamanoIcono, height: tamanoIcono, flexShrink: 0 }} />
      <Box
        component="span"
        className="nav-text"
        sx={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {item.label}
      </Box>
      {item.shared && <Compartido />}
    </Box>
  );
}

export function RailSecciones({
  secciones,
  onNavegar,
  puedeVer,
}: {
  /** Las secciones EN SU ORDEN POR DEFECTO: el que ve quien entra por primera
   *  vez, y el que rompe los empates cuando dos se usan lo mismo. */
  secciones: RailSeccion[];
  /** Cerrar el cajón móvil al navegar. */
  onNavegar?: () => void;
  /** Gate del atajo "+" de un hijo. Sin él, todos los atajos se muestran. */
  puedeVer?: (href: string) => boolean;
}) {
  const pathname = usePathname();
  const esActiva = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  // El orden que se pinta sale del uso de los últimos días, no del orden en que
  // están escritas las secciones en cada rail.
  const lista = useOrdenNav(secciones.map(s => s.id))
    .map(id => secciones.find(s => s.id === id))
    .filter((s): s is RailSeccion => s !== undefined);

  // Sección donde estás ahora mismo. Sirve para dos cosas: abrir su grupo sin
  // que haya que pedirlo, y sumarle la visita que alimenta el orden por uso.
  const seccionActual = lista.find(s =>
    s.tipo === 'grupo'
      ? s.children.some(c => pathname.startsWith(c.href))
      : esActiva(s.href, s.exact),
  ) ?? null;
  const grupoActivo = seccionActual?.tipo === 'grupo' ? seccionActual.id : null;

  const idSeccionActual = seccionActual?.id ?? null;
  useEffect(() => {
    if (idSeccionActual) registrarVisitaNav(idSeccionActual);
  }, [idSeccionActual]);

  const { grupoAbierto, duracion, alternar, handlersPuntero } = useDesplegables(grupoActivo);

  return (
    <>
      {lista.map(seccion => {
        if (seccion.tipo === 'item') {
          return (
            <EnlaceSeccion
              key={seccion.id}
              item={seccion}
              activo={esActiva(seccion.href, seccion.exact)}
              onNavegar={onNavegar}
            />
          );
        }

        const grupo       = seccion;
        const grupoEnRuta = grupo.children.some(c => pathname.startsWith(c.href));
        const abierto     = grupoAbierto === grupo.id;
        const idPanel     = `nav-grupo-${grupo.id}`;
        const Icono       = grupo.icon;

        return (
          <Box key={grupo.id} {...handlersPuntero(grupo.id)}>
            <Box
              component="button"
              data-cabecera-grupo
              aria-expanded={abierto}
              aria-controls={idPanel}
              onClick={() => alternar(grupo.id)}
              sx={{
                display:      'flex',
                alignItems:   'center',
                gap:          1.5,
                width:        '100%',
                px:           1.75,
                py:           1.25,
                borderRadius: '10px',
                ...FUENTE_SECCION,
                lineHeight:   1.3,
                fontWeight:   grupoEnRuta ? 700 : 600,
                color:        grupoEnRuta || abierto ? TINTA.activa : TINTA.reposo,
                bgcolor:      grupoEnRuta ? 'rgba(255,255,255,0.16)' : 'transparent',
                border:       'none',
                cursor:       'pointer',
                transition:   'background-color 0.15s, color 0.15s',
                '&:hover':    { bgcolor: 'rgba(255,255,255,0.12)', color: TINTA.hover },
              }}
            >
              <Icono style={{ width: 19, height: 19, flexShrink: 0 }} />
              <Box component="span" className="nav-text" sx={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{grupo.label}</Box>
              <Box
                component="span"
                className="nav-text"
                sx={{
                  display: 'flex', opacity: 0.65,
                  transform: abierto ? 'rotate(0deg)' : 'rotate(-90deg)',
                  // Misma duración y misma curva que la altura del submenú:
                  // si giran a distinto ritmo se nota enseguida.
                  transition: `transform ${duracion}ms ${CURVA_DESPLIEGUE}`,
                }}
              >
                <ChevronDown style={{ width: 15, height: 15 }} />
              </Box>
            </Box>

            <Collapse className="nav-children" in={abierto} timeout={duracion} easing={CURVA_DESPLIEGUE}>
              <Box id={idPanel} sx={{ ml: 3, pl: 1, borderLeft: '1px solid rgba(255,255,255,0.18)', mt: 0.25, mb: 0.5 }}>
                {grupo.children.map(hijo => {
                  const activo = pathname.startsWith(hijo.href);
                  return (
                    <Box
                      key={hijo.href}
                      sx={{ display: 'flex', alignItems: 'center', '&:hover .plus-btn': { opacity: 1 } }}
                    >
                      <Box
                        component={Link}
                        href={hijo.href}
                        onClick={onNavegar}
                        sx={{
                          flex:         1,
                          minWidth:     0,
                          py:           1,
                          px:           1.5,
                          borderRadius: '8px',
                          fontSize:     '0.8125rem',
                          lineHeight:   1.35,
                          fontWeight:   activo ? 700 : 500,
                          color:        activo ? TINTA.activa : TINTA.reposo,
                          bgcolor:      activo ? 'rgba(255,255,255,0.18)' : 'transparent',
                          textDecoration: 'none',
                          transition:   'all 0.15s',
                          whiteSpace:   'nowrap',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          display:      'flex',
                          alignItems:   'center',
                          gap:          0.75,
                          '&:hover':    { color: TINTA.hover, bgcolor: 'rgba(255,255,255,0.08)' },
                        }}
                      >
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{hijo.label}</Box>
                        {hijo.shared && <Compartido />}
                      </Box>
                      {hijo.plusHref && (puedeVer?.(hijo.plusHref) ?? true) && (
                        <Box
                          component={Link}
                          href={hijo.plusHref}
                          onClick={onNavegar}
                          className="plus-btn"
                          title="Nuevo"
                          sx={{
                            opacity:      0,
                            p:            0.5,
                            borderRadius: '4px',
                            color:        TINTA.tenue,
                            transition:   'all 0.15s',
                            display:      'flex',
                            '&:hover':    { bgcolor: 'rgba(255,255,255,0.2)', color: TINTA.activa },
                          }}
                        >
                          <Plus style={{ width: 12, height: 12 }} />
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </>
  );
}
