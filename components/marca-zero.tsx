/**
 * La marca Zero, en sus dos formas.
 *
 * Existe para que el logotipo se dibuje igual en todas partes. Antes cada
 * pantalla resolvía la marca a su manera —un ícono de recibo aquí, una "z" en
 * un cuadro allá— y el resultado era que Zero se veía distinto según dónde
 * cayera el usuario.
 *
 * Los SVG viven en `public/marca` y se sirven como imagen; el isotipo de
 * `lib/marca/isotipo` es solo para los generadores de íconos, que necesitan los
 * trazos inline.
 */

type Tono = 'azul' | 'blanco';

/** Marca completa: símbolo + palabra. Para pantallas de entrada y cabeceras. */
export function LogoZero({
  tono = 'azul',
  alto = 32,
  className,
}: {
  tono?: Tono;
  alto?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/marca/zero-horizontal-${tono}.svg`}
      alt="Zero"
      height={alto}
      style={{ height: alto, width: 'auto' }}
      className={className}
    />
  );
}

/** Solo el símbolo, en su cuadro redondeado. Para avatares, raíles y pestañas. */
export function IsotipoZero({
  tono = 'azul',
  lado = 32,
  className,
}: {
  tono?: Tono;
  lado?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/marca/zero-app-${tono}.svg`}
      alt=""
      aria-hidden
      width={lado}
      height={lado}
      style={{ width: lado, height: lado, borderRadius: lado * 0.27 }}
      className={className}
    />
  );
}
