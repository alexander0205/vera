'use client';

/**
 * RailBrand — cabecera del rail de navegación, igual en los 4 módulos.
 *
 * Antes cada rail dibujaba su propia versión: mismo layout, pero cada uno con
 * su ícono (Store / GraduationCap / Building2 / "z") y su sub-rótulo. Como el
 * rail está pegado al header, se leía como una sola barra con cuatro marcas
 * distintas — el usuario notaba que "el nav cambia" al moverse entre módulos.
 *
 * Ahora van los archivos de marca, no reconstrucciones:
 *
 *   · rail abierto  → el logotipo horizontal en blanco
 *   · rail cerrado  → el ícono de aplicación (cuadro azul con el símbolo)
 *
 * Por aquí pasaron antes el nombre interno del módulo —«GOBERNANZA DE
 * COLEGIOS», que ni cabía—, el de la línea comercial, y el símbolo con la
 * palabra «ZERO» escrita al lado en un Typography. Ese último era un logo
 * rehecho a mano, y por eso costó tres intentos cuadrar sus proporciones: el
 * símbolo trae aire dentro de su lienzo y las mayúsculas de Sora miden 0,771
 * del cuerpo. El archivo de marca ya trae todo eso resuelto.
 *
 * `modulo` se queda en las props aunque ya no se pinte: los cuatro rails lo
 * pasan, y quitarlo obliga a tocar los cuatro para no ganar nada.
 */

import Box from '@mui/material/Box';
import { type ModuleKey } from '@/lib/config/modules';
import { LogoZero } from '@/components/marca-zero';
import { Isotipo } from '@/lib/marca/isotipo';
// Del archivo suelto y no del barril `@/components/rail`: ese reexporta
// RailArmazon, que importa este archivo, y el ciclo rompe el build.
import { ANCHO_RAIL } from '@/components/rail/estilos';

/**
 * Alto del bloque de marca. Tiene que ser EXACTAMENTE el del header.
 *
 * El rail y la barra superior se tocan en la esquina, así que sus dos líneas
 * inferiores se leen como una sola. Con el alto dependiendo del contenido, el
 * bloque medía una cosa con el logotipo y otra con el símbolo — la marca
 * saltaba al plegar el menú y la línea nunca cuadraba con la del header.
 *
 * 56 sale de `components/module-header.tsx` (`height: 56, minHeight: 56` en su
 * Toolbar). Si allí cambia, aquí también.
 */
const ALTO_HEADER = 56;

/**
 * Que el símbolo mida LO MISMO abierto y cerrado, para que plegar el menú no
 * se sienta como un salto.
 *
 * Los dos archivos encuadran distinto, y es la única razón de que los números
 * no coincidan. Medido en el navegador:
 *
 *  · En `zero-horizontal-*.svg` el símbolo llena TODO el alto del lienzo
 *    (proporción 1,0). Un `alto` de 24 dibuja un símbolo de 24.
 *  · En el `Isotipo` suelto la tinta es solo 0,40 de su caja. Un `size` de 24
 *    dibujaría un símbolo de 9,6 — menos de la mitad.
 *
 * De ahí el factor 2,5. Si algún día se recorta el margen del isotipo, este
 * número deja de valer y hay que volver a medirlo.
 */
const ALTO_MARCA = 24;
const LADO_ISOTIPO = ALTO_MARCA * 2.5;

/**
 * La sangría del logotipo abierto, para que el símbolo NO SE MUEVA al plegar.
 *
 * Antes iba a 26px, alineado con los iconos del menú. Pero el símbolo mide
 * 42,7 de ancho (24 de alto por la proporción 305,6/171,8 del lazo), así que
 * a 26 termina en 68,7 — justo fuera de los 68 del rail plegado. Nunca podían
 * coincidir: al plegar, el símbolo tenía que saltar hacia dentro.
 *
 * Centrado en la columna arranca en (68 − 42,7) / 2 = 12,6, y esa es la ÚNICA
 * x donde cabe entero y es la misma en los dos estados. Poniéndola también en
 * el logotipo abierto, plegar deja de mover nada: el símbolo se queda donde
 * está y lo único que pasa es que la palabra «zero» se descubre a su lado.
 *
 * El precio es que la marca ya no arranca en la misma vertical que los iconos
 * de abajo. Es deliberado: entre alinear con los iconos —que se nota mirando
 * fijo— y que el logo salte cada vez que se abre el menú —que se nota siempre—,
 * gana lo segundo. Calculado y no escrito a mano para que siga siendo cierto
 * si cambia `ALTO_MARCA`.
 */
const PROPORCION_SIMBOLO = 305.6 / 171.8;
const ANCHO_SIMBOLO = ALTO_MARCA * PROPORCION_SIMBOLO;
export const SANGRIA_MARCA = (ANCHO_RAIL - ANCHO_SIMBOLO) / 2;

export function RailBrand({ modulo: _modulo }: { modulo: ModuleKey }) {
  return (
    <Box
      sx={{
        height: ALTO_HEADER,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/**
       * Aquí se describe SOLO el rail abierto. Quién decide lo contrario es
       * `RailArmazon`, por la clase `marca-caja`, igual que ya hace con
       * `.nav-text` y `.nav-children`.
       *
       * Esto empezó como una consulta de contenedor sobre esta misma caja, y
       * no podía funcionar: el contenido del rail mide SIEMPRE los 264 del
       * estado abierto y es la caja de fuera la que recorta a 68 —está escrito
       * en la cabecera de `RailArmazon`—, así que la consulta leía 264 tanto
       * plegado como desplegado. Siempre ganaba el logotipo horizontal, y el
       * recorte a 68 dejaba a la vista el trozo del medio: el símbolo cortado
       * que se veía en el rail cerrado.
       *
       * La lección es que el ancho aquí no es un dato: hay que preguntárselo a
       * quien recorta.
       */}
      <Box
        className="marca-caja"
        sx={{
          // Alto completo del bloque: es lo que centra la marca en vertical
          // sin depender de un relleno que habría que recalcular cada vez que
          // cambia el tamaño del logo.
          height: '100%',
          display: 'flex', alignItems: 'center',

          // La sangría sale calculada (ver SANGRIA_MARCA): es la x donde el
          // símbolo queda centrado en la columna plegada, y por eso es la única
          // que sirve también aquí sin que la marca salte al plegar.
          justifyContent: 'flex-start',
          pl: `${SANGRIA_MARCA}px`, pr: 1,
          '& .marca-abierta': { display: 'block' },
          '& .marca-cerrada': { display: 'none' },
        }}
      >
        {/* Abierto: el logotipo horizontal en blanco sobre el azul del rail. */}
        <LogoZero tono="blanco" alto={ALTO_MARCA} className="marca-abierta" />

        {/* Cerrado: el símbolo suelto, sin el cuadro del ícono de aplicación —
            sobre el azul, aquella pastilla blanca pesaba más que los iconos del
            menú que tiene debajo. El Box es porque `Isotipo` no acepta
            className; `lineHeight: 0` evita el hueco que el SVG deja debajo al
            comportarse como texto. */}
        <Box className="marca-cerrada" sx={{ lineHeight: 0 }}>
          <Isotipo size={LADO_ISOTIPO} color="#ffffff" />
        </Box>
      </Box>
    </Box>
  );
}
