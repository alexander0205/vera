import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { getPagosProveedor } from '@/lib/contabilidad/cuentas-por-pagar';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) { const a=await requirePermission('contabilidad:ver');if(!a.ok)return a.response;const id=Number((await params).id);if(!Number.isInteger(id))return NextResponse.json({error:'ID inválido'},{status:400});return NextResponse.json({pagos:await getPagosProveedor(a.teamId,id)}); }
