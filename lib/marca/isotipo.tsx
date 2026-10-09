/**
 * Isotipo de Zero: el lazo infinito.
 *
 * Vive como componente y no como archivo suelto porque los íconos de la PWA se
 * generan en tiempo de build con `ImageResponse`, que necesita los trazos
 * inline — no puede leer un .svg del disco. Los mismos trazos sirven para
 * cualquier sitio donde haga falta la marca sin texto.
 */

/** Trazos del símbolo, en el lienzo original de 428.58. */
const TRAZOS = [
  'M114.35,267.04c21.21,12.97,49.45,10.99,68.29-5.3l7.42-7.32,17.23,17.42c-9.83,9.95-21.29,18.42-34.55,23.41-28.74,10.82-62.35,2.34-84.5-18.28-11.7-10.89-19.93-24.52-23.86-40.02-7.57-29.94,2-61.86,24.82-82.57,13.47-12.23,30.14-19.52,48.31-21.12,23.36-2.05,46.38,5.35,63.53,21.58l41.26,42.16,19.16,20.21-52.45-20.31-8.46-8.12-17.36-16.98c-3.22-3.15-6.9-5.5-10.87-7.59-21.51-11.32-47.93-8.07-66.18,7.99-13.48,11.86-20.45,29.25-19.55,47.3.97,19.36,10.99,37.3,27.74,47.54Z',
  'M171.9,182.53l66.81,67.06c17.19,20.85,46.2,27.38,70.75,16.18,14.48-6.94,25.01-19.67,29.83-35.01,7-22.28.95-46.66-16.33-62.43-17.96-16.39-44.52-19.87-66.25-9.05-6.61,3.59-12.15,8.07-17.37,13.66l-17.02-16.59c27.16-30.9,73.43-36.89,107.8-13.41,16.1,11,27.67,27.26,33.28,46.26,8.56,29.1.44,61.09-20.77,82.63-28.43,28.88-72.29,32.44-105.38,9.38-6.12-4.26-11.28-9.03-16.58-14.31l-40.35-40.16-27.62-27.23,16.97-17.17c.37-.37,1.58-.48,2.24.19Z',
  'M242.88,197.57l-41.67-42.59c-.55-.52-1.16-.96-1.72-1.46l-15.52,19.35,16.76,16.4,8.54,8.2,52.97,20.52-19.35-20.42Z',
  'M262.24,218.25l-15.89,16.99-37.59-15.24-36.9-37.53,41,15.16,46.51,17.93c1.39.32,2.19,1.02,2.87,2.7Z',
] as const;

const POLIGONO = '234.75 206.06 212.86 197.62 171.86 182.46 208.76 219.99 226.58 227.22 234.75 206.06';

export function Isotipo({ size = 512, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 428.58 428.58" xmlns="http://www.w3.org/2000/svg">
      {TRAZOS.map((d) => <path key={d.slice(0, 24)} d={d} fill={color} />)}
      <polygon points={POLIGONO} fill={color} />
    </svg>
  );
}

/**
 * El lazo SIN el aire del lienzo cuadrado.
 *
 * `Isotipo` dibuja el símbolo centrado en 428×428 porque de ahí salen los
 * íconos de la PWA, que necesitan ese margen. Puesto en línea dentro de un
 * titular o estirado de fondo, ese margen se ve como un hueco.
 *
 * El encuadre sale de MEDIR los trazos, no de copiar un número. Antes decía
 * 280 de ancho —tomado del manual— y con eso el lazo salía cortado por la
 * derecha: se le comían 26 unidades, el 8% del símbolo, y el lazo de la
 * derecha aparecía aplastado dentro de cualquier titular.
 *
 * `getBBox()` sobre los trazos reales da x 61,83 → 366,76 (304,93 de ancho) e
 * y 128,61 → 299,97 (171,36 de alto). Centrado exacto dentro del lienzo de
 * 428,58: los dos centros dan 214,29. Redondeado hacia fuera y manteniendo esa
 * simetría, con un pelo de aire para que el antialias no muerda el borde.
 *
 * Si algún día se rehace el símbolo, esto se vuelve a medir; no se estima.
 */
const ENCUADRE_LAZO = '61.5 128.4 305.6 171.8';
export const PROPORCION_LAZO = 305.6 / 171.8;

export function LazoZero({
  alto = 24,
  color = AZUL_ZERO,
  className,
  titulo,
}: {
  alto?: number;
  color?: string;
  className?: string;
  /** Texto accesible. Sin él el lazo es decorativo y se oculta del lector. */
  titulo?: string;
}) {
  return (
    <svg
      viewBox={ENCUADRE_LAZO}
      height={alto}
      width={alto * PROPORCION_LAZO}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
    >
      {titulo ? <title>{titulo}</title> : null}
      {TRAZOS.map((d) => <path key={d.slice(0, 24)} d={d} fill={color} />)}
      <polygon points={POLIGONO} fill={color} />
    </svg>
  );
}

/** Azul corporativo. Se repite aquí para que los generadores de íconos no dependan del CSS. */
export const AZUL_ZERO = '#3658e1';
