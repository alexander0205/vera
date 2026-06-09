/**
 * GET    /api/cuentas-por-cobrar/[docId]/pagos       — Lista pagos del doc
 * POST   /api/cuentas-por-cobrar/[docId]/pagos       — Registra pago
 *
 * Body POST:
 *   { montoCentavos, metodo, fechaPago, referencia?, cuenta?, notas? }
 *   o
 *   { montoDOP, metodo, fechaPago, ... }  (centavos derivado de DOP)
 *   o  (pago dividido / split — varios métodos en una transacción)
 *   { pagos: [{ montoDOP, metodo, referencia?, cuenta?, notas? }, ...], fechaPago }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser, getPagosDocumento, registrarPagoFacturaConMora } from '@/lib/db/queries';
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

// Body de pago dividido (split): varios métodos en una sola transacción.
const splitLineaSchema = z.object({
  montoCentavos: z.number().int().positive().optional(),
  montoDOP:      z.number().positive().optional(),
  metodo:        z.enum(METODOS_VALIDOS),
  referencia:    z.string().max(100).optional(),
  cuenta:        z.string().max(100).optional(),
  notas:         z.string().max(500).optional(),
}).refine(d => d.montoCentavos || d.montoDOP, {
  message: 'Cada línea debe proveer montoCentavos o montoDOP',
});

const splitSchema = z.object({
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pagos:     z.array(splitLineaSchema).min(1),
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

    const body = await req.json();

    // Normalizar el body a una lista de líneas {metodo, montoCentavos, ...}.
    // Single → 1 línea; split (array `pagos`) → N líneas. La distribución
    // factura→mora la hace registrarPagoFacturaConMora.
    let lineas: Array<{
      montoCentavos: number;
      metodo:        string;
      referencia?:   string | null;
      cuenta?:       string | null;
      notas?:        string | null;
    }>;
    let fechaPago: string;
    let esSplit = false;

    if (body && Array.isArray((body as { pagos?: unknown }).pagos)) {
      const parsedSplit = splitSchema.safeParse(body);
      if (!parsedSplit.success) {
        return NextResponse.json({ error: 'Datos inválidos', detalles: parsedSplit.error.flatten() }, { status: 400 });
      }
      const split = parsedSplit.data;
      fechaPago = split.fechaPago;
      esSplit   = true;
      lineas = split.pagos.map(p => ({
        montoCentavos: p.montoCentavos ?? Math.round((p.montoDOP ?? 0) * 100),
        metodo:        p.metodo,
        referencia:    p.referencia,
        cuenta:        p.cuenta,
        notas:         p.notas,
      }));
    } else {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
      }
      const data = parsed.data;
      fechaPago = data.fechaPago;
      lineas = [{
        montoCentavos: data.montoCentavos ?? Math.round((data.montoDOP ?? 0) * 100),
        metodo:        data.metodo,
        referencia:    data.referencia,
        cuenta:        data.cuenta,
        notas:         data.notas,
      }];
    }

    const totalCentavos = lineas.reduce((s, l) => s + l.montoCentavos, 0);

    const result = await registrarPagoFacturaConMora({
      teamId,
      ecfDocumentId: docIdNum,
      fechaPago,
      createdBy:     user.id,
      lineas,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'PAGO_REGISTRADO',
      resource: `doc:${docIdNum}`,
      ip:       getIp(req),
      meta:     {
        split:        esSplit,
        totalCentavos,
        metodos:      lineas.map(l => l.metodo),
        saldoNuevo:   result.saldoNuevo,
        repartido:    result.repartido,
      },
    });

    return NextResponse.json({
      ok:         true,
      saldoNuevo: result.saldoNuevo,
      saldado:    result.saldado,
      repartido:  result.repartido,
    });
  } catch (err) {
    console.error('[POST /api/cuentas-por-cobrar/.../pagos]', err);
    const mensaje = err instanceof Error ? err.message : 'Error interno';
    const status  = /no encontrado|excede|positivo|método/i.test(mensaje) ? 422 : 500;
    return NextResponse.json({ error: mensaje }, { status });
  }
}
