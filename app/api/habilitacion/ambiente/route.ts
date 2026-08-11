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
import { requirePermission } from '@/lib/auth/api-guard';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { contribuyentes, EcfApiError } from '@/lib/ecf-api/client';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { eq, sql } from 'drizzle-orm';

const schema = z.object({
  ambiente: z.enum(['TesteCF', 'CerteCF', 'Produccion']),
});

export async function POST(request: NextRequest) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla. Sin esto, cualquier miembro con
  // sesión podía arrancarla por API aunque no viera el enlace.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  try {
    const cp = await ensureContribuyente(teamId);
    console.log(`[habilitacion/ambiente] team ${teamId} (${cp}) → ${parsed.data.ambiente}`);
    const contrib = await contribuyentes.update(cp, { ambiente: parsed.data.ambiente });
    console.log(`[habilitacion/ambiente] team ${teamId} ambiente confirmado: ${contrib.ambiente}`);

    // El ambiente sigue viviendo solo en ecf-api (no se duplica su valor acá).
    // Pero cuando pasa a Produccion marcamos localmente habilitacionCompletadoAt
    // — es la señal barata que el sidebar usa para mover el link del wizard
    // a Configuración sin tener que consultar ecf-api en cada render del nav.
    // COALESCE: no pisa la fecha si el team ya estaba marcado.
    if (contrib.ambiente === 'Produccion') {
      await db.update(teams)
        .set({ habilitacionCompletadoAt: sql`coalesce(${teams.habilitacionCompletadoAt}, now())` })
        .where(eq(teams.id, teamId));
    }

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
