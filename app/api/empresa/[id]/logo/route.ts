import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';

/**
 * Sirve el logo de una empresa como imagen, aparte del listado.
 *
 * `teams.logo` guarda el archivo entero como data URI adentro de la fila (hasta
 * ~800 KB por empresa). Mandarlo embebido en `/api/empresa/list` hacía que ese
 * listado arrastrara ~1.6 MB desde Neon us-east-1 en cada carga: medido, 63s
 * contra 108ms trayendo solo metadata. Sacándolo de ahí, el switcher de
 * empresas carga instantáneo y cada logo llega por su lado, en paralelo, y
 * queda cacheado por el browser en vez de re-bajarse con cada listado.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const teamId = parseInt(id, 10);
  if (Number.isNaN(teamId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  // Un platform admin ve cualquier empresa; el resto, solo las suyas — mismo
  // criterio que getUserTeams en lib/db/queries.ts.
  if (user.platformRole !== 'admin') {
    const [miembro] = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);
    if (!miembro) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 });
  }

  const [fila] = await db.select({ logo: teams.logo }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!fila?.logo) return new NextResponse(null, { status: 404 });

  // El logo se guarda como data URI (`data:image/png;base64,...`). Si alguna
  // fila vieja guardó una URL común, redirigimos en vez de romper.
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(fila.logo);
  if (!match) {
    if (/^https?:\/\//.test(fila.logo)) return NextResponse.redirect(fila.logo);
    return new NextResponse(null, { status: 404 });
  }

  const [, mimeType, base64] = match;
  return new NextResponse(Buffer.from(base64, 'base64'), {
    headers: {
      'Content-Type': mimeType,
      // Privado: la respuesta depende de la sesión, no debe quedar en caches
      // compartidos. Una hora alcanza para que el switcher no lo re-baje en
      // cada navegación.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
