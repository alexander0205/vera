/**
 * GET    /api/contabilidad/cuentas   — el catálogo como árbol
 *   ?incluirInactivas=true           — también las desactivadas
 *   ?plano=true                      — lista plana en vez de árbol
 *
 * POST   /api/contabilidad/cuentas   — crear una cuenta
 *
 * El GET siembra el catálogo base la primera vez que un team entra al módulo.
 * Es la siembra perezosa: nadie recibe cuentas hasta que abre la pantalla.
 *
 * Permisos: `contabilidad:ver` para leer, `contabilidad:configurar` para
 * escribir. El catálogo define cómo se clasifica todo lo que viene después, así
 * que tocarlo es configuración, no gestión del día a día.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { sembrarCatalogoBase } from '@/lib/contabilidad/catalogo-base';
import {
  listarCuentas, listarCuentasArbol, crearCuenta, CuentaError,
} from '@/lib/contabilidad/cuentas';

/** Resuelve usuario, team y permiso en un paso. Devuelve la respuesta de error si falla. */
async function autorizar(permiso: 'contabilidad:ver' | 'contabilidad:configurar') {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };

  const teamId = await getTeamIdForUser();
  if (!teamId) return { error: NextResponse.json({ error: 'Sin equipo' }, { status: 403 }) };

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, permiso)) {
    return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  return { user, teamId };
}

export async function GET(req: NextRequest) {
  const auth = await autorizar('contabilidad:ver');
  if ('error' in auth) return auth.error;
  const { user, teamId } = auth;

  const { searchParams } = new URL(req.url);
  const incluirInactivas = searchParams.get('incluirInactivas') === 'true';
  const plano = searchParams.get('plano') === 'true';

  // Siembra perezosa: si el team nunca abrió contabilidad, no tiene catálogo.
  // Es idempotente y no sobrescribe nada, así que correrla en cada GET es
  // seguro; devuelve 0 en cuanto existe la primera cuenta.
  const sembradas = await sembrarCatalogoBase(teamId, user.id);

  const cuentas = plano
    ? await listarCuentas(teamId, { incluirInactivas })
    : await listarCuentasArbol(teamId, { incluirInactivas });

  return NextResponse.json({ cuentas, catalogoRecienCreado: sembradas > 0 });
}

export async function POST(req: NextRequest) {
  const auth = await autorizar('contabilidad:configurar');
  if ('error' in auth) return auth.error;
  const { user, teamId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (typeof b.codigo !== 'string' || typeof b.nombre !== 'string' || typeof b.tipo !== 'string') {
    return NextResponse.json(
      { error: 'Faltan campos obligatorios: código, nombre y tipo.' },
      { status: 400 },
    );
  }

  try {
    const cuenta = await crearCuenta(teamId, {
      codigo: b.codigo,
      nombre: b.nombre,
      tipo: b.tipo as never,
      naturaleza: b.naturaleza as never,
      cuentaPadreId: typeof b.cuentaPadreId === 'number' ? b.cuentaPadreId : null,
      imputable: typeof b.imputable === 'boolean' ? b.imputable : undefined,
    }, user.id);

    return NextResponse.json({ cuenta }, { status: 201 });
  } catch (e) {
    if (e instanceof CuentaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
