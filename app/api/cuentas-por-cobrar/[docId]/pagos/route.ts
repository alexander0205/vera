/**
 * GET    /api/cuentas-por-cobrar/[docId]/pagos       — Lista pagos del doc
 * POST   /api/cuentas-por-cobrar/[docId]/pagos       — Registra pago
 *
 * Body POST:
 *   { montoCentavos, metodo, fechaPago, referencia?, cuenta?, notas? }
 *   o
 *   { montoDOP, metodo, fechaPago, ... }  (centavos derivado de DOP)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser, getPagosDocumento, registrarPago } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';
import { logAudit, getIp } from '@/lib/audit';

const METODOS_VALIDOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito', 'otro'] as const;

const schema = z.object({
  montoCentavos: z.number().int().positive().optional(),
  montoDOP:      z.number().positive().optional(),
  metodo:        z.enum(METODOS_VALIDOS),
  referencia:    z.string().max(100).optional(),
  cuenta:        z.string().max(100).optional(),
  fechaPago:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas:         z.string().max(500).optional(),
}).refine(d => d.montoCentavos || d.montoDOP, {
  message: 'Debes proveer montoCentavos o montoDOP',
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { docId } = await params;
  const docIdNum = parseInt(docId);
  if (isNaN(docIdNum)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const pagos = await getPagosDocumento(teamId, docIdNum);
  return NextResponse.json({ pagos });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    // Permiso: registrar pago requiere poder crear facturas (vendedor o superior)
    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);

    if (!userCan(user.platformRole, member?.role, 'facturas:crear')) {
      return NextResponse.json({ error: 'Sin permiso para registrar pagos' }, { status: 403 });
    }

    const { docId } = await params;
    const docIdNum = parseInt(docId);
    if (isNaN(docIdNum)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const body   = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const montoCentavos = data.montoCentavos ?? Math.round((data.montoDOP ?? 0) * 100);

    const result = await registrarPago({
      teamId,
      ecfDocumentId: docIdNum,
      montoCentavos,
      metodo:        data.metodo,
      referencia:    data.referencia,
      cuenta:        data.cuenta,
      fechaPago:     data.fechaPago,
      notas:         data.notas,
      createdBy:     user.id,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'PAGO_REGISTRADO',
      resource: `doc:${docIdNum}`,
      ip:       getIp(req),
      meta:     { montoCentavos, metodo: data.metodo, saldoNuevo: result.saldoNuevo },
    });

    return NextResponse.json({
      ok: true,
      pagoId:        result.pago.id,
      saldoAnterior: result.saldoAnterior,
      saldoNuevo:    result.saldoNuevo,
      montoTotal:    result.montoTotal,
      saldado:       result.saldoNuevo === 0,
    });
  } catch (err) {
    console.error('[POST /api/cuentas-por-cobrar/.../pagos]', err);
    const mensaje = err instanceof Error ? err.message : 'Error interno';
    const status  = /no encontrado|excede saldo|positivo/i.test(mensaje) ? 422 : 500;
    return NextResponse.json({ error: mensaje }, { status });
  }
}
