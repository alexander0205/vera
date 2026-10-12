/**
 * Cookie jar mínimo para el cliente SIGERD.
 *
 * No usamos `tough-cookie` a propósito: todo el tráfico va a un solo host
 * (sigerd.minerd.gob.do), así que basta con guardar pares nombre/valor y
 * reenviarlos. Sin dependencias nuevas.
 */

/** Lee `Set-Cookie` de forma segura en Node 18/20/24 y en el runtime de Vercel. */
function leerSetCookie(headers: Headers): string[] {
  // Node >= 18.14 / undici >= 5.19
  const nativo = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof nativo === 'function') return nativo.call(headers);

  // Fallback: un solo header concatenado. Separamos por comas que NO pertenecen
  // a `Expires=Wed, 01 Jan 2025 ...` (la coma va seguida de un espacio y un día).
  const crudo = headers.get('set-cookie');
  if (!crudo) return [];
  return crudo.split(/,\s*(?=[^;=]+=[^;]*)/);
}

export class CookieJar {
  private jar: Map<string, string>;

  constructor(inicial: Record<string, string> = {}) {
    this.jar = new Map(Object.entries(inicial));
  }

  /** Absorbe las cookies de una respuesta. Borra las que llegan vacías (logout). */
  absorber(res: Response): void {
    for (const linea of leerSetCookie(res.headers)) {
      const [par] = linea.split(';');
      const idx = par.indexOf('=');
      if (idx < 1) continue;

      const nombre = par.slice(0, idx).trim();
      const valor = par.slice(idx + 1).trim();

      if (valor === '' || valor === 'deleted') this.jar.delete(nombre);
      else this.jar.set(nombre, valor);
    }
  }

  /** Valor del header `Cookie` para la siguiente petición ('' si no hay ninguna). */
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  tiene(nombre: string): boolean {
    return this.jar.has(nombre);
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(this.jar);
  }
}
