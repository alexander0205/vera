import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { LoteError } from '@/lib/administracion-escolar/matricula-lote';
import {
  matricularSeccionDesdeSigerd, pendientesDesdeSigerd, type AlumnoDesdeSigerd,
} from '@/lib/administracion-escolar/matricular-desde-sigerd';

// Una sección grande son decenas de matrículas, cada una en su transacción.
export const maxDuration = 300;

/**
 * «Tienes X alumnos de SIGERD sin matricular»: el aviso y la pantalla
 * «Matricular desde SIGERD» (`/escolar/matriculas/desde-sigerd`).
 *
 * GET cuenta y agrupa por sección. POST matricula UNA sección con lo que la
 * pantalla dejó para cada alumno: la pantalla llama una vez por sección. Ver
 * `matricular-desde-sigerd.ts` para qué entra y qué se deja fuera.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await pendientesDesdeSigerd(auth.teamId));
}

export async function POST(req: NextRequest) {
  // Crea matrículas con sus cargos: mueve deuda cobrable, va con el gate de escritura.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: true },
  );
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as {
    cursoId?: unknown; fechaInscripcion?: unknown; alumnos?: unknown;
  } | null;
  const cursoId = Number(body?.cursoId);
  if (!Number.isInteger(cursoId) || cursoId <= 0 || !Array.isArray(body?.alumnos)) {
    return NextResponse.json({ error: 'Sección y alumnos son requeridos' }, { status: 400 });
  }

  const alumnos: AlumnoDesdeSigerd[] = (body.alumnos as Array<Record<string, unknown>>)
    .map((a) => ({
      estudianteId: Number(a?.estudianteId),
      conceptos: Array.isArray(a?.conceptos) ? (a.conceptos as unknown[]).map(Number).filter(Number.isInteger) : [],
      precios: Array.isArray(a?.precios)
        ? (a.precios as Array<Record<string, unknown>>).map((p) => ({
            conceptoId: Number(p?.conceptoId), montoCentavos: Number(p?.montoCentavos),
          })).filter((p) => Number.isInteger(p.conceptoId) && Number.isFinite(p.montoCentavos))
        : [],
    }))
    .filter((a) => Number.isInteger(a.estudianteId) && a.estudianteId > 0);

  // Un precio propio es una tarifa: lo pone quien puede tocar Tarifas, igual
  // que desde «Nueva matrícula» (que lo guarda por `POST /concepto-precios`).
  if (alumnos.some((a) => a.precios.length > 0)) {
    const tarifas = await requireModuleAndPermission(
      'escolar', 'administracion-escolar:configurar', { escritura: true },
    );
    if (!tarifas.ok) return tarifas.response;
  }

  try {
    return NextResponse.json(await matricularSeccionDesdeSigerd(auth.teamId, {
      cursoId,
      fechaInscripcion: String(body.fechaInscripcion ?? ''),
      alumnos,
    }));
  } catch (err) {
    if (err instanceof LoteError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
