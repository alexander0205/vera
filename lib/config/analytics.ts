/**
 * Google Analytics — la medida de la web pública, y SOLO de la web pública.
 *
 * Aquí no se decide qué se mide, sino qué se puede mandar. Zero tiene cinco
 * familias de rutas públicas cuyo camino ES el secreto —`/pagar/[token]`,
 * `/pay/[token]`, `/d/[token]`, `/f/[slug]/r/[token]`, `/foto/[token]`— y dos
 * pantallas que llevan el suyo en la query: `/reset-password?token=` y
 * `/completar-registro?t=`. Mandarle cualquiera de esos a Google es regalarle
 * el enlace de pago de un padre o la llave para cambiarle la contraseña a
 * alguien, y encima queda escrito en un informe que se puede compartir.
 *
 * De ahí las dos reglas: la etiqueta se monta solo en los marcos de la web
 * pública (marketing, legales y acceso), y de la URL solo viaja lo que esta
 * lista blanca deja pasar.
 */

/**
 * Los identificadores de GA4 son `G-` y luego letras y números. Se valida el
 * formato porque un identificador con una errata no falla: la etiqueta carga,
 * no protesta, y meses después resulta que no se midió nada.
 */
const FORMATO_GA4 = /^G-[A-Z0-9]{6,15}$/;

const CRUDO = (process.env.NEXT_PUBLIC_GA_ID ?? '').trim();

/** `null` = no hay medición. Sin la variable puesta no se carga nada. */
export const GA_ID: string | null = FORMATO_GA4.test(CRUDO) ? CRUDO : null;

/** Puesta pero mal escrita: hay que decirlo, o se mide en el vacío. */
export const GA_ID_INVALIDO = CRUDO !== '' && GA_ID === null;

/**
 * Lo único que se deja pasar de la query.
 *
 * Lista blanca y no lista negra a propósito: una lista negra hay que acordarse
 * de ampliarla cada vez que alguien añade una pantalla con un parámetro nuevo,
 * y el día que se olvide el fallo no se ve —el token se va callado—. Con lista
 * blanca lo que se olvida es medir un parámetro, que se arregla añadiéndolo.
 */
const PARAMETROS_PERMITIDOS = new Set([
  // Campañas
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid',
  // Nuestros
  'perfil',  // /contacto?perfil=colegio
  'ref',
]);

/**
 * Los caminos que no se miden NUNCA, aunque alguien monte la etiqueta ahí por
 * error. Es un cinturón encima de los tirantes: la etiqueta ya no se monta en
 * estos marcos, pero si un día alguien la sube al layout raíz, esto lo para.
 */
const CAMINOS_PROHIBIDOS = [
  /^\/pagar(\/|$)/,
  /^\/pay(\/|$)/,
  /^\/d(\/|$)/,
  /^\/foto(\/|$)/,
  /^\/f(\/|$)/,
];

export function caminoMedible(camino: string): boolean {
  return !CAMINOS_PROHIBIDOS.some(p => p.test(camino));
}

/**
 * La URL tal y como puede salir hacia Google: el camino entero y, de la query,
 * solo los parámetros de la lista blanca y en orden fijo.
 *
 * En orden fijo porque si no, la misma visita con `?utm_source=x&utm_medium=y`
 * y con los dos al revés cuentan como dos páginas distintas en el informe.
 */
export function rutaMedible(camino: string, busqueda: string): string {
  const entrada = new URLSearchParams(busqueda);
  const limpia = new URLSearchParams();
  for (const clave of [...PARAMETROS_PERMITIDOS].sort()) {
    const valor = entrada.get(clave);
    if (valor) limpia.set(clave, valor);
  }
  const cola = limpia.toString();
  return cola ? `${camino}?${cola}` : camino;
}
