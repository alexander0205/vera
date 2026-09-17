/**
 * GET  /api/compras/captura-link — el enlace de captura del negocio (lo crea si no existe).
 * POST /api/compras/captura-link — { accion: 'regenerar' | 'revocar' }.
 *
 * Genera/administra el enlace público permanente con el que se fotografían las
 * compras. Solo quien gestiona productos lo toca.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { origenPublico } from '@/lib/http/origen-publico';
import { getOCrearLink, regenerarLink, revocarLink, buscarLink, urlDelLink } from '@/lib/compras/captura-link';

export async function GET(request: NextRequest) {
  const auth = await requirePermission('productos:gestionar');
  if (!auth.ok) return auth.response;

  const link = await getOCrearLink(auth.teamId);
  return NextResponse.json({
    token: link.token,
    estado: link.estado,
    url: urlDelLink(link.token, origenPublico(request)),
  });
}

const bodySchema = z.object({ accion: z.enum(['regenerar', 'revocar']) });

export async function POST(request: NextRequest) {
  const auth = await requirePermission('productos:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  if (parsed.data.accion === 'revocar') {
    await revocarLink(auth.teamId);
    const link = await buscarLink(auth.teamId);
    return NextResponse.json({ token: link?.token ?? null, estado: 'revocado', url: null });
  }

  const link = await regenerarLink(auth.teamId);
  return NextResponse.json({
    token: link.token,
    estado: link.estado,
    url: urlDelLink(link.token, origenPublico(request)),
  });
}
