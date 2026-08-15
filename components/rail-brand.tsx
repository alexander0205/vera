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
import { Isotipo } from '@/lib/marca/isotipo';

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
      {/* El isotipo suelto en blanco, no el cuadro de la app.
          `zero-app-blanco.svg` es el ícono de aplicación: un cuadro blanco con
          el símbolo recortado dentro. Sobre el azul del rail eso metía una
          pastilla blanca que competía con el nombre; el símbolo a secas se
          integra y deja que la marca la lleve el texto.

          Componente y no <img>: los trazos vienen inline, así que toma el
          color por prop y no hay una petición más para 2 KB de SVG. */}
      {/* 36 y no 26: el símbolo trae aire dentro de su lienzo, así que la
          tinta ocupa bastante menos que la caja. Al mismo número que el cuadro
          que había antes se veía enclenque. Con 36 el trazo queda del alto de
          las mayúsculas y sigue holgado — el texto más largo mide ~172px y en
          el rail hay 224 para los dos. */}
      <Box sx={{ display: 'flex', flexShrink: 0 }} aria-hidden>
        <Isotipo size={36} color="#ffffff" />
      </Box>
      {/* nav-text: el rail lo oculta cuando está colapsado a solo iconos. */}
      {/* Del alto del isotipo, o lo más cerca que permite el ancho.
          Una mayúscula ocupa en vertical ~0,7 de su cuerpo, así que igualar
          los 26px del cuadro pediría una letra de casi 37 — y «ZERO COLEGIOS»
          a ese tamaño mide 340px en un rail de 264. Se sube hasta 20px, que es
          el máximo con el que el nombre más largo entra, y el isotipo baja de
          28 a 26 para cerrar la diferencia por el otro lado.

          Igual en los cuatro módulos, calculado sobre el más largo: si a
          colegios se le encogiera la letra, la marca cambiaría de tamaño al
          saltar de módulo, que es justo la sensación de «el nav cambia» que se
          quiso quitar. */}
      <Typography
        className="nav-text"
        sx={{
          flex: 1, minWidth: 0,
          color: '#fff', fontWeight: 800, fontSize: '1.25rem',
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase', letterSpacing: '0.03em',
          lineHeight: 1, whiteSpace: 'nowrap',
        }}
      >
        {MARCA[modulo] ?? 'Zero'}
      </Typography>
    </Box>
  );
}
