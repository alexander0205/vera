/**
 * POST /api/facturas/[id]/pago — Registra/actualiza el pago de una factura.
 *
 * Source of truth: ledger `pagos_recibidos` (vía registrarPago/syncPagoMirror).
 * Este endpoint es el "pago único" del detalle: reemplaza el pago del doc por
 * un solo movimiento. Para abonos parciales múltiples usar Cuentas por cobrar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { getUser, getTeamIdForUser, registrarPago, registrarPagosSplit, syncPagoMirror } from '@/lib/db/queries';
import { requireTurnoAbierto } from '@/lib/caja/guard';
import { METODOS_PAGO_SET } from '@/lib/pagos/metodos';
import { eq, and } from 'drizzle-orm';

// Fuente única: lib/pagos/metodos.
const METODOS_VALIDOS = METODOS_PAGO_SET;

interface PagoSplitLinea {
  metodo: string;
  valor?: number | string | null;   // DOP
  montoCentavos?: number | null;     // alternativa directa
  referencia?: string | null;
  cuenta?: string | null;
}

interface PagoBody {
  recibido: boolean;
  metodo?: string | null;
  cuenta?: string | null;
  valor?: number | string | null;  // valor en DOP (no centavos)
  fecha?: string | null;            // YYYY-MM-DD
  pagos?: PagoSplitLinea[];         // split: varias líneas de método
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
    .select({ id: ecfDocuments.id, estado: ecfDocuments.estado, montoTotal: ecfDocuments.montoTotal })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  if (doc.estado === 'ANULADO') {
    return NextResponse.json(
      { error: 'No se puede registrar pagos en una factura anulada' },
      { status: 409 },
    );
  }

  let fecha = body.fecha ? String(body.fecha).slice(0, 10) : null;
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fecha = new Date().toISOString().slice(0, 10);

  // Cuadre de caja: sin turno ABIERTO no se cobra. El cobro se atribuye al turno
  // para que el efectivo entre en el esperado del cierre; aceptarlo sin turno
  // metía dinero que ningún cierre reclama. Solo ABIERTO — un turno con
  // CIERRE_SOLICITADO ya tiene el esperado congelado.
  const guardCaja = await requireTurnoAbierto(teamId, user.id);
  if (!guardCaja.ok) {
    return NextResponse.json({ error: guardCaja.error, code: guardCaja.code }, { status: 409 });
  }
  const turnoCajaId = guardCaja.turno?.id ?? null;

  // ── SPLIT: varias líneas de método en una sola operación ─────────────────────
  if (Array.isArray(body.pagos)) {
    const lineas = body.pagos.map((p) => {
      const metodo = (p.metodo ?? 'efectivo').toString().trim();
      const cts = p.montoCentavos != null
        ? Math.round(p.montoCentavos)
        : Math.round((typeof p.valor === 'number' ? p.valor : parseFloat(String(p.valor ?? '0'))) * 100);
      return { metodo, montoCentavos: cts, referencia: p.referencia ?? null, cuenta: p.cuenta ?? null };
    });

    if (lineas.length === 0) {
      return NextResponse.json({ error: 'Sin líneas de pago' }, { status: 400 });
    }
    for (const l of lineas) {
      if (!METODOS_VALIDOS.has(l.metodo)) {
        return NextResponse.json({ error: `Método inválido: ${l.metodo}` }, { status: 400 });
      }
      if (!Number.isFinite(l.montoCentavos) || l.montoCentavos <= 0) {
        return NextResponse.json({ error: 'Cada línea debe tener monto positivo' }, { status: 400 });
      }
    }
    // El detalle es "reemplazo": limpia ledger del doc y re-inserta el split.
    await db.delete(pagosRecibidos).where(
      and(eq(pagosRecibidos.teamId, teamId), eq(pagosRecibidos.ecfDocumentId, docId)),
    );
    try {
      await registrarPagosSplit({ teamId, ecfDocumentId: docId, fechaPago: fecha, createdBy: user.id, turnoCajaId, pagos: lineas });
    } catch (e) {
      await syncPagoMirror(teamId, docId);
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al registrar split' }, { status: 422 });
    }
    return NextResponse.json({ ok: true, recibido: true, split: true, lineas: lineas.length });
  }

  const recibido = Boolean(body.recibido);

  // El detalle es "pago único": limpia el ledger del doc y reemplaza.
  await db.delete(pagosRecibidos).where(
    and(eq(pagosRecibidos.teamId, teamId), eq(pagosRecibidos.ecfDocumentId, docId)),
  );

  if (!recibido) {
    await syncPagoMirror(teamId, docId); // → inline pago* = 0/false
    return NextResponse.json({ ok: true, recibido: false });
  }

  const metodo = (body.metodo ?? 'efectivo').toString().trim();
  if (!METODOS_VALIDOS.has(metodo)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 });
  }

  const valorNum =
    typeof body.valor === 'number' ? body.valor : parseFloat(String(body.valor ?? '0'));
  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    await syncPagoMirror(teamId, docId);
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
  }
  const valorCts = Math.min(Math.round(valorNum * 100), doc.montoTotal);

  const cuenta = body.cuenta ? String(body.cuenta).slice(0, 100) : null;

  try {
    await registrarPago({
      teamId,
      ecfDocumentId: docId,
      montoCentavos: valorCts,
      metodo,
      cuenta,
      fechaPago:     fecha,
      createdBy:     user.id,
      turnoCajaId,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al registrar pago' }, { status: 422 });
  }

  return NextResponse.json({ ok: true, recibido: true, metodo, cuenta, valorCts, fecha });
}
