import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/corridas/[id]/pagar — marca una corrida aprobada como
 * pagada. El pago real lo hace el banco con el archivo de dispersión; esto
 * sella el registro (fecha de pago) una vez que el dueño confirma que subió el
 * archivo. No genera movimiento de dinero: la app no dispersa fondos.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (corrida.estado === 'pagada') {
    return NextResponse.json({ error: 'La corrida ya está pagada' }, { status: 409 });
  }

  const [actualizada] = await db
    .update(nominaCorridas)
    .set({ estado: 'pagada', pagadaEn: new Date() })
    .where(eq(nominaCorridas.id, id))
    .returning();

  return NextResponse.json({ corrida: actualizada });
}
