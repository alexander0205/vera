/**
 * POST /api/facturas/[id]/pago — Registrar o actualizar el pago recibido
 * de una factura existente. Valida team membership y existencia.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

const METODOS_VALIDOS = new Set([
  'efectivo',
  'transferencia',
  'tarjeta_credito',
  'tarjeta_debito',
  'cheque',
]);

interface PagoBody {
  recibido: boolean;
  metodo?: string | null;
  cuenta?: string | null;
  valor?: number | string | null;  // valor en DOP (no centavos)
  fecha?: string | null;            // YYYY-MM-DD
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa activa' }, { status: 403 });

  const { id } = await params;
  const docId = parseInt(id);
  if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let body: PagoBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Validar membresía y existencia
  const [doc] = await db
    .select({ id: ecfDocuments.id, estado: ecfDocuments.estado })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  // No permitir editar pago en facturas anuladas
  if (doc.estado === 'ANULADO') {
    return NextResponse.json(
      { error: 'No se puede registrar pagos en una factura anulada' },
      { status: 409 },
    );
  }

  // Normalizar
  const recibido = Boolean(body.recibido);

  if (!recibido) {
    // Limpiar pago
    await db
      .update(ecfDocuments)
      .set({
        pagoRecibido: 'false',
        pagoMetodo:   null,
        pagoCuenta:   null,
        pagoValorCts: 0,
        pagoFecha:    null,
        updatedAt:    new Date(),
      })
      .where(eq(ecfDocuments.id, docId));

    return NextResponse.json({ ok: true, recibido: false });
  }

  const metodo = (body.metodo ?? 'efectivo').toString().trim();
  if (!METODOS_VALIDOS.has(metodo)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 });
  }

  const valorNum =
    typeof body.valor === 'number'
      ? body.valor
      : parseFloat(String(body.valor ?? '0'));
  if (!Number.isFinite(valorNum) || valorNum < 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
  }
  const valorCts = Math.round(valorNum * 100);

  const cuenta = body.cuenta ? String(body.cuenta).slice(0, 100) : null;

  // Validar fecha YYYY-MM-DD si viene
  let fecha = body.fecha ? String(body.fecha).slice(0, 10) : null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    fecha = null;
  }

  await db
    .update(ecfDocuments)
    .set({
      pagoRecibido: 'true',
      pagoMetodo:   metodo,
      pagoCuenta:   cuenta,
      pagoValorCts: valorCts,
      pagoFecha:    fecha,
      updatedAt:    new Date(),
    })
    .where(eq(ecfDocuments.id, docId));

  return NextResponse.json({
    ok: true,
    recibido: true,
    metodo,
    cuenta,
    valorCts,
    fecha,
  });
}
