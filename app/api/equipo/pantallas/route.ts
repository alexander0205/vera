/**
 * GET /api/equipo/pantallas — qué pantallas tiene apagadas cada rol.
 * PUT /api/equipo/pantallas — enciende o apaga una pantalla para un rol.
 *       body: { roleId: number, pantalla: string | string[], visible: boolean }
 *       (varias a la vez para «Todas» / «Ninguna»)
 *       o { roleId, darAcceso: true }: le abre el colegio al rol (módulo + ver).
 *
 * El Propietario no se puede tocar: siempre ve todo.
 * Catálogo de pantallas: lib/config/pantallas.ts.
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamRolePermissions } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { listTeamRoles } from '@/lib/auth/permissions';
import { ocultasPorRol, fijarPantallas } from '@/lib/auth/pantallas';
import { PANTALLAS_ESCOLAR, esPantalla } from '@/lib/config/pantallas';

/** Permisos que hacen falta para entrar al colegio (layout de /escolar). */
const ACCESO_COLEGIO = ['modulo:escolar', 'administracion-escolar:ver'];

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
      // Sin 'modulo:escolar' el rol ni entra al colegio: sus pantallas no aplican.
      tieneModulo: r.permissions.includes('modulo:escolar'),
    })),
  });
}

export async function PUT(req: Request) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => null);
  const roleId = Number(body?.roleId);
  // «Dar acceso al colegio»: lo mínimo para entrar y mirar. El resto (crear,
  // cobrar…) se afina en el editor del rol.
  if (body?.darAcceso === true) {
    if (!Number.isInteger(roleId)) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    const rolDestino = (await listTeamRoles(teamId)).find(r => r.id === roleId);
    if (!rolDestino) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
    if (rolDestino.key === 'owner') return NextResponse.json({ ok: true });
    await db.insert(teamRolePermissions)
      .values(ACCESO_COLEGIO.map(permission => ({ teamRoleId: roleId, permission })))
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  const pantallas: unknown[] = Array.isArray(body?.pantalla) ? body.pantalla : [body?.pantalla];
  if (!Number.isInteger(roleId) || !pantallas.every(esPantalla) || typeof body?.visible !== 'boolean') {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const rol = (await listTeamRoles(teamId)).find(r => r.id === roleId);
  if (!rol) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  if (rol.key === 'owner') {
    return NextResponse.json({ error: 'El Propietario siempre ve todas las pantallas' }, { status: 403 });
  }

  await fijarPantallas(roleId, pantallas as string[], body.visible);
  return NextResponse.json({ ok: true });
}
