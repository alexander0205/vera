import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { registrarPagoProveedor, PagoProveedorError } from '@/lib/contabilidad/cuentas-por-pagar';
import { METODO_PAGO_VALUES } from '@/lib/pagos/metodos';
const schema=z.object({montoDOP:z.number().positive(),metodo:z.enum(METODO_PAGO_VALUES),fechaPago:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),referencia:z.string().max(100).optional(),notas:z.string().max(500).optional()});
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) { const a=await requirePermission('contabilidad:gestionar'); if(!a.ok)return a.response; const p=schema.safeParse(await req.json()); if(!p.success)return NextResponse.json({error:'Datos inválidos'},{status:400}); const id=Number((await params).id); if(!Number.isInteger(id))return NextResponse.json({error:'ID inválido'},{status:400}); try { return NextResponse.json({ok:true,...await registrarPagoProveedor({teamId:a.teamId,compraId:id,montoCents:Math.round(p.data.montoDOP*100),metodo:p.data.metodo,fechaPago:p.data.fechaPago,referencia:p.data.referencia,notas:p.data.notas,userId:a.user.id})}); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Error interno'},{status:e instanceof PagoProveedorError?422:500}); } }
