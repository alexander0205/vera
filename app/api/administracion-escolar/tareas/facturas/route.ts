/**
 * Las facturas y notas de la familia de un alumno, para elegir la relacionada
 * al crear una tarea.
 *
 *   GET ?estudianteId=N → { documentos: [{ id, codigo, tipoEcf, fecha, montoTotal, anulado }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { documentosDeLaFamilia, familiaDe } from '@/lib/administracion-escolar/tareas';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const estudianteId = Number(req.nextUrl.searchParams.get('estudianteId'));
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) {
    return NextResponse.json({ error: 'Falta el alumno' }, { status: 400 });
  }
  const fam = await familiaDe(auth.teamId, estudianteId);
  if (!fam) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ documentos: await documentosDeLaFamilia(auth.teamId, fam) });
}
