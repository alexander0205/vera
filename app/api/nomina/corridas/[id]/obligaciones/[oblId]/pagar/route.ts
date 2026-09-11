import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas, nominaObligaciones } from '@/lib/db/schema';
import { generarAsientoPagoNominaObligacion } from '@/lib/contabilidad/asientos';
import { refrescarEstadoCorrida } from '@/lib/nomina/obligaciones-db';

export const dynamic = 'force-dynamic';

const METODOS = ['efectivo', 'transferencia', 'cheque'] as const;
type Metodo = (typeof METODOS)[number];

/**
 * POST /api/nomina/corridas/[id]/obligaciones/[oblId]/pagar — marca una
 * obligación (TSS/DGII) como pagada y, si la contabilidad está activa, genera el
 * asiento que salda el pasivo. Body opcional: { metodo: 'efectivo'|'transferencia'|'cheque' }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; oblId: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:pagar');
  if (!auth.ok) return auth.response;

  const { id: idRaw, oblId: oblRaw } = await params;
  const id = Number(idRaw);
  const oblId = Number(oblRaw);
  if (!Number.isInteger(id) || !Number.isInteger(oblId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const [corrida] = await db
    .select({ id: nominaCorridas.id })
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);
  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });

  const [obl] = await db
    .select()
    .from(nominaObligaciones)
    .where(and(
      eq(nominaObligaciones.id, oblId),
      eq(nominaObligaciones.corridaId, id),
      eq(nominaObligaciones.teamId, auth.teamId),
    ))
    .limit(1);
  if (!obl) return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 });
  if (obl.pagada) return NextResponse.json({ error: 'La obligación ya está pagada' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const metodo: Metodo = METODOS.includes(body?.metodo) ? body.metodo : 'efectivo';

  // Asiento de pago (opcional: si la contabilidad está apagada, se salda igual
  // sin asiento). No rompe el pago si falla.
  const asiento = await generarAsientoPagoNominaObligacion(auth.teamId, oblId, metodo, auth.user.id);

  await db
    .update(nominaObligaciones)
    .set({
      pagada: true,
      pagadaEn: new Date(),
      ...(asiento.creado ? { asientoId: asiento.asientoId } : {}),
    })
    .where(eq(nominaObligaciones.id, oblId));

  await refrescarEstadoCorrida(auth.teamId, id);
  return NextResponse.json({ ok: true, asiento });
}
