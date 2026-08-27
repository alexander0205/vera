import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { generarAsientoNomina } from '@/lib/contabilidad/asientos';
import { crearObligacionesCorrida } from '@/lib/nomina/obligaciones-db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/corridas/[id]/aprobar — aprueba una corrida en borrador.
 * Genera el asiento contable del devengo (si la contabilidad está activa) y
 * deja la corrida lista para pagar. Idempotente en lo contable: el índice
 * único de origen impide un doble asiento.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
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
  if (corrida.estado !== 'borrador') {
    return NextResponse.json({ error: 'La corrida ya fue aprobada' }, { status: 409 });
  }

  // El asiento es opcional: si la contabilidad está apagada, la corrida se
  // aprueba igual y queda sin asientoId (motivo 'contabilidad-apagada').
  const asiento = await generarAsientoNomina(auth.teamId, id, auth.user.id);

  // Las obligaciones al Estado (TSS/DGII) nacen aquí, pendientes de pago.
  await crearObligacionesCorrida(auth.teamId, id);

  const [actualizada] = await db
    .update(nominaCorridas)
    .set({
      estado: 'aprobada',
      aprobadaEn: new Date(),
      ...(asiento.creado ? { asientoId: asiento.asientoId } : {}),
    })
    .where(eq(nominaCorridas.id, id))
    .returning();

  return NextResponse.json({ corrida: actualizada, asiento });
}
