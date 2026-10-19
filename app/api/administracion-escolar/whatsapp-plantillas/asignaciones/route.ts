/**
 * PUT /api/administracion-escolar/whatsapp-plantillas/asignaciones
 *   { aviso, nombre }   — nombre vacío = volver al default de la plataforma
 *
 * Qué plantilla usa cada caso de uso (aviso). Una plantilla que todavía no está
 * aprobada queda como pendiente y se asigna sola al aprobarse. Las reglas viven
 * en plantillas-servicio.ts, las mismas que usa el asistente de IA.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { asignarAviso } from '@/lib/whatsapp/plantillas-servicio';

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => null);
  const r = await asignarAviso(auth.teamId, String(b?.aviso ?? ''), String(b?.nombre ?? ''));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, pendiente: r.pendiente });
}
