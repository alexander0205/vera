/**
 * PATCH  /api/contabilidad/cuentas/[id]  — editar o activar/desactivar
 * DELETE /api/contabilidad/cuentas/[id]  — borrar (solo sin hijas ni movimientos)
 *
 * Las reglas (código inmutable con movimientos, no borrar con historia, ciclos
 * en la jerarquía) viven en `lib/contabilidad/cuentas.ts` y lanzan `CuentaError`
 * con su propio status. Aquí solo se traducen a HTTP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { editarCuenta, borrarCuenta, CuentaError } from '@/lib/contabilidad/cuentas';

async function autorizar() {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };

  const teamId = await getTeamIdForUser();
  if (!teamId) return { error: NextResponse.json({ error: 'Sin equipo' }, { status: 403 }) };

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'contabilidad:configurar')) {
    return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  return { user, teamId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await autorizar();
  if ('error' in auth) return auth.error;
  const { user, teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Id inválido.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  try {
    const cuenta = await editarCuenta(teamId, id, {
      codigo:     typeof b.codigo === 'string' ? b.codigo : undefined,
      nombre:     typeof b.nombre === 'string' ? b.nombre : undefined,
      tipo:       typeof b.tipo === 'string' ? b.tipo as never : undefined,
      naturaleza: typeof b.naturaleza === 'string' ? b.naturaleza as never : undefined,
      // null es un valor válido: desengancha la cuenta de su padre.
      cuentaPadreId: b.cuentaPadreId === null
        ? null
        : typeof b.cuentaPadreId === 'number' ? b.cuentaPadreId : undefined,
      imputable:  typeof b.imputable === 'boolean' ? b.imputable : undefined,
      activa:     typeof b.activa === 'boolean' ? b.activa : undefined,
    }, user.id);

    return NextResponse.json({ cuenta });
  } catch (e) {
    if (e instanceof CuentaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await autorizar();
  if ('error' in auth) return auth.error;
  const { teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Id inválido.' }, { status: 400 });
  }

  try {
    await borrarCuenta(teamId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CuentaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
