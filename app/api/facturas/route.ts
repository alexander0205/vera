import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lte, desc, like, count, or } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') ?? '';
  const estado = sp.get('estado') ?? '';
  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10), 200);
  const offset = parseInt(sp.get('offset') ?? '0', 10);

  const conditions = [eq(ecfDocuments.teamId, teamId)];

  if (search) {
    conditions.push(
      or(
        like(ecfDocuments.encf, `%${search}%`),
        like(ecfDocuments.razonSocialComprador, `%${search}%`),
      )!,
    );
  }

  if (estado && estado !== 'todos') {
    conditions.push(eq(ecfDocuments.estado, estado));
  }

  if (desde) {
    conditions.push(gte(ecfDocuments.createdAt, new Date(desde)));
  }

  if (hasta) {
    conditions.push(lte(ecfDocuments.createdAt, new Date(hasta + 'T23:59:59')));
  }

  const where = and(...conditions);

  const [docs, totalRows] = await Promise.all([
    db
      .select({
        id: ecfDocuments.id,
        encf: ecfDocuments.encf,
        tipoEcf: ecfDocuments.tipoEcf,
        estado: ecfDocuments.estado,
        razonSocialComprador: ecfDocuments.razonSocialComprador,
        emailComprador: ecfDocuments.emailComprador,
        montoTotal: ecfDocuments.montoTotal,
        totalItbis: ecfDocuments.totalItbis,
        createdAt: ecfDocuments.createdAt,
      })
      .from(ecfDocuments)
      .where(where)
      .orderBy(desc(ecfDocuments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(ecfDocuments)
      .where(where),
  ]);

  return NextResponse.json({ docs, total: totalRows[0]?.total ?? 0 });
}
