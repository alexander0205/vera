import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { setActiveTeam } from '@/lib/auth/session';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers } from '@/lib/db/schema';
import { seedSystemRoles } from '@/lib/auth/permissions';
import { z } from 'zod';
import { FREE_PLAN } from '@/lib/config/plans';

const schema = z.object({
  razonSocial: z.string().min(2).max(255),
  rnc: z.string().regex(/^\d{9}$|^\d{11}$/, 'RNC debe tener 9 dígitos (empresa) u 11 dígitos (cédula)'),
  nombreComercial: z.string().max(255).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  // Crear el team y agregar al usuario como owner en una transacción
  const [team] = await db
    .insert(teams)
    .values({
      name: body.razonSocial,
      razonSocial: body.razonSocial,
      rnc: body.rnc,
      nombreComercial: body.nombreComercial ?? null,
      planName: FREE_PLAN.key,
    })
    .returning();

  await db.insert(teamMembers).values({
    userId: user.id,
    teamId: team.id,
    role: 'owner',
  });

  await seedSystemRoles(team.id);

  // Cambiar la empresa activa a la nueva
  await setActiveTeam(team.id);

  return NextResponse.json({ success: true, teamId: team.id }, { status: 201 });
}
