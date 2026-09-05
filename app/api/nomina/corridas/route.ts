import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { generarCorrida } from '@/lib/nomina/generar-corrida';

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

  // Botón manual: incluye a TODOS los empleados activos (sin filtrar frecuencia).
  const r = await generarCorrida({
    teamId: auth.teamId, periodo, tipo, descripcion, fechaPago, userId: auth.user.id,
  });

  if (!r.creada) {
    if (r.motivo === 'ya-existe') {
      return NextResponse.json({ error: `Ya existe una corrida ${tipo} para ${periodo}` }, { status: 409 });
    }
    return NextResponse.json({ error: 'No hay empleados activos para incluir en la corrida' }, { status: 400 });
  }

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(eq(nominaCorridas.id, r.corridaId))
    .limit(1);

  return NextResponse.json({ corrida }, { status: 201 });
}
