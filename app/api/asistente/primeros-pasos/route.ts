/**
 * GET /api/asistente/primeros-pasos → { primerosPasos: PrimerosPasos | null }
 *
 * La tarjeta de «primeros pasos» del panel: qué falta para la primera factura.
 * Solo lectura (conteos). Una consulta por minuto por persona; si no toca,
 * responde `null` y el panel conserva la que ya tenía.
 */

import { NextRequest, NextResponse } from 'next/server';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { crearClienteApi } from '@/lib/asistente/api';
import { leerEstadoConfiguracion } from '@/lib/asistente/estado-configuracion';
import { construirPrimerosPasos } from '@/lib/asistente/primeros-pasos';
import { rateLimitDb } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_primeros:${teamId}:${user.id}`, 6, 60_000);
  if (!rl.allowed) return NextResponse.json({ primerosPasos: null, espera: true });

  const api = crearClienteApi({ origen: req.nextUrl.origin, cookie: req.headers.get('cookie') });
  const estado = await leerEstadoConfiguracion(api);
  return NextResponse.json({ primerosPasos: construirPrimerosPasos(estado) });
}
