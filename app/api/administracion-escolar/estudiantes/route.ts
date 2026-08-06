import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  listarEstudiantesEnriquecidos,
  estadisticasEstudiantes,
  generarCodigoEstudiante,
} from '@/lib/administracion-escolar/queries';
import { SEXOS_VALIDOS } from '@/lib/administracion-escolar/estudiante-utils';
import { limpiarCamposSigerd } from '@/lib/administracion-escolar/estudiante-sigerd-campos';
import { eq, and } from 'drizzle-orm';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

/**
 * Listado paginado. Params: `q` (búsqueda), `estado`, `cursoId`, `limit`,
 * `offset`. Devuelve `{ estudiantes, total, stats }` — `stats` es global del
 * team (no depende de la página ni de los filtros).
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const sp = req.nextUrl.searchParams;
  const cursoId = Number(sp.get('cursoId')) || null;
  const limit = Number(sp.get('limit')) || 25;
  const offset = Number(sp.get('offset')) || 0;
  const { estudiantes, total } = await listarEstudiantesEnriquecidos(teamId, {
    q: sp.get('q') ?? undefined,
    estado: sp.get('estado') ?? undefined,
    cursoId,
    limit,
    offset,
  });
  const stats = await estadisticasEstudiantes(teamId);
  return NextResponse.json({ estudiantes, total, stats });
}

/**
 * Alta de estudiante. El `codigo` NO se recibe: se genera automáticamente
 * (`AAAA-####`) ligado al año de la PRIMERA inscripción. Por eso el alta crea
 * también la primera matrícula (periodo + curso) en un mismo flujo. Si no viene
 * `matricula`, el estudiante se crea sin código (se le asignará al inscribirlo).
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const body = await req.json();
  const { nombres, apellidos, sexo, fechaNacimiento, estado, matricula } = body;
  if (!nombres?.trim()) return NextResponse.json({ error: 'Nombres requeridos' }, { status: 400 });
  if (!apellidos?.trim()) return NextResponse.json({ error: 'Apellidos requeridos' }, { status: 400 });
  // Campos extra de la ficha (todos opcionales).
  const extra = limpiarCamposSigerd(body);

  // Validar la matrícula (opcional) antes de tocar nada.
  let periodoId: number | null = null;
  let cursoId: number | null = null;
  let fechaInscripcion: string | null = null;
  if (matricula) {
    periodoId = Number(matricula.periodoId) || null;
    cursoId = Number(matricula.cursoId) || null;
    if (!periodoId || !cursoId) {
      return NextResponse.json({ error: 'Periodo y curso son requeridos para la matrícula' }, { status: 400 });
    }
    const [per] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
    if (!per) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 });
    const [cur] = await db.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
      .where(and(eq(adminEscolarCursos.id, cursoId), eq(adminEscolarCursos.teamId, teamId))).limit(1);
    if (!cur) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    fechaInscripcion = matricula.fechaInscripcion || new Date().toISOString().slice(0, 10);
  }

  // Código auto ligado al año de la primera inscripción (o el año en curso si
  // aún no se inscribe).
  const anioCodigo = fechaInscripcion ? parseInt(fechaInscripcion.slice(0, 4), 10) : new Date().getFullYear();
  const codigo = matricula ? await generarCodigoEstudiante(teamId, anioCodigo) : null;

  const [row] = await db.insert(adminEscolarEstudiantes).values({
    teamId,
    codigo,
    nombres: nombres.trim(),
    apellidos: apellidos.trim(),
    sexo: SEXOS_VALIDOS.includes(sexo) ? sexo : null,
    fechaNacimiento: fechaNacimiento || null,
    estado: ESTADOS.includes(estado) ? estado : 'activo',
    ...extra,
  }).returning();

  if (matricula && periodoId && cursoId) {
    await db.insert(adminEscolarMatriculas).values({
      teamId,
      estudianteId: row.id,
      periodoId,
      cursoId,
      fechaInscripcion,
      estado: 'activa',
    });
  }

  return NextResponse.json({ estudiante: row });
}
