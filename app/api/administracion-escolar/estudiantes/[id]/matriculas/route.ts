import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { matriculasDeEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';

/** Historial de matrículas de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const matriculas = await matriculasDeEstudiante(auth.teamId, parseInt(id));
  return NextResponse.json({ matriculas });
}
