'use client';

/**
 * RailBrand — cabecera del rail de navegación, igual en los 4 módulos.
 *
 * Antes cada rail dibujaba su propia versión: mismo layout, pero cada uno con
 * su ícono (Store / GraduationCap / Building2 / "z") y su sub-rótulo. Como el
 * rail está pegado al header, se leía como una sola barra con cuatro marcas
 * distintas — el usuario notaba que "el nav cambia" al moverse entre módulos.
 *
 * Ahora la marca es una sola: el isotipo y el nombre de la LÍNEA.
 *
 * Antes debajo de «Zero» iba el nombre interno del módulo, y eso se rompía:
 * «GOBERNANZA DE COLEGIOS» en mayúsculas y con `nowrap` no cabe en el rail y
 * se desbordaba. Los módulos de nombre corto disimulaban el fallo; el largo lo
 * destapó.
 *
 * La línea comercial resuelve las dos cosas a la vez. Es lo que el cliente
 * compró —«Zero Colegios», no «Gobernanza de Colegios», que es como lo
 * llamamos nosotros por dentro— y todas caben en una sola línea.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { type ModuleKey } from '@/lib/config/modules';

/**
 * De módulo a línea comercial.
 *
 * `administracion` cae en «Zero» a secas: lo tienen todas las empresas, no es
 * una línea que nadie contrate aparte, y ponerle un nombre propio sugeriría
 * que se vende suelto.
 */
const MARCA: Record<string, string> = {
  facturacion:    'Zero ERP',
  pos:            'Zero POS',
  escolar:        'Zero Colegios',
  administracion: 'Zero',
};

export function RailBrand({ modulo }: { modulo: ModuleKey }) {
  return (
    <Box
      sx={{
        px: 2, py: 2,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: 1,
        flexShrink: 0,
      }}
    >
      {/* El isotipo va sobre el azul del rail, así que se usa la versión blanca. */}
      <Box
        component="img"
        src="/marca/zero-app-blanco.svg"
        alt=""
        aria-hidden
        sx={{ width: 28, height: 28, borderRadius: '8px', flexShrink: 0 }}
      />
      {/* nav-text: el rail lo oculta cuando está colapsado a solo iconos. */}
      {/* En mayúsculas y ocupando el ancho que queda.
          El tamaño está calculado para que quepa «ZERO COLEGIOS», que es el
          más largo de los cuatro: así los cuatro módulos se ven exactamente
          igual de fuertes. Encogerle la letra solo a colegios habría hecho que
          la marca cambiara de tamaño al saltar de módulo, que es justo lo que
          se sentía como «el nav cambia». */}
      <Typography
        className="nav-text"
        sx={{
          flex: 1, minWidth: 0,
          color: '#fff', fontWeight: 800, fontSize: '0.9375rem',
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          lineHeight: 1.1, whiteSpace: 'nowrap',
        }}
      >
        {MARCA[modulo] ?? 'Zero'}
      </Typography>
    </Box>
  );
}
