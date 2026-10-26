/**
 * GET /api/asistente/alertas → { alertas: Alerta[] | null }
 *
 * Lo que conviene atender hoy: facturas rechazadas por la DGII, secuencias por
 * agotarse o vencer, certificado por vencer. Se arma con las mismas rutas de la
 * app y la sesión de quien pregunta (ve lo que ve su pantalla).
 *
 * Se limita a una consulta cada 15 minutos por persona: el panel guarda el
 * resultado y esta ruta no debe martillar la API ni llenar la auditoría.
 * Cuando no toca, responde `alertas: null` y el panel conserva las que ya tenía.
 */

import { NextRequest, NextResponse } from 'next/server';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { crearClienteApi, ErrorApi } from '@/lib/asistente/api';
import { construirAlertas, type SecuenciaApi } from '@/lib/asistente/alertas';
import { hoyRd } from '@/lib/asistente/util';
import { rateLimitDb } from '@/lib/rate-limit';

interface ListaFacturas { docs?: unknown[]; total?: number }

export async function GET(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente_alertas:${teamId}:${user.id}`, 1, 15 * 60_000);
  if (!rl.allowed) return NextResponse.json({ alertas: null, espera: true });

  const api = crearClienteApi({ origen: req.nextUrl.origin, cookie: req.headers.get('cookie') });
  const hoy = hoyRd();
  // Cada consulta falla sola: sin permiso o sin módulo, simplemente no aporta alertas.
  const seguro = async <T,>(f: () => Promise<T>, defecto: T): Promise<T> => {
    try { return await f(); } catch (e) { if (!(e instanceof ErrorApi)) console.warn('[asistente/alertas]', e); return defecto; }
  };

  const [rechazadas, enProceso, secuencias, certificado] = await Promise.all([
    seguro(() => api.get<ListaFacturas>('/api/facturas', { estado: 'RECHAZADO', limit: 1, offset: 0 }), {} as ListaFacturas),
    seguro(() => api.get<ListaFacturas>('/api/facturas', { estado: 'EN_PROCESO', limit: 1, offset: 0 }), {} as ListaFacturas),
    seguro(() => api.get<{ sequences?: SecuenciaApi[] }>('/api/secuencias'), {} as { sequences?: SecuenciaApi[] }),
    seguro(() => api.get<{ tieneCertificado: boolean; vencimiento?: string | null }>('/api/equipo/certificado'), null),
  ]);

  return NextResponse.json({
    alertas: construirAlertas({
      hoy,
      rechazadas: Number(rechazadas.total ?? 0),
      enProceso: Number(enProceso.total ?? 0),
      secuencias: secuencias.sequences ?? [],
      certificado,
    }),
  });
}
