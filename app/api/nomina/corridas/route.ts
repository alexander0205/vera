import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { generarCorrida } from '@/lib/nomina/generar-corrida';
import { frecuenciaDeTipo, normalizarTipoCorrida, LABEL_TIPO_CORRIDA } from '@/lib/nomina/corrida';
import { esFechaYMD, rangoLegible } from '@/lib/nomina/periodos';

export const dynamic = 'force-dynamic';

/** GET /api/nomina/corridas — lista las corridas del team, recientes primero. */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select()
    .from(nominaCorridas)
    .where(eq(nominaCorridas.teamId, auth.teamId))
    .orderBy(desc(nominaCorridas.fechaInicio), desc(nominaCorridas.id));

  return NextResponse.json({ corridas: filas });
}

/**
 * POST /api/nomina/corridas — crea una corrida en borrador para un rango de
 * fechas: la mensual y las quincenas se piden con `periodo` ('YYYY-MM'), la
 * semanal con `fechaInicio` ('YYYY-MM-DD'). Entran los empleados que cobran con
 * esa frecuencia, cada uno por los días que trabajó del rango. No paga ni asienta
 * nada; eso es aprobar/pagar.
 */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const tipo = normalizarTipoCorrida(body.tipo ?? 'mensual');
  if (!tipo) {
    return NextResponse.json(
      { error: 'Tipo de corrida inválido. Usa mensual, quincenal-1, quincenal-2 o semanal.' },
      { status: 400 },
    );
  }
  const fechaPago = String(body.fechaPago ?? '').trim() || null;
  if (fechaPago !== null && !esFechaYMD(fechaPago)) {
    return NextResponse.json({ error: 'Fecha de pago inválida' }, { status: 400 });
  }

  const r = await generarCorrida({
    teamId: auth.teamId,
    tipo,
    periodo: typeof body.periodo === 'string' ? body.periodo.trim() : undefined,
    fechaInicio: typeof body.fechaInicio === 'string' ? body.fechaInicio.trim() : undefined,
    descripcion: String(body.descripcion ?? ''),
    fechaPago,
    userId: auth.user.id,
  });

  if (!r.creada) {
    if (r.motivo === 'periodo-invalido') {
      const error = tipo === 'semanal'
        ? 'Indica el primer día de la semana (YYYY-MM-DD)'
        : 'Período inválido (formato YYYY-MM)';
      return NextResponse.json({ error }, { status: 400 });
    }
    if (r.motivo === 'ya-existe') {
      const choca = r.existente ?? { tipo, fechaInicio: r.periodo.inicio, fechaFin: r.periodo.fin };
      const etiqueta = (LABEL_TIPO_CORRIDA[choca.tipo] ?? choca.tipo).toLowerCase();
      return NextResponse.json(
        { error: `Ya existe una corrida ${etiqueta} del ${rangoLegible({ inicio: choca.fechaInicio, fin: choca.fechaFin })}`, corridaId: r.existente?.id ?? null },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `No hay empleados con pago ${frecuenciaDeTipo(tipo)} que trabajen del ${rangoLegible(r.periodo)}` },
      { status: 400 },
    );
  }

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(eq(nominaCorridas.id, r.corridaId))
    .limit(1);

  return NextResponse.json({ corrida }, { status: 201 });
}
