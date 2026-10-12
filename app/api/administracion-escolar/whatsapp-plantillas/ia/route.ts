/**
 * POST /api/administracion-escolar/whatsapp-plantillas/ia
 *   { mensajes: [{role, content}] }  → { respuesta, acciones[] }
 *
 * Chat con el asistente (Gemini). No solo redacta: tiene herramientas para
 * crear plantillas, mandarlas a aprobación y asignarlas a los avisos, siempre
 * por las mismas reglas que los botones de la pantalla. `acciones` dice qué
 * hizo, para que la pantalla se refresque y lo muestre.
 *
 * Sin estado en el servidor: la pantalla manda el historial completo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { rateLimitDb } from '@/lib/rate-limit';
import { conversarPlantilla, iaPlantillasDisponible, type MensajeChat } from '@/lib/whatsapp/ia-plantillas';

const MAX_MENSAJES = 20;
const MAX_LARGO = 2000;

export async function POST(req: NextRequest) {
  // `escritura`: el asistente crea y asigna cosas, así que cuenta como escribir.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  if (!iaPlantillasDisponible()) {
    return NextResponse.json(
      { error: 'El asistente de IA no está configurado todavía (falta AI_GATEWAY_API_KEY).' },
      { status: 503 },
    );
  }

  const rl = await rateLimitDb(`escolar_plantillas_ia:${teamId}`, 30, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muchas consultas seguidas. Espera un rato.' }, { status: 429 });
  }

  const b = await req.json().catch(() => null);
  const mensajes: MensajeChat[] = (Array.isArray(b?.mensajes) ? b.mensajes : [])
    .filter((m: { role?: string; content?: unknown }) =>
      (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MENSAJES)
    .map((m: MensajeChat) => ({ role: m.role, content: m.content.slice(0, MAX_LARGO) }));

  if (mensajes.length === 0 || mensajes[mensajes.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Escribe lo que necesitas' }, { status: 400 });
  }

  const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);

  try {
    return NextResponse.json(await conversarPlantilla(teamId, mensajes, team?.nombre ?? null));
  } catch (e) {
    console.error('[escolar whatsapp-plantillas ia]', e);
    return NextResponse.json({ error: 'El asistente no pudo responder. Intenta de nuevo.' }, { status: 502 });
  }
}
