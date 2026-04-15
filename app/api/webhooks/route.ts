import { NextRequest, NextResponse } from 'next/server';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { outboundWebhooks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const hooks = await db.select().from(outboundWebhooks).where(eq(outboundWebhooks.teamId, teamId));
  return NextResponse.json(hooks);
}

export async function POST(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { nombre, url, eventos } = await req.json();
  if (!nombre || !url) return NextResponse.json({ error: 'Nombre y URL requeridos' }, { status: 400 });

  const secret = randomBytes(24).toString('hex');
  const [hook] = await db.insert(outboundWebhooks).values({
    teamId,
    nombre,
    url,
    secret,
    eventos: Array.isArray(eventos) ? eventos.join(',') : eventos ?? 'ecf.emitido',
  }).returning();

  return NextResponse.json(hook, { status: 201 });
}
