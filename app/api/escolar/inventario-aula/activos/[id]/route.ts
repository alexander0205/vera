/**
 * PATCH /api/escolar/inventario-aula/activos/[id] — cambia el estado de una ficha:
 * { estado: 'bien' | 'regular' | 'danado' }. Requiere `administracion-escolar:gestionar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { cambiarEstadoActivo } from '@/lib/escolar/inventario-aula-db';
import { responderError, idDeRuta } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = await idDeRuta(params);
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const b = await req.json().catch(() => null) as { estado?: unknown } | null;
  if (!b || typeof b.estado !== 'string') return NextResponse.json({ error: 'Indica el estado' }, { status: 400 });

  try {
    await cambiarEstadoActivo(auth.teamId, id, b.estado);
    invalidarPlanta(auth.teamId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
