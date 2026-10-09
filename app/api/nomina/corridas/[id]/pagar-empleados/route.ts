import { NextResponse } from 'next/server';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas, nominaLineas, nominaPagos } from '@/lib/db/schema';
import { generarAsientoPagoSueldos } from '@/lib/contabilidad/asientos';
import { refrescarEstadoCorrida } from '@/lib/nomina/obligaciones-db';
import { asegurarDevengoCorrida } from '@/lib/nomina/contabilidad-db';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const METODOS = ['efectivo', 'transferencia', 'cheque'] as const;
type Metodo = (typeof METODOS)[number];

/**
 * POST /api/nomina/corridas/[id]/pagar-empleados — registra el pago a los
 * empleados indicados. Body: { lineaIds: number[] } o { todos: true }, y
 * { metodo: 'efectivo'|'transferencia'|'cheque' } (transferencia por defecto).
 *
 * Lo que se marca de una vez es un pago (nomina_pagos) con fecha, método y monto;
 * si la contabilidad está activa lleva su asiento (DEBE sueldos por pagar · HABER
 * caja o banco). Solo toma las líneas aún pendientes: un segundo clic no paga dos
 * veces. `{ pagada: false }` desmarca, salvo que el pago ya esté asentado.
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
  if (!todos && lineaIds.length === 0) {
    return NextResponse.json({ error: 'Indica lineaIds o todos:true' }, { status: 400 });
  }
  const cond = todos
    ? and(eq(nominaLineas.corridaId, id), eq(nominaLineas.teamId, auth.teamId))
    : and(eq(nominaLineas.corridaId, id), eq(nominaLineas.teamId, auth.teamId), inArray(nominaLineas.id, lineaIds));

  if (body?.pagada === false) return desmarcar(auth.teamId, id, cond);

  const metodo: Metodo = METODOS.includes(body?.metodo) ? body.metodo : 'transferencia';

  const pago = await db.transaction(async (tx) => {
    const pendientes = await tx
      .select({ id: nominaLineas.id, netoCents: nominaLineas.netoCents })
      .from(nominaLineas)
      .where(and(cond, eq(nominaLineas.pagada, false)))
      .for('update');
    if (pendientes.length === 0) return null;

    const montoCents = pendientes.reduce((s, l) => s + l.netoCents, 0);
    // Un neto en cero no mueve dinero: se marca pagado sin pago que asentar.
    const [nuevo] = montoCents > 0
      ? await tx.insert(nominaPagos).values({
          teamId: auth.teamId, corridaId: id, fecha: hoyRD(), metodo,
          montoCents, lineas: pendientes.length, createdBy: auth.user.id,
        }).returning({ id: nominaPagos.id })
      : [null];

    await tx
      .update(nominaLineas)
      .set({ pagada: true, pagadaEn: new Date(), pagoId: nuevo?.id ?? null })
      .where(inArray(nominaLineas.id, pendientes.map((l) => l.id)));

    return { pagoId: nuevo?.id ?? null, lineas: pendientes.length, montoCents };
  });

  if (!pago) return NextResponse.json({ error: 'Esos empleados ya estaban pagados' }, { status: 409 });

  let asiento = null;
  if (pago.pagoId) {
    await asegurarDevengoCorrida(auth.teamId, id, auth.user.id);
    asiento = await generarAsientoPagoSueldos(auth.teamId, pago.pagoId, auth.user.id);
    if (asiento.creado && asiento.asientoId) {
      await db.update(nominaPagos).set({ asientoId: asiento.asientoId }).where(eq(nominaPagos.id, pago.pagoId));
    }
  }

  await refrescarEstadoCorrida(auth.teamId, id);
  return NextResponse.json({ ok: true, pago, asiento });
}

/** Desmarca líneas pagadas, siempre que su pago no esté ya en el libro. */
async function desmarcar(teamId: number, corridaId: number, cond: ReturnType<typeof and>) {
  const lineas = await db
    .select({ id: nominaLineas.id, pagoId: nominaLineas.pagoId })
    .from(nominaLineas)
    .where(and(cond, eq(nominaLineas.pagada, true)));
  if (lineas.length === 0) return NextResponse.json({ ok: true });

  const pagoIds = [...new Set(lineas.map((l) => l.pagoId).filter((p): p is number => p !== null))];
  if (pagoIds.length > 0) {
    const asentados = await db
      .select({ id: nominaPagos.id })
      .from(nominaPagos)
      .where(and(inArray(nominaPagos.id, pagoIds), isNotNull(nominaPagos.asientoId)));
    if (asentados.length > 0) {
      return NextResponse.json(
        { error: 'Ese pago ya está asentado en contabilidad: reviértelo con un asiento antes de desmarcarlo' },
        { status: 409 },
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(nominaLineas)
      .set({ pagada: false, pagadaEn: null, pagoId: null })
      .where(inArray(nominaLineas.id, lineas.map((l) => l.id)));
    // El pago se queda con lo que siga pagado; si no queda nada, desaparece.
    for (const pagoId of pagoIds) {
      const restantes = await tx
        .select({ netoCents: nominaLineas.netoCents })
        .from(nominaLineas)
        .where(eq(nominaLineas.pagoId, pagoId));
      const monto = restantes.reduce((s, l) => s + l.netoCents, 0);
      if (monto > 0) {
        await tx.update(nominaPagos).set({ montoCents: monto, lineas: restantes.length }).where(eq(nominaPagos.id, pagoId));
      } else {
        await tx.update(nominaLineas).set({ pagoId: null }).where(eq(nominaLineas.pagoId, pagoId));
        await tx.delete(nominaPagos).where(eq(nominaPagos.id, pagoId));
      }
    }
  });
  return NextResponse.json({ ok: true, corridaId });
}
