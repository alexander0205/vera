/**
 * GET /api/equipo/pantallas — qué ve cada rol del colegio.
 * PUT /api/equipo/pantallas — cambia algo del colegio para un rol. Una de:
 *   { roleId, pantalla: string | string[], visible }  enciende/apaga pantallas
 *   { roleId, acceso: boolean }     abre o cierra el colegio (módulo + ver)
 *   { roleId, permiso, activo }     un permiso suelto del colegio (acciones,
 *                                   o «configurar», que manda Configuración y
 *                                   Documentos)
 *
 * El Propietario no se puede tocar: siempre ve todo.
 * Catálogo de pantallas: lib/config/pantallas.ts.
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { listTeamRoles } from '@/lib/auth/permissions';
import { ocultasPorRol, fijarPantallas, fijarPermisos } from '@/lib/auth/pantallas';
import { PANTALLAS_ESCOLAR, ACCESO_COLEGIO, PERMISOS_COLEGIO, esPantalla } from '@/lib/config/pantallas';

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
      // Los permisos del colegio que tiene (acciones y «configurar»).
      permisos: r.permissions.filter(p => PERMISOS_COLEGIO.includes(p)),
      // Entra al colegio solo con módulo + ver; sin ellos sus pantallas no aplican.
      tieneModulo: ACCESO_COLEGIO.every(p => r.permissions.includes(p)),
    })),
  });
}

export async function PUT(req: Request) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => null);
  const roleId = Number(body?.roleId);
  // Abrir/cerrar el colegio, o un permiso suelto: no son pantallas sino
  // permisos del rol, y se aplican al instante.
  const esAcceso = typeof body?.acceso === 'boolean';
  const esPermiso = typeof body?.permiso === 'string' && typeof body?.activo === 'boolean';
  if (esAcceso || esPermiso) {
    if (!Number.isInteger(roleId) || (esPermiso && !PERMISOS_COLEGIO.includes(body.permiso))) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }
    const rolDestino = (await listTeamRoles(teamId)).find(r => r.id === roleId);
    if (!rolDestino) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
    if (rolDestino.key === 'owner') {
      return NextResponse.json({ error: 'El Propietario siempre tiene acceso a todo' }, { status: 403 });
    }
    await fijarPermisos(
      roleId,
      esAcceso ? [...ACCESO_COLEGIO] : [body.permiso],
      esAcceso ? body.acceso : body.activo,
    );
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
