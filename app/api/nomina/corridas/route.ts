import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaLineas } from '@/lib/db/schema';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { construirCorrida } from '@/lib/nomina/corrida';

export const dynamic = 'force-dynamic';

const RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** GET /api/nomina/corridas — lista las corridas del team, recientes primero. */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select()
    .from(nominaCorridas)
    .where(eq(nominaCorridas.teamId, auth.teamId))
    .orderBy(desc(nominaCorridas.periodo), desc(nominaCorridas.id));

  return NextResponse.json({ corridas: filas });
}

/**
 * POST /api/nomina/corridas — crea una corrida en borrador: toma los empleados
 * activos, corre el motor y guarda las líneas. No paga ni asienta nada; eso es
 * aprobar/pagar.
 */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const periodo = String(body.periodo ?? '').trim();
  if (!RE_PERIODO.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido (formato YYYY-MM)' }, { status: 400 });
  }
  const tipo = String(body.tipo ?? 'mensual').trim() || 'mensual';
  const descripcion = String(body.descripcion ?? '').trim() || `Nómina ${periodo}`;
  const fechaPago = String(body.fechaPago ?? '').trim() || null;
  const anioTasas = Number(periodo.slice(0, 4));

  const activos = await db
    .select()
    .from(empleados)
    .where(eq(empleados.teamId, auth.teamId));

  const { lineas, totales } = construirCorrida(
    activos.map((e) => ({
      id: e.id, nombres: e.nombres, apellidos: e.apellidos, cedula: e.cedula,
      cargo: e.cargo, salarioBaseCents: e.salarioBaseCents, estado: e.estado,
    })),
    tasasDelAnio(anioTasas),
  );

  if (lineas.length === 0) {
    return NextResponse.json({ error: 'No hay empleados activos para incluir en la corrida' }, { status: 400 });
  }

  try {
    const corrida = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(nominaCorridas)
        .values({
          teamId: auth.teamId, periodo, descripcion, tipo,
          fechaPago, estado: 'borrador', anioTasas,
          totalBrutoCents: totales.totalBrutoCents,
          totalDeduccionesCents: totales.totalDeduccionesCents,
          totalNetoCents: totales.totalNetoCents,
          totalPatronalCents: totales.totalPatronalCents,
          createdBy: auth.user.id,
        })
        .returning();

      await tx.insert(nominaLineas).values(
        lineas.map((l) => ({ ...l, corridaId: c.id, teamId: auth.teamId })),
      );
      return c;
    });

    return NextResponse.json({ corrida }, { status: 201 });
  } catch (err) {
    // Choque con el índice único (team, periodo, tipo): ya existe esa corrida.
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
      return NextResponse.json({ error: `Ya existe una corrida ${tipo} para ${periodo}` }, { status: 409 });
    }
    throw err;
  }
}
