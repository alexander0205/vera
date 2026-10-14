/**
 * POST /api/asistente/confirmar { token } → { mensaje, enlace? }
 *
 * Único camino por el que una acción propuesta por el asistente se ejecuta, y
 * solo con la sesión de quien pulsa «Confirmar». Ver lib/asistente/acciones.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { construirContexto } from '@/lib/asistente/contexto';
import { crearClienteApi } from '@/lib/asistente/api';
import { confirmarAccion } from '@/lib/asistente/acciones';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const b = await req.json().catch(() => null);
  if (typeof b?.token !== 'string' || b.token.length < 20) {
    return NextResponse.json({ error: 'Falta la confirmación' }, { status: 400 });
  }

  try {
    const api = crearClienteApi({ origen: req.nextUrl.origin, cookie: req.headers.get('cookie') });
    const ctx = await construirContexto(teamId, user.platformRole, acceso.teamRole, api);
    const r = await confirmarAccion(ctx, user.id, b.token);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    logAudit({
      teamId, userId: user.id, actor: user.email, action: 'ASISTENTE_ACCION_CONFIRMADA',
      resource: r.nombre, meta: { tipo: r.tipo, resumen: r.resumen },
    });
    return NextResponse.json({ mensaje: r.mensaje, enlace: r.enlace });
  } catch (e) {
    console.error('[asistente/confirmar]', e);
    return NextResponse.json({ error: 'No se pudo completar la acción. No se hizo ningún cambio confirmado; revisa e intenta de nuevo.' }, { status: 500 });
  }
}
