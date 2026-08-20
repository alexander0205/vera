import type { NextRequest } from 'next/server';
import { baseDeEnlaces, esHostLocal } from '@/lib/config/enlaces';

/**
 * El origen por el que el usuario está entrando AHORA, no el del env.
 *
 * Lo que se mete en un QR o en un enlace que se manda por WhatsApp tiene que
 * llegar al mismo sitio que el escritorio. Si se tomara `NEXT_PUBLIC_APP_URL`
 * acabaríamos apuntando al dominio de Vercel, que redirige al dominio real — y
 * una redirección en medio de la cámara de un móvil es un fallo silencioso más.
 */

export { esHostLocal };

export function origenPublico(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  // Sin host no hay nada que deducir. Antes caía a `NEXT_PUBLIC_APP_URL ?? ''`,
  // y esa cadena vacía convertía el enlace en una ruta relativa: dentro de un
  // correo o de un WhatsApp, un enlace que no lleva a ninguna parte.
  if (!host) return baseDeEnlaces();
  const proto = req.headers.get('x-forwarded-proto') ?? (esHostLocal(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
