/**
 * POST /api/metricas/factura-tiempo
 *
 * Cuánto tardó una factura en hacerse. Lo manda el formulario al guardar, con
 * el reloj que arrancó cuando se abrió.
 *
 * Por qué la mide el cliente y no el servidor: lo que interesa es el tiempo de
 * la PERSONA —desde que abre la pantalla hasta que termina—, y el servidor solo
 * ve el último milisegundo, la petición de emitir. Un formulario que se tarda
 * ocho minutos en llenar y uno que se tarda diez segundos llegan igual aquí.
 *
 * Es telemetría, no contabilidad: si falla, no rompe nada. Guardar una factura
 * no puede depender de que la métrica entre.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturaTiempos } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { getTeamForUser } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

/** Doce horas. Por encima es una pestaña que quedó abierta, no una factura. */
const TOPE_MS = 12 * 60 * 60 * 1000;
const ORIGENES = new Set(['escolar', 'formulario', 'pos', 'recurrente']);

export async function POST(req: NextRequest) {
  const sesion = await getSession();
  if (!sesion?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });

  const team = await getTeamForUser();
  if (!team) return NextResponse.json({ ok: false }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const ms = Number(b.ms);
  const origen = String(b.origen ?? 'formulario');

  // Se descarta en silencio en vez de devolver 400: al cliente no le sirve
  // enterarse, y una métrica mala no debe ensuciar el log de errores.
  if (!Number.isFinite(ms) || ms <= 0 || ms > TOPE_MS || !ORIGENES.has(origen)) {
    return NextResponse.json({ ok: true, guardado: false });
  }

  try {
    await db.insert(facturaTiempos).values({
      teamId: team.id,
      userId: sesion.user.id,
      ecfDocumentId: Number.isInteger(b.ecfDocumentId) ? b.ecfDocumentId : null,
      origen,
      ms: Math.round(ms),
      lineas: Number.isInteger(b.lineas) ? Math.min(b.lineas, 32767) : 0,
      montoCentavos: Number.isFinite(b.montoCentavos) ? Math.round(b.montoCentavos) : null,
      emitida: b.emitida === true,
    });
  } catch {
    // Telemetría: no rompe el flujo de quien acaba de facturar.
    return NextResponse.json({ ok: true, guardado: false });
  }

  return NextResponse.json({ ok: true, guardado: true });
}
