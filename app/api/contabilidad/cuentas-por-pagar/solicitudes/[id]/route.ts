import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import {
  SolicitudPagoError, aprobarSolicitud, cancelarSolicitud, pagarSolicitud, rechazarSolicitud,
} from '@/lib/contabilidad/solicitudes-pago';
import { esFechaYMD } from '@/lib/nomina/periodos';
import { fechaRazonable } from '@/lib/nomina/conceptos';

export const dynamic = 'force-dynamic';

const error = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

/**
 * PATCH /api/contabilidad/cuentas-por-pagar/solicitudes/[id]
 *   { accion: 'aprobar' | 'rechazar' | 'cancelar' | 'pagar', motivo?, fechaPago? }
 * Aprobar y rechazar son del dueño (contabilidad:configurar); cancelar y pagar,
 * de quien gestiona la contabilidad.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const idRaw = (await params).id;
  if (!/^\d{1,9}$/.test(idRaw)) return error('ID inválido');
  const id = Number(idRaw);
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return error('Cuerpo inválido');
  const accion = b.accion;
  if (accion !== 'aprobar' && accion !== 'rechazar' && accion !== 'cancelar' && accion !== 'pagar') return error('Acción inválida');

  const auth = await requirePermission(accion === 'aprobar' || accion === 'rechazar' ? 'contabilidad:configurar' : 'contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  try {
    if (accion === 'aprobar') await aprobarSolicitud(auth.teamId, id, auth.user.id);
    else if (accion === 'cancelar') await cancelarSolicitud(auth.teamId, id, auth.user.id);
    else if (accion === 'rechazar') {
      const motivo = typeof b.motivo === 'string' ? b.motivo.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g, '').trim().slice(0, 300) || null : null;
      await rechazarSolicitud(auth.teamId, id, auth.user.id, motivo);
    } else {
      if (!esFechaYMD(b.fechaPago) || !fechaRazonable(b.fechaPago)) return error('La fecha de pago no es válida');
      return NextResponse.json({ ok: true, ...(await pagarSolicitud(auth.teamId, id, auth.user.id, b.fechaPago)) });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SolicitudPagoError) return error(e.message, e.status);
    throw e;
  }
}
