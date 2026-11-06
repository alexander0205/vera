import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { ayudaConciliar } from '@/lib/contabilidad/conciliacion-ayuda';
import { ConciliacionError } from '@/lib/contabilidad/conciliacion';
import { crearLlamadaModelo, iaConciliacionDisponible, permitirIa } from '@/lib/contabilidad/conciliacion-ia-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** GET — ¿hay IA para las sugerencias? (interruptor encendido y hay modelo). El botón se enseña igual: la parte gratis no la necesita. */
export async function GET() {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ disponible: iaConciliacionDisponible() });
}

/**
 * POST { cuentaId } — «Ayúdame a conciliar»: primero lo gratis (cargos del banco,
 * pistas de suma), luego la IA solo para lo que queda. NO aplica nada: devuelve
 * sugerencias que la persona acepta o descarta.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { cuentaId?: unknown } | null;
  const cuentaId = Number(body?.cuentaId);
  if (!Number.isSafeInteger(cuentaId) || cuentaId <= 0) return NextResponse.json({ error: 'Elige una cuenta' }, { status: 400 });

  // Lo gratis (cargos del banco, pistas de suma, resumen) va siempre. La IA solo con interruptor, modelo y cupo.
  let llamar: ReturnType<typeof crearLlamadaModelo> | null = null;
  let avisoCupo: string | null = null;
  if (iaConciliacionDisponible()) {
    const permiso = await permitirIa('ayuda', auth.teamId);
    if (permiso.ok) llamar = crearLlamadaModelo({ teamId: auth.teamId, userId: auth.user.id });
    else avisoCupo = permiso.mensaje;
  }

  try {
    const r = await ayudaConciliar(auth.teamId, cuentaId, llamar);
    if (avisoCupo) r.ia.error = avisoCupo;
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO',
      resource: `ayuda-conciliar:${cuentaId}`, ip: getIp(req),
      meta: { cuentaId, metodo: 'ia', modelo: r.ia.modelo, filas: r.ia.lineas, sugerencias: r.sugerencias.length, error: r.ia.error },
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
