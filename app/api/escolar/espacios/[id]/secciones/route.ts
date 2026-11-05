/**
 * PUT /api/escolar/espacios/[id]/secciones — deja en el espacio exactamente estas
 * secciones: { cursoIds: number[] }. Una sección que estaba en otro espacio se
 * mueve a este. Requiere `administracion-escolar:configurar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { asignarSecciones } from '@/lib/escolar/inventario-aula-db';
import { responderError, idDeRuta } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = await idDeRuta(params);
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const b = await req.json().catch(() => null) as { cursoIds?: unknown } | null;
  if (!b || !Array.isArray(b.cursoIds)) return NextResponse.json({ error: 'Indica las secciones' }, { status: 400 });

  try {
    await asignarSecciones(auth.teamId, id, b.cursoIds.map(Number));
    invalidarPlanta(auth.teamId);
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ESPACIO_CAMBIO', resource: `espacio:${id}`, ip: getIp(req), meta: { cambio: 'secciones', cantidad: b.cursoIds.length } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
