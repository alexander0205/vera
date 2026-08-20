import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { pagosDeEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';

/**
 * Cobros de un estudiante (más reciente primero). Fuente de verdad: el ledger
 * `pagos_recibidos` de las facturas vinculadas a sus cargos (no un pago escolar
 * paralelo). Regla del negocio: todo cobro vive en el motor de facturación.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const pagos = await pagosDeEstudiante(auth.teamId, parseInt(id));
  return NextResponse.json({ pagos });
}
