/**
 * GET /api/equipo/pantallas — qué pantallas tiene apagadas cada rol.
 * PUT /api/equipo/pantallas — muestra u oculta pantallas para un rol.
 *       body: { roleId: number, pantalla: string | string[], visible: boolean }
 *       (varias a la vez para «Todas» / «Ninguna» de un módulo o sección)
 *
 * El Propietario no se puede tocar: siempre ve todo.
 * Catálogo de pantallas: lib/config/pantallas.ts.
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { listTeamRoles } from '@/lib/auth/permissions';
import { ocultasPorRol, fijarPantallas } from '@/lib/auth/pantallas';
import { PANTALLAS, esPantalla } from '@/lib/config/pantallas';

export async function GET() {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  // Sin la tabla (migración 0197 sin correr) el panel lo dice en vez de quedarse cargando.
  let roles: Awaited<ReturnType<typeof listTeamRoles>>;
  let ocultas: Map<number, string[]>;
  try {
    [roles, ocultas] = await Promise.all([listTeamRoles(teamId), ocultasPorRol(teamId)]);
  } catch (err) {
    console.error('[equipo/pantallas] GET', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudieron leer las pantallas por rol. Inténtalo en un momento.' }, { status: 503 });
  }
  return NextResponse.json({
    pantallas: PANTALLAS,
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
  // Sin repetidas y nunca más que el catálogo entero («Todas» / «Ninguna» de un módulo).
  const pantallas: unknown[] = [...new Set(Array.isArray(body?.pantalla) ? body.pantalla : [body?.pantalla])];
  if (!Number.isInteger(roleId) || !pantallas.length || pantallas.length > PANTALLAS.length
    || !pantallas.every(esPantalla) || typeof body?.visible !== 'boolean') {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const rol = (await listTeamRoles(teamId)).find(r => r.id === roleId);
  if (!rol) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  if (rol.key === 'owner') {
    return NextResponse.json({ error: 'El Propietario siempre ve todas las pantallas' }, { status: 403 });
  }

  await fijarPantallas(teamId, roleId, pantallas as string[], body.visible);
  return NextResponse.json({ ok: true });
}
