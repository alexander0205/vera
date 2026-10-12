/**
 * POST /api/administracion-escolar/whatsapp-plantillas/ia
 *   { mensajes: [{role, content}], borrador?: {nombre, cuerpo, avisoDestino} }
 *   → { respuesta, propuesta | null }
 *
 * Chat con IA para redactar la plantilla. Sin estado en servidor: la pantalla
 * manda el historial completo. La propuesta se vuelve a validar en el cliente
 * con las mismas reglas que el servidor aplica al publicar; el modelo sugiere,
 * no decide.
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
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  if (!iaPlantillasDisponible()) {
    return NextResponse.json({ error: 'El asistente de IA no está configurado todavía.' }, { status: 503 });
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
    const salida = await conversarPlantilla(
      mensajes,
      b?.borrador && typeof b.borrador === 'object'
        ? {
            nombre: String(b.borrador.nombre ?? '').slice(0, 120),
            cuerpo: String(b.borrador.cuerpo ?? '').slice(0, 1200),
            avisoDestino: b.borrador.avisoDestino ? String(b.borrador.avisoDestino).slice(0, 40) : null,
          }
        : null,
      team?.nombre ?? null,
    );
    return NextResponse.json(salida);
  } catch (e) {
    console.error('[escolar whatsapp-plantillas ia]', e);
    return NextResponse.json({ error: 'El asistente no pudo responder. Intenta de nuevo.' }, { status: 502 });
  }
}
