/**
 * PATCH  /api/escolar/espacios/[id] → edita nombre, tipo, capacidad, responsable o activo.
 * DELETE /api/escolar/espacios/[id] → borra un espacio sin activos (con activos: 409).
 * Requieren `administracion-escolar:configurar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { editarEspacio, eliminarEspacio } from '@/lib/escolar/inventario-aula-db';
import { responderError, idDeRuta, enteroPositivo } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = await idDeRuta(params);
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  try {
    await editarEspacio(auth.teamId, id, {
      nombre: typeof b.nombre === 'string' ? b.nombre : undefined,
      tipo: typeof b.tipo === 'string' ? b.tipo : undefined,
      capacidad: b.capacidad === undefined ? undefined : b.capacidad === null || b.capacidad === '' ? null : Number(b.capacidad),
      responsableId: b.responsableId === undefined ? undefined : enteroPositivo(b.responsableId),
      activo: typeof b.activo === 'boolean' ? b.activo : undefined,
    });
    invalidarPlanta(auth.teamId);
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ESPACIO_CAMBIO', resource: `espacio:${id}`, ip: getIp(req), meta: { cambio: 'editado' } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = await idDeRuta(params);
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  try {
    await eliminarEspacio(auth.teamId, id);
    invalidarPlanta(auth.teamId);
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ESPACIO_CAMBIO', resource: `espacio:${id}`, ip: getIp(req), meta: { cambio: 'borrado' } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
