import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { contextoDeSeccion } from '@/lib/administracion-escolar/tarifas';
import { armarPlanDeCobro } from '@/lib/administracion-escolar/plan-cobro';

/**
 * Qué va a deber un alumno si se matricula en esta sección.
 *
 * Lo consume la pantalla de matrícula mientras la secretaria elige, antes de
 * que exista ninguna fila: por eso recibe la sección suelta en vez de un id de
 * matrícula. Solo lee — no crea cargos ni cobra nada.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams;
  const periodoId = Number(q.get('periodoId'));
  const cursoId = Number(q.get('cursoId'));
  if (!periodoId || !cursoId) {
    return NextResponse.json({ error: 'Período y curso son obligatorios' }, { status: 400 });
  }

  // La fecha de inscripción decide qué cuotas ya vencieron. Sin ella se asume
  // hoy, que es lo que pasa cuando se matricula en el momento.
  const desde = q.get('desde') || new Date().toISOString().slice(0, 10);
  const becaTipo = q.get('becaTipo');
  const becaValorCrudo = Number(q.get('becaValor'));
  const becaValor = Number.isFinite(becaValorCrudo) && q.get('becaValor') ? becaValorCrudo : null;

  const ctx = await contextoDeSeccion(auth.teamId, periodoId, cursoId, {
    tipo: becaTipo,
    valor: becaValor,
  });
  if (!ctx) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });

  const lineas = await armarPlanDeCobro(auth.teamId, ctx, desde);
  return NextResponse.json({ lineas });
}
