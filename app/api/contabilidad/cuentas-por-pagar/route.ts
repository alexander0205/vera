import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { listarCuentasPorPagar } from '@/lib/contabilidad/cuentas-por-pagar';
export async function GET() { const a=await requirePermission('contabilidad:ver'); if(!a.ok)return a.response; return NextResponse.json(await listarCuentasPorPagar(a.teamId)); }
