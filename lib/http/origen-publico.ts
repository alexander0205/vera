import type { NextRequest } from 'next/server';

/**
 * El origen por el que el usuario está entrando AHORA, no el del env.
 *
 * Lo que se mete en un QR o en un enlace que se manda por WhatsApp tiene que
 * llegar al mismo sitio que el escritorio. Si se tomara `NEXT_PUBLIC_APP_URL`
 * acabaríamos apuntando al dominio de Vercel, que redirige al dominio real — y
 * una redirección en medio de la cámara de un móvil es un fallo silencioso más.
 * El env queda solo de red de seguridad.
 */

/**
 * ¿El host es de la máquina o de la red de casa?
 *
 * Importa para el desarrollo con el teléfono: se abre la aplicación por la IP
 * de la Mac (10.0.0.x) para que el móvil llegue, y ahí no hay TLS. Suponer
 * https por no ser «localhost» generaba un enlace a una dirección que no
 * existe, y el teléfono se quedaba en un error de conexión sin explicación.
 */
export function esHostLocal(host: string): boolean {
  const nombre = host.split(':')[0];
  return nombre === 'localhost'
    || nombre.endsWith('.local')
    || /^127\./.test(nombre)
    || /^10\./.test(nombre)
    || /^192\.168\./.test(nombre)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(nombre);
}

export function origenPublico(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? '';
  const proto = req.headers.get('x-forwarded-proto') ?? (esHostLocal(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
