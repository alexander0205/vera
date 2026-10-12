import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { METODO_PAGO_VALUES } from '@/lib/pagos/metodos';
import {
  ESTADOS_SOLICITUD, SolicitudPagoError, crearSolicitud, listarSolicitudes, type EstadoSolicitud,
} from '@/lib/contabilidad/solicitudes-pago';
import { parseMontoPesos } from '@/lib/nomina/conceptos';

export const dynamic = 'force-dynamic';

const error = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

/** GET /api/contabilidad/cuentas-por-pagar/solicitudes[?estado=] — la lista y lo disponible para decidir. */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const e = req.nextUrl.searchParams.get('estado');
  if (e !== null && !(ESTADOS_SOLICITUD as readonly string[]).includes(e)) return error('Estado inválido');
  return NextResponse.json(await listarSolicitudes(auth.teamId, (e as EstadoSolicitud | null) ?? undefined));
}

/** POST — { compraId, monto (RD$), metodo, cuentaSalidaId?, nota? }. Pide un pago; no mueve dinero. */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return error('Cuerpo inválido');

  const compraId = typeof b.compraId === 'number' ? b.compraId : NaN;
  if (!Number.isSafeInteger(compraId) || compraId <= 0) return error('Elige la compra');
  const monto = parseMontoPesos(b.monto);
  if (!monto.ok) return error(monto.error);
  if (typeof b.metodo !== 'string' || !(METODO_PAGO_VALUES as readonly string[]).includes(b.metodo)) return error('Método de pago inválido');
  let cuentaSalidaId: number | null = null;
  if (b.cuentaSalidaId !== undefined && b.cuentaSalidaId !== null) {
    if (typeof b.cuentaSalidaId !== 'number' || !Number.isSafeInteger(b.cuentaSalidaId) || b.cuentaSalidaId <= 0) return error('Cuenta de salida inválida');
    cuentaSalidaId = b.cuentaSalidaId;
  }
  const nota = typeof b.nota === 'string' ? b.nota.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g, '').trim().slice(0, 300) || null : null;

  try {
    const id = await crearSolicitud({ teamId: auth.teamId, userId: auth.user.id, compraId, montoCents: monto.cents, metodo: b.metodo, cuentaSalidaId, nota });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof SolicitudPagoError) return error(e.message, e.status);
    throw e;
  }
}
