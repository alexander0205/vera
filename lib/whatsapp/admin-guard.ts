/**
 * Portero de las rutas /api/admin/whatsapp/*.
 *
 * Existe para que las cuatro rutas no repitan el mismo bloque: la que se
 * olvide de comprobar `platformRole` deja la llave de WhatsApp de la
 * plataforma al alcance de cualquier usuario con sesión.
 */

import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';

type Resultado =
  | { ok: true; apiKey: string }
  | { ok: false; response: NextResponse };

export async function requireAdminConLlave(): Promise<Resultado> {
  const user = await getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  if (user.platformRole !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 }) };
  }
  const apiKey = process.env.CRM_ZERO_API_KEY;
  if (!apiKey) {
    return { ok: false, response: NextResponse.json({ error: 'Falta CRM_ZERO_API_KEY' }, { status: 503 }) };
  }
  return { ok: true, apiKey };
}

/** Solo admin, sin exigir la llave: para lo que se guarda en nuestra base. */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const user = await getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  if (user.platformRole !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 }) };
  }
  return { ok: true };
}
