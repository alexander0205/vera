/**
 * GET /api/administracion-escolar/estudiantes/[id]/ficha
 *
 * Todo lo que pinta el perfil del estudiante en una sola respuesta: ficha,
 * matrículas, cargos, pagos, tutores y el plan de cobro de cada matrícula.
 *
 * Sustituye a las cinco peticiones que hacía la pantalla (más una por el plan).
 * Los endpoints sueltos siguen ahí —los usan otras pantallas y las recargas
 * parciales— pero comparten las mismas consultas, en lib/administracion-escolar
 * /ficha-estudiante.ts, para que no se separen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { fichaEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const estudianteId = parseInt(id);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const ficha = await fichaEstudiante(auth.teamId, estudianteId);
  if (!ficha) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json(ficha);
}
