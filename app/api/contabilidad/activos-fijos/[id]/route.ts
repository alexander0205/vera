/**
 * PATCH /api/contabilidad/activos-fijos/[id] — edita la ficha de un activo:
 * nombre, ubicación, categoría, vida útil, valor residual, y «confirmar» una
 * ficha abierta desde una compra. El costo, la fecha y la cantidad no se editan
 * (hay asientos y cuotas encima). Requiere `contabilidad:gestionar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { ActivoFijoError } from '@/lib/contabilidad/depreciacion';
import { editarActivoFijo } from '@/lib/contabilidad/activos-fijos-db';
import { BajaActivoError } from '@/lib/contabilidad/activos-fijos';
import { parseMontoPesos } from '@/lib/contabilidad/montos';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  let valorResidualCents: number | undefined;
  if (b.valorResidualPesos !== undefined && b.valorResidualPesos !== '') {
    const r = b.valorResidualPesos === 0 ? { ok: true as const, cents: 0 } : parseMontoPesos(b.valorResidualPesos, 'El valor residual');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    valorResidualCents = r.cents;
  }

  try {
    const r = await editarActivoFijo(auth.teamId, auth.user.id, id, {
      nombre: typeof b.nombre === 'string' ? b.nombre : undefined,
      ubicacion: typeof b.ubicacion === 'string' ? b.ubicacion : b.ubicacion === null ? null : undefined,
      categoria: typeof b.categoria === 'string' ? (b.categoria || null) : b.categoria === null ? null : undefined,
      vidaUtilMeses: b.vidaUtilMeses === undefined ? undefined : Number(b.vidaUtilMeses),
      valorResidualCents,
      confirmar: b.confirmar === true,
    });
    return NextResponse.json({ ok: true, avisos: r.avisos });
  } catch (e) {
    if (e instanceof ActivoFijoError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof BajaActivoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
