/**
 * GET /api/equipo/pantallas — qué ve y qué puede hacer cada rol, por módulo.
 * PUT /api/equipo/pantallas — cambia algo de un rol. Una de:
 *   { roleId, pantalla: string | string[], visible }  enciende/apaga pantallas
 *   { roleId, modulo, acceso: boolean }  abre o cierra un módulo (sus permisos
 *                                        de entrada)
 *   { roleId, permiso, activo }          un permiso suelto de la gobernanza
 *                                        (acciones, o el que manda pantallas)
 *
 * El Propietario no se puede tocar: siempre ve y puede todo.
 * Catálogo de módulos y pantallas: lib/config/pantallas.ts.
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { listTeamRoles } from '@/lib/auth/permissions';
import { ocultasPorRol, fijarPantallas, fijarPermisos } from '@/lib/auth/pantallas';
import { MODULOS, PERMISOS_GOBERNANZA, esPantalla } from '@/lib/config/pantallas';

export async function GET() {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const [roles, ocultas] = await Promise.all([listTeamRoles(teamId), ocultasPorRol(teamId)]);
  return NextResponse.json({
    modulos: MODULOS,
    roles: roles.map(r => ({
      id: r.id,
      key: r.key,
      label: r.label,
      ocultas: ocultas.get(r.id) ?? [],
      // Los permisos de la gobernanza que tiene el rol: con ellos el cliente
      // decide si entra a cada módulo, qué ve y qué puede hacer.
      permisos: r.permissions.filter(p => PERMISOS_GOBERNANZA.includes(p)),
    })),
  });
}

export async function PUT(req: Request) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => null);
  const roleId = Number(body?.roleId);
  if (!Number.isInteger(roleId)) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  const rol = (await listTeamRoles(teamId)).find(r => r.id === roleId);
  if (!rol) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  if (rol.key === 'owner') {
    return NextResponse.json({ error: 'El Propietario siempre ve y puede todo' }, { status: 403 });
  }

  // Abrir/cerrar un módulo, o un permiso suelto: no son pantallas sino permisos
  // del rol, y se aplican al instante.
  const modulo = MODULOS.find(m => m.id === body?.modulo);
  if (modulo && typeof body?.acceso === 'boolean') {
    await fijarPermisos(roleId, [...modulo.acceso], body.acceso);
    return NextResponse.json({ ok: true });
  }
  if (typeof body?.permiso === 'string' && typeof body?.activo === 'boolean') {
    if (!PERMISOS_GOBERNANZA.includes(body.permiso)) {
      return NextResponse.json({ error: 'Permiso inválido' }, { status: 400 });
    }
    await fijarPermisos(roleId, [body.permiso], body.activo);
    return NextResponse.json({ ok: true });
  }

  const pantallas: unknown[] = Array.isArray(body?.pantalla) ? body.pantalla : [body?.pantalla];
  if (!pantallas.every(esPantalla) || typeof body?.visible !== 'boolean') {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  await fijarPantallas(roleId, pantallas as string[], body.visible);
  return NextResponse.json({ ok: true });
}
