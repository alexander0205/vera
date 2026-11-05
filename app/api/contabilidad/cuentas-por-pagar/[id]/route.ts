import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { getPagosProveedor } from '@/lib/contabilidad/cuentas-por-pagar';
import { comprobantesDePagos } from '@/lib/contabilidad/comprobante-pago';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) { const a=await requirePermission('contabilidad:ver');if(!a.ok)return a.response;const id=Number((await params).id);if(!Number.isInteger(id))return NextResponse.json({error:'ID inválido'},{status:400});const pagos=await getPagosProveedor(a.teamId,id);const comp=await comprobantesDePagos(a.teamId,pagos.map(p=>Number(p.id)));return NextResponse.json({pagos:pagos.map(p=>{const c=comp.get(Number(p.id));return {...p,comprobante:c?{nombre:c.nombre,mime:c.mime,lectura:c.lectura}:null};})}); }
