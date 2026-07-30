/**
 * POST /api/equipo/alerta-metodo-pago
 * Activa/desactiva la alerta double-check del método de pago (POS + factura).
 *
 * Endpoint aparte del perfil de empresa porque este toggle lo pueden cambiar
 * admin Y owner (permiso 'pagos:config-alerta'), mientras que el perfil fiscal
 * es owner-only. Gateado por el permiso, no por el rol owner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { userCan } from '@/lib/config/roles';

const schema = z.object({ activa: z.boolean() });

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 422 });
  }

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [[u], [member]] = await Promise.all([
    db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1),
  ]);

  if (!userCan(u?.platformRole, member?.role, 'pagos:config-alerta')) {
    return NextResponse.json(
      { error: 'Solo un administrador o el propietario puede cambiar esta alerta.' },
      { status: 403 },
    );
  }

  await db.update(teams)
    .set({ alertaMetodoPagoActiva: parsed.data.activa, updatedAt: new Date() })
    .where(eq(teams.id, teamId));

  return NextResponse.json({ ok: true, activa: parsed.data.activa });
}
