import { NextRequest, NextResponse } from 'next/server';
import { LoteError, matricularLote } from '@/lib/administracion-escolar/matricula-lote';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';

/**
 * Matricular en lote: varios estudiantes en la MISMA sección, con el MISMO plan
 * de cobro. La regla vive en `matricularLote`; aquí solo se lee el cuerpo.
 *
 * Con `dryRun` no escribe nada: devuelve la revisión para enseñarla antes de
 * confirmar.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  // La revisión (dryRun) solo lee; crear de verdad mueve deuda cobrable y va con
  // el gate de escritura.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: !dryRun },
  );
  if (!auth.ok) return auth.response;

  const {
    periodoId, cursoId, fechaInscripcion, documentoListaId, notas, conceptos, estudianteIds,
  } = body ?? {};

  try {
    const respuesta = await matricularLote({
      teamId: auth.teamId,
      periodoId,
      cursoId,
      estudianteIds: Array.isArray(estudianteIds)
        ? [...new Set<number>(estudianteIds.map(Number).filter(Boolean))]
        : [],
      conceptos: Array.isArray(conceptos) ? conceptos.map(Number).filter(Boolean) : [],
      fechaInscripcion,
      documentoListaId,
      notas,
      dryRun,
    });
    if (!dryRun && respuesta.resumen.crear > 0) {
      logAudit({
        teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
        action: 'ESCOLAR_MATRICULAS_LOTE',
        resource: `curso:${cursoId}`,
        ip: getIp(req),
        meta: {
          origen: 'lote',
          creadas: respuesta.resumen.crear,
          fechaInscripcion: fechaInscripcion ?? null,
          matriculas: respuesta.resultados.filter((x) => x.resultado === 'creada').map((x) => x.matriculaId),
        },
      });
    }
    return NextResponse.json(respuesta);
  } catch (err) {
    if (err instanceof LoteError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
