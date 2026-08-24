/**
 * GET  /api/equipo/permisos  — matriz de roles + permisos del team activo.
 * POST /api/equipo/permisos  — crea un rol personalizado (copia de uno base).
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamRoles, teamRolePermissions, teamMembers } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { PERMISSION_CATALOG, ALL_PERMISSIONS } from '@/lib/config/roles';
import { listTeamRoles } from '@/lib/auth/permissions';
import { getTeamModules } from '@/lib/auth/modules';
import type { ModuleKey } from '@/lib/config/modules';

/**
 * El módulo NO-base que exige un permiso, o null si no exige ninguno.
 *
 * Solo POS y Escolar se venden aparte; facturación y administración son base y
 * los tiene toda empresa. Sirve para no ofrecer permisos ni roles de un módulo
 * que la empresa no contrató: sin esto, un negocio con plan básico veía el
 * grupo «Punto de venta», el permiso `modulo:pos` y el rol «Cajero», y un
 * negocio sin colegio veía «Administración escolar» y «Personal del colegio».
 */
function moduloDePermiso(p: string): ModuleKey | null {
  if (p === 'modulo:pos' || p.startsWith('pos:')) return 'pos';
  if (p === 'modulo:escolar' || p.startsWith('administracion-escolar:')) return 'escolar';
  return null;
}

export async function GET() {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const [roles, modulos] = await Promise.all([
    listTeamRoles(teamId),
    getTeamModules(teamId),
  ]);
  const tiene = (m: ModuleKey) => modulos.includes(m);

  // Conteo de miembros por rol (key).
  const counts = await db
    .select({ role: teamMembers.role, n: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))
    .groupBy(teamMembers.role);
  const countByKey = new Map(counts.map(c => [c.role, c.n]));

  // Catálogo recortado a los módulos contratados: se caen `pos:*`/`modulo:pos`
  // sin POS y los escolares sin colegio, y con ellos los grupos que quedan vacíos.
  const catalog = PERMISSION_CATALOG
    .map(g => ({
      ...g,
      permissions: g.permissions.filter(pd => {
        const m = moduloDePermiso(pd.key);
        return !m || tiene(m);
      }),
    }))
    .filter(g => g.permissions.length > 0);

  // Roles dedicados a un módulo (Cajero → POS, Personal del colegio → Escolar):
  // se reconocen porque NO dan acceso a Facturación —los generales (Propietario,
  // Administrador, Vendedor, Auditor) sí—. Se ocultan cuando falta su módulo,
  // sin tocar nunca a los generales aunque incluyan permisos de POS/escolar.
  const rolesVisibles = roles.filter(r => {
    if (r.permissions.includes('modulo:facturacion')) return true;
    const req = r.permissions
      .map(moduloDePermiso)
      .filter((m): m is ModuleKey => m !== null);
    return req.every(m => tiene(m));
  });

  return NextResponse.json({
    roles: rolesVisibles.map(r => ({ ...r, memberCount: countByKey.get(r.key) ?? 0 })),
    catalog,
    modulos,
  });
}

/** slug seguro a partir de un label libre. */
function slugify(label: string): string {
  return label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'rol';
}

export async function POST(req: Request) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => null);
  const label = String(body?.label ?? '').trim();
  const basedOn = body?.basedOn ? String(body.basedOn) : null;
  if (!label) return NextResponse.json({ error: 'El nombre del rol es requerido' }, { status: 400 });
  if (label.length > 60) return NextResponse.json({ error: 'Nombre muy largo' }, { status: 400 });

  // Clave única dentro del team.
  const existing = await db
    .select({ key: teamRoles.key })
    .from(teamRoles)
    .where(eq(teamRoles.teamId, teamId));
  const used = new Set(existing.map(e => e.key));
  let key = slugify(label);
  if (used.has(key)) {
    let i = 2;
    while (used.has(`${key}-${i}`)) i++;
    key = `${key}-${i}`;
  }

  // Permisos iniciales: copia del rol base (si se indicó y existe en el team).
  let initialPerms: string[] = [];
  let icon = 'UserCog';
  let color = 'text-gray-600 bg-gray-50 border-gray-200';
  if (basedOn) {
    const roles = await listTeamRoles(teamId);
    const base = roles.find(r => r.key === basedOn);
    if (base) {
      initialPerms = base.permissions;
      icon = base.icon ?? icon;
    }
  }

  const [row] = await db
    .insert(teamRoles)
    .values({ teamId, key, label, icon, color, isSystem: false })
    .returning({ id: teamRoles.id });

  if (initialPerms.length) {
    await db.insert(teamRolePermissions).values(
      initialPerms.map(p => ({ teamRoleId: row.id, permission: p })),
    );
  }

  return NextResponse.json({ ok: true, id: row.id, key }, { status: 201 });
}
