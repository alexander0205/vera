/**
 * A dónde se manda a alguien después de entrar.
 *
 * `?redirect=` es texto que escribe cualquiera: basta con mandarle a alguien un
 * enlace de verdad a nuestro login con `?redirect=https://otro-sitio` para que,
 * recién autenticado y confiado, acabe en una copia de Zero que le vuelve a
 * pedir la contraseña. Por eso solo vale una ruta de esta aplicación.
 *
 * TypeScript puro y sin dependencias: lo usan rutas de servidor y pantallas de
 * cliente, y `tests/unit/destino-entrada.test.ts` lo prueba sin montar nada.
 */

/** Base de mentira para resolver rutas relativas: solo se le mira el origen. */
const ORIGEN = 'http://interno.invalid';

/**
 * Empieza por `/`, sin `//` (que además descarta cualquier `protocolo://`) y sin
 * barras invertidas, que los navegadores leen como `/`.
 */
function pareceRutaInterna(ruta: string): boolean {
  return ruta.startsWith('/') && !ruta.includes('//') && !ruta.includes('\\');
}

/**
 * La ruta interna ya resuelta, o `null` si no lo es.
 *
 * Se mira dos veces: tal como llega y resuelta como la resolvería el navegador.
 * Así cae el tabulador metido entre dos barras (`/\t/otro-sitio`), que el
 * navegador quita antes de leerlas y convierte en `//otro-sitio`. Se devuelve la
 * ruta resuelta, que es la que se validó.
 */
export function rutaInterna(crudo: unknown): string | null {
  if (typeof crudo !== 'string' || !pareceRutaInterna(crudo)) return null;
  let url: URL;
  try {
    url = new URL(crudo, ORIGEN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEN) return null;
  const resuelta = `${url.pathname}${url.search}${url.hash}`;
  return pareceRutaInterna(resuelta) ? resuelta : null;
}

/**
 * Lo que vale guardar como `redirect` mientras dura la entrada: una ruta interna
 * o `checkout`, que no es una ruta sino la marca de que hay que seguir a Stripe.
 */
export function destinoValido(crudo: unknown): string | undefined {
  if (crudo === 'checkout') return 'checkout';
  return rutaInterna(crudo) ?? undefined;
}

/** La ruta a la que se redirige al entrar. `checkout` no lo es: va al panel. */
export function rutaTrasEntrar(redirect: unknown): string {
  return rutaInterna(redirect) ?? '/dashboard';
}

/** Lo que se recuerda durante la ida y vuelta a Google. */
export type DestinoDeEntrada = {
  redirect?: string;
  priceId?: string;
  inviteId?: string;
  inviteToken?: string;
};

/**
 * Lee la cookie `g_destino`, que no va firmada: la puede reescribir quien esté
 * en ese navegador. Por eso se copian solo estos cuatro campos, y como texto.
 *
 * Copiarla entera dejaba que una cookie con `email` pisara el correo que Google
 * acaba de verificar al firmar el alta: la cuenta nacía verificada con un correo
 * ajeno y, junto a `inviteId`, entraba en la empresa que había invitado a ese
 * correo.
 */
export function leerDestinoDeEntrada(cookie: string | undefined): DestinoDeEntrada {
  let crudo: unknown;
  try {
    crudo = JSON.parse(cookie || '{}');
  } catch {
    return {};
  }
  if (typeof crudo !== 'object' || crudo === null) return {};

  const { redirect, priceId, inviteId, inviteToken } = crudo as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    redirect: destinoValido(redirect),
    priceId: texto(priceId),
    inviteId: texto(inviteId),
    inviteToken: texto(inviteToken),
  };
}
