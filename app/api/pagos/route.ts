import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, registrarPago, getPagosDocumento } from '@/lib/db/queries';
import { getTurnoAbierto } from '@/lib/caja/core';

/**
 * Pagos de una factura — usa el ledger `pagos_recibidos` (source of truth).
 * GET  ?ecfDocumentId=ID  → lista pagos del doc.
 * POST { ecfDocumentId, monto (DOP), metodo, referencia?, notas?, fecha } → registra pago.
 */
export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const docId = req.nextUrl.searchParams.get('ecfDocumentId');
  if (!docId) return NextResponse.json([]);
  const pagos = await getPagosDocumento(teamId, Number(docId));
  return NextResponse.json(pagos);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const { ecfDocumentId, monto, metodo, referencia, notas, fecha } = await req.json();
  if (!ecfDocumentId || !monto || !fecha) {
    return NextResponse.json({ error: 'ecfDocumentId, monto y fecha son requeridos' }, { status: 400 });
  }

  // Cuadre de caja: atribuir el cobro al turno ABIERTO del cajero (si lo hay).
  const turno = await getTurnoAbierto(teamId, user.id);
  const turnoCajaId = turno?.estado === 'ABIERTO' ? turno.id : null;

  try {
    const result = await registrarPago({
      teamId,
      ecfDocumentId: Number(ecfDocumentId),
      montoCentavos: Math.round(Number(monto) * 100),
      metodo:        metodo ?? 'otro',
      referencia:    referencia ?? null,
      fechaPago:     String(fecha),
      notas:         notas ?? null,
      createdBy:     user.id,
      turnoCajaId,
    });
    return NextResponse.json(result.pago, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al registrar pago' }, { status: 422 });
  }
}
