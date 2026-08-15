'use client';

/**
 * El armazón del menú lateral: marca arriba, lista que hace scroll en medio,
 * salto a los otros módulos al final, y —si el módulo lo pasa— un pie.
 *
 * Es el mismo en los cuatro módulos, incluido cómo se pliega:
 *
 *  · variant 'rail'   → columna de 68px que se expande al pasar el mouse, salvo
 *    que la preferencia "menú fijo" (compartida por los cuatro) lo deje abierto.
 *  · variant 'drawer' → solo el contenido, siempre abierto: es lo que va dentro
 *    del cajón móvil, donde no hay mouse que pasar por encima.
 *
 * El contenido mide SIEMPRE el ancho abierto y es la caja de fuera la que
 * recorta: así el texto no se re-maqueta durante la animación, solo se descubre.
 */

import Box from '@mui/material/Box';
import { RailBrand } from '@/components/rail-brand';
import { RailModulos } from '@/components/rail-modulos';
import { useNavFijo } from '@/lib/hooks/useNavFijo';
import type { ModuleKey } from '@/lib/config/modules';
import { ANCHO_ABIERTO, ANCHO_RAIL, FONDO_RAIL } from './estilos';

export function RailArmazon({
  modulo,
  variant = 'rail',
  pie,
  children,
}: {
  modulo: ModuleKey;
  variant?: 'rail' | 'drawer';
  /** Bloque fijo bajo la lista (la versión de Facturación, por ejemplo). */
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { fijo } = useNavFijo();
  const abierto = variant === 'drawer' || fijo;

  const contenido = (
    <Box
      sx={{
        width:    ANCHO_ABIERTO,
        height:   '100%',
        display:  'flex',
        flexDirection: 'column',
        bgcolor:  FONDO_RAIL,
        overflow: 'hidden',
      }}
    >
      <RailBrand modulo={modulo} />

      <Box
        sx={{
          flex: 1, overflowY: 'auto', px: 1.5, py: 1.5,
          display: 'flex', flexDirection: 'column', gap: 0.25,
          // Sin esto los ítems se aplastan unos milímetros en cuanto la lista
          // no cabe, y con un desplegable abierto el menú entero se mueve
          // aunque no haya cambiado nada por encima. Que sobre → que scrollee.
          '& > *': { flexShrink: 0 },
        }}
      >
        {children}

        {/* Al final de la lista que hace scroll —no anclado al pie— y FUERA del
            orden por uso: es "irse a otro producto", no una sección más, así
            que se queda siempre en el mismo sitio. */}
        <RailModulos current={modulo} />
      </Box>

      {pie && (
        <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {pie}
        </Box>
      )}
    </Box>
  );

  // Cajón móvil: lo monta un <Drawer>, que ya pone la caja y el alto.
  if (variant === 'drawer') return contenido;

  return (
    <Box
      component="aside"
      sx={{
        width: abierto ? ANCHO_ABIERTO : ANCHO_RAIL,
        flexShrink: 0,
        height: '100%',
        display: { xs: 'none', lg: 'block' },
        position: 'relative',
      }}
    >
      <Box
        sx={{
          position:   'absolute',
          top:        0,
          left:       0,
          height:     '100%',
          width:      abierto ? ANCHO_ABIERTO : ANCHO_RAIL,
          overflow:   'hidden',
          zIndex:     40,
          transition: 'width 0.2s ease, box-shadow 0.2s ease',
          '& .nav-text':     { opacity: abierto ? 1 : 0, transition: 'opacity 0.12s ease' },
          '& .nav-children': { display: abierto ? 'block' : 'none' },
          ...(abierto ? {} : {
            '&:hover':               { width: ANCHO_ABIERTO, boxShadow: '6px 0 28px rgba(0,0,0,0.22)' },
            '&:hover .nav-text':     { opacity: 1 },
            '&:hover .nav-children': { display: 'block' },
          }),
        }}
      >
        {contenido}
      </Box>
    </Box>
  );
}
