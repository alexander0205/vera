'use client';

/**
 * RailBrand — cabecera del rail de navegación, igual en los 4 módulos.
 *
 * Antes cada rail dibujaba su propia versión: mismo layout, pero cada uno con
 * su ícono (Store / GraduationCap / Building2 / "z") y su sub-rótulo. Como el
 * rail está pegado al header, se leía como una sola barra con cuatro marcas
 * distintas — el usuario notaba que "el nav cambia" al moverse entre módulos.
 *
 * Ahora la marca es UNA: el isotipo y «Zero». Nada más.
 *
 * Por aquí pasaron antes el nombre interno del módulo —«GOBERNANZA DE
 * COLEGIOS», que ni cabía— y luego el de la línea comercial —«ZERO ERP», «ZERO
 * COLEGIOS»—. Los dos sobran por el mismo motivo: el módulo en el que estás ya
 * está escrito a dos centímetros, en el conmutador del header. Repetirlo aquí
 * era decir dos veces lo mismo y, de paso, hacer que la marca cambiara de
 * ancho al saltar de módulo.
 *
 * `modulo` se queda en las props aunque ya no se pinte: los cuatro rails lo
 * pasan, y quitarlo obliga a tocar los cuatro para no ganar nada.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { type ModuleKey } from '@/lib/config/modules';
import { Isotipo } from '@/lib/marca/isotipo';

/**
 * Cuerpo de la letra y lado del isotipo.
 *
 * No son el mismo número a propósito. El símbolo trae aire dentro de su
 * lienzo: la tinta ocupa poco más de la mitad de la caja en vertical, así que
 * igualarlo al cuerpo de la letra lo dejaría visiblemente más bajo que las
 * mayúsculas. La proporción está puesta para que el trazo del símbolo y el
 * alto de la «Z» midan lo mismo EN PANTALLA, que es lo que se ve — no lo que
 * dice la hoja de estilos.
 *
 * Y son grandes a propósito. Con la marca pequeña, el bloque quedaba como un
 * logo suelto flotando en una banda vacía de 264px: sobraba más de la mitad
 * del ancho. Llenarlo del todo con la palabra «ZERO» pediría una letra de 60px
 * —peor todavía—, así que se sube hasta donde la marca se lee como cabecera y
 * no como adorno. El hueco que queda es el sitio natural del control de
 * plegar, que hoy vive en la barra de arriba.
 */
const CUERPO_TEXTO = 34;
const LADO_ISOTIPO = 44;

export function RailBrand({ modulo: _modulo }: { modulo: ModuleKey }) {
  return (
    <Box
      sx={{
        // Menos aire arriba y abajo: con la marca pequeña, el relleno de 16px
        // convertía la cabecera en una banda alta y medio vacía. Ahora manda
        // el alto de la marca.
        px: 2, py: 1.25,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: 1.25,
        flexShrink: 0,
      }}
    >
      {/* El isotipo suelto en blanco, no el cuadro de la app.
          `zero-app-blanco.svg` es el ícono de aplicación: un cuadro blanco con
          el símbolo recortado dentro. Sobre el azul del rail eso metía una
          pastilla blanca que competía con el nombre.

          Componente y no <img>: los trazos vienen inline, así que toma el
          color por prop y no hay una petición más para 2 KB de SVG. */}
      <Box sx={{ display: 'flex', flexShrink: 0 }} aria-hidden>
        <Isotipo size={LADO_ISOTIPO} color="#ffffff" />
      </Box>

      {/* nav-text: el rail lo oculta cuando está colapsado a solo iconos. */}
      <Typography
        className="nav-text"
        sx={{
          color: '#fff', fontWeight: 800, fontSize: `${CUERPO_TEXTO}px`,
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
          lineHeight: 1, whiteSpace: 'nowrap',
        }}
      >
        Zero
      </Typography>
    </Box>
  );
}
