import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { sincronizarSaldosDesdeFacturas } from '@/lib/administracion-escolar/queries';
import { cargosDeEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';

/** Cargos de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const estudianteId = parseInt(id);
  // Refleja el cobro de las facturas vinculadas en el saldo/estado de cada cargo.
  await sincronizarSaldosDesdeFacturas(teamId, estudianteId);
  const cargos = await cargosDeEstudiante(teamId, estudianteId);
  return NextResponse.json({ cargos });
}
