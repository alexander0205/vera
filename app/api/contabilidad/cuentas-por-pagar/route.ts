import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { listarCuentasPorPagar, type CubetaCxP } from '@/lib/contabilidad/cuentas-por-pagar';
export async function GET(req:NextRequest) { const a=await requirePermission('contabilidad:ver'); if(!a.ok)return a.response; const s=new URL(req.url).searchParams; const c=s.get('cubeta'); return NextResponse.json(await listarCuentasPorPagar(a.teamId,{search:s.get('search')??undefined,estado:s.get('estado')==='vencidas'?'vencidas':s.get('estado')==='al-dia'?'al-dia':undefined,cubeta:['porVencer','d1a30','d31a60','d61a90','d90mas'].includes(c??'')?c as CubetaCxP:undefined,limit:Number(s.get('limit'))||undefined,offset:Number(s.get('offset'))||undefined})); }
