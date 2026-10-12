import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { checklistDeMatricula } from '@/lib/administracion-escolar/documentos';

/**
 * GET /api/administracion-escolar/documentos/checklist?matriculaId=N
 *
 * El checklist es de la MATRÍCULA, no del estudiante: lo que se exige depende
 * del nivel y de si es nuevo ingreso o reinscripción, y las dos cosas cambian
 * de un período a otro. La pestaña del estudiante pide la del período que
 * tenga elegido en su filtro global.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const matriculaId = Number(req.nextUrl.searchParams.get('matriculaId'));
  if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
    return NextResponse.json({ error: 'matriculaId inválido' }, { status: 400 });
  }

  const checklist = await checklistDeMatricula(auth.teamId, matriculaId);
  if (!checklist) {
    return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });
  }

  return NextResponse.json(checklist);
}
