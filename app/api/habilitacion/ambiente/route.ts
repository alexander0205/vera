/**
 * POST /api/habilitacion/ambiente
 *
 * Cambia el ambiente del contribuyente propio en ecf-api (source of truth
 * del ambiente — no se duplica en la DB de vera). Usado al pasar de la Fase
 * 0 (Postulación) a la Fase 1 (Pruebas de Datos e-CF): TesteCF → CerteCF.
 *
 * Body: { ambiente: 'TesteCF' | 'CerteCF' | 'Produccion' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { contribuyentes, EcfApiError } from '@/lib/ecf-api/client';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';

const schema = z.object({
  ambiente: z.enum(['TesteCF', 'CerteCF', 'Produccion']),
});

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  try {
    const cp = await ensureContribuyente(teamId);
    console.log(`[habilitacion/ambiente] team ${teamId} (${cp}) → ${parsed.data.ambiente}`);
    const contrib = await contribuyentes.update(cp, { ambiente: parsed.data.ambiente });
    console.log(`[habilitacion/ambiente] team ${teamId} ambiente confirmado: ${contrib.ambiente}`);
    return NextResponse.json({ ok: true, ambiente: contrib.ambiente });
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json({ error: 'Empresa sin contribuyente vinculado.' }, { status: 422 });
    }
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al actualizar el ambiente', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/ambiente POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
