import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { cuentasBanco } from '@/lib/contabilidad/bancos';

export const dynamic = 'force-dynamic';

/** GET /api/contabilidad/bancos/cuentas — las cajas y bancos de la empresa. */
export async function GET() {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const cuentas = await cuentasBanco(auth.teamId);
  return NextResponse.json({ cuentas: cuentas.filter((c) => c.activa && c.imputable) });
}
