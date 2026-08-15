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

/**
 * Por debajo de este ancho, la cabecera enseña el ícono en vez del logotipo.
 *
 * Abierta mide ~230px y cerrada ~34, así que 120 separa los dos casos con
 * holgura de sobra por los dos lados.
 */
const UMBRAL = 120;

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

export function RailBrand({ modulo: _modulo }: { modulo: ModuleKey }) {
  return (
    <Box
      sx={{
        height: ALTO_HEADER,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        overflow: 'hidden',

        /**
         * Consulta de CONTENEDOR, no de ventana.
         *
         * Cuál de los dos se ve depende de si el rail está abierto, y ese dato
         * vive en cada uno de los cuatro raíles, no aquí. Se podía pedir por
         * props o añadir una clase inversa a `.nav-text` en los cuatro
         * archivos; las dos formas obligan a tocar código ajeno y a que nadie
         * se olvide de mantenerlo sincronizado.
         *
         * Esta caja mide lo que mide el rail. Declarándola contenedor, sus
         * hijos responden a su ancho y la decisión se queda entera aquí
         * dentro. Si mañana aparece un quinto rail, funciona sin tocarlo.
         *
         * El alineado va en el HIJO y no aquí porque un contenedor no puede
         * consultarse a sí mismo: la regla que centra tiene que aplicarse a
         * algo que esté por debajo del que se mide.
         */
        containerType: 'inline-size',
      }}
    >
      <Box
        sx={{
          // Alto completo del bloque: es lo que centra la marca en vertical
          // sin depender de un relleno que habría que recalcular cada vez que
          // cambia el tamaño del logo.
          height: '100%',
          display: 'flex', alignItems: 'center',

          // ── Por defecto, el rail CERRADO ──────────────────────────────────
          //
          // La regla base describe el estado estrecho y la consulta añade el
          // ancho, no al revés. Escrito al derecho —relleno de 26 en la base y
          // `pl: 0` dentro de la consulta— el centrado depende de que un
          // override llegue a cero, y basta con que algo herede unos píxeles
          // para que el símbolo se vaya a un lado dentro de un rail donde solo
          // sobran 8. Así el caso delicado es el que no necesita deshacer nada.
          justifyContent: 'center',
          px: 0,
          '& .marca-abierta': { display: 'none' },
          '& .marca-cerrada': { display: 'block' },

          // ── Rail ABIERTO ──────────────────────────────────────────────────
          // 26px a la izquierda, que es donde empiezan los iconos del menú: la
          // lista lleva `px: 1.5` (12) y cada item `px: 1.75` (14). Sin ese
          // número el logo arranca pegado al borde y se ve desalineado con
          // todo lo de abajo.
          [`@container (min-width: ${UMBRAL + 1}px)`]: {
            justifyContent: 'flex-start',
            pl: '26px', pr: 1,
            '& .marca-abierta': { display: 'block' },
            '& .marca-cerrada': { display: 'none' },
          },
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
