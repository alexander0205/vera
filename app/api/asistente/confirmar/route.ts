/**
 * POST /api/asistente/confirmar { token, mensajeId? } → { mensaje, enlace? }
 *
 * Único camino por el que una acción propuesta por el asistente se ejecuta, y
 * solo con la sesión de quien pulsa «Confirmar». Ver lib/asistente/acciones.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes } from '@/lib/db/schema';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { construirContexto } from '@/lib/asistente/contexto';
import { crearClienteApi } from '@/lib/asistente/api';
import { confirmarAccion } from '@/lib/asistente/acciones';
import { asegurarAccionesEscolares } from '@/lib/asistente/acciones-escolar';
import { logAudit } from '@/lib/audit';

// Descargar SIGERD o matricular una sección entera tardan minutos.
export const maxDuration = 300;

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
    asegurarAccionesEscolares();
    const r = await confirmarAccion(ctx, user.id, b.token);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    await anotarEnConversacion(b.mensajeId, teamId, user.id, `Hecho: ${r.mensaje}`)
      .catch((e) => console.warn('[asistente/confirmar] no se anotó en la conversación:', e));
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

/**
 * Lo confirmado queda escrito en la conversación de la tarjeta: el modelo solo
 * ve el texto del historial, y sin esto no sabía qué se hizo (repetía pasos o
 * decía que no había preparado nada). Solo en una conversación de esta persona.
 */
async function anotarEnConversacion(mensajeId: unknown, teamId: number, userId: number, texto: string) {
  if (typeof mensajeId !== 'number' || !Number.isInteger(mensajeId)) return;
  const [m] = await db.select({ conversacionId: asistenteMensajes.conversacionId })
    .from(asistenteMensajes)
    .innerJoin(asistenteConversaciones, eq(asistenteConversaciones.id, asistenteMensajes.conversacionId))
    .where(and(eq(asistenteMensajes.id, mensajeId), eq(asistenteConversaciones.teamId, teamId), eq(asistenteConversaciones.userId, userId)))
    .limit(1);
  if (!m) return;
  // Sin origen: no es una respuesta a una pregunta, así que el panel no ofrece «Preguntar a la IA».
  await db.insert(asistenteMensajes).values({ conversacionId: m.conversacionId, rol: 'assistant', contenido: texto });
}
