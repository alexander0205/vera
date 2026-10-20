/**
 * GET /api/equipo/pantallas — qué pantallas tiene apagadas cada rol.
 * PUT /api/equipo/pantallas — enciende o apaga una pantalla para un rol.
 *       body: { roleId: number, pantalla: string, visible: boolean }
 *
 * El Propietario no se puede tocar: siempre ve todo.
 * Catálogo de pantallas: lib/config/pantallas.ts.
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { listTeamRoles } from '@/lib/auth/permissions';
import { ocultasPorRol, fijarPantalla } from '@/lib/auth/pantallas';
import { PANTALLAS_ESCOLAR, esPantalla } from '@/lib/config/pantallas';

export async function GET() {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const [roles, ocultas] = await Promise.all([listTeamRoles(teamId), ocultasPorRol(teamId)]);
  return NextResponse.json({
    pantallas: PANTALLAS_ESCOLAR,
    roles: roles.map(r => ({
      id: r.id,
      key: r.key,
      label: r.label,
      ocultas: ocultas.get(r.id) ?? [],
    })),
  });
}

export async function PUT(req: Request) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => null);
  const roleId = Number(body?.roleId);
  if (!Number.isInteger(roleId) || !esPantalla(body?.pantalla) || typeof body?.visible !== 'boolean') {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const rol = (await listTeamRoles(teamId)).find(r => r.id === roleId);
  if (!rol) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  if (rol.key === 'owner') {
    return NextResponse.json({ error: 'El Propietario siempre ve todas las pantallas' }, { status: 403 });
  }

  await fijarPantalla(roleId, body.pantalla, body.visible);
  return NextResponse.json({ ok: true });
}
