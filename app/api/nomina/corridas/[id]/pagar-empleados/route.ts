import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas, nominaLineas } from '@/lib/db/schema';
import { refrescarEstadoCorrida } from '@/lib/nomina/obligaciones-db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/corridas/[id]/pagar-empleados — marca como pagados a los
 * empleados indicados (pago parcial). Body: { lineaIds: number[] } o { todos:true }.
 * El pago real lo hace el banco con el archivo de dispersión; esto registra que
 * ya se pagó a esas personas. Lo no marcado sigue pendiente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:pagar');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);
  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  if (corrida.estado === 'borrador') {
    return NextResponse.json({ error: 'La corrida debe aprobarse antes de pagar' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const todos = body?.todos === true;
  const lineaIds: number[] = Array.isArray(body?.lineaIds)
    ? body.lineaIds.filter((n: unknown) => Number.isInteger(n))
    : [];
  const marcar = body?.pagada === false ? false : true;

  if (!todos && lineaIds.length === 0) {
    return NextResponse.json({ error: 'Indica lineaIds o todos:true' }, { status: 400 });
  }

  const cond = todos
    ? eq(nominaLineas.corridaId, id)
    : and(eq(nominaLineas.corridaId, id), inArray(nominaLineas.id, lineaIds));

  await db
    .update(nominaLineas)
    .set({ pagada: marcar, pagadaEn: marcar ? new Date() : null })
    .where(cond);

  await refrescarEstadoCorrida(auth.teamId, id);
  return NextResponse.json({ ok: true });
}
