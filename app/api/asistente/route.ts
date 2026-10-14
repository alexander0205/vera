/**
 * Asistente de Zero (solo lectura).
 *
 *   GET  /api/asistente                       → { disponible, ia, conversacion|null }
 *   POST /api/asistente { mensaje, conversacionId? } → { conversacionId, mensaje, origen }
 *
 * Funciona aunque no haya IA configurada: el contestador local (lib/asistente/local.ts)
 * responde lo claro y frecuente; la IA, cuando está, se encarga del resto.
 *
 * El historial vive en el servidor (asistente_conversaciones / _mensajes): sirve
 * para auditar qué se consultó y para pasárselo a un agente humano. El teamId y
 * el usuario salen de la sesión; del cliente solo llegan el texto y el id de la
 * conversación, y el id solo vale si es de ESTE usuario en ESTE team.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes, teams } from '@/lib/db/schema';
import { rateLimitDb } from '@/lib/rate-limit';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { construirContexto } from '@/lib/asistente/contexto';
import { crearClienteApi } from '@/lib/asistente/api';
import { esRespuestaGrande, pidePdf } from '@/lib/asistente/bloques';
import { asistenteIaDisponible, conversar, AsistenteSinCuotaError, type MensajeChat } from '@/lib/asistente/agente';

// Principal 35 s + respaldo 25 s + consultas a la base: cabe en 60.
export const maxDuration = 60;

const MAX_LARGO = 1500;
const MAX_HISTORIAL = 20;

export async function GET() {
  const acceso = await evaluarAcceso();
  // Quien no es dueño/admin no ve el asistente: no es un error, es «no aplica».
  if (!acceso.ok) {
    return NextResponse.json({ disponible: false, motivo: acceso.motivo }, { status: acceso.status === 401 ? 401 : 200 });
  }
  const ia = asistenteIaDisponible();

  // Para saludar por nombre y decir de qué empresa se habla.
  const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, acceso.teamId)).limit(1);
  const perfil = {
    usuario: (acceso.user.name ?? '').trim().split(/\s+/)[0] || null,
    empresa: team?.nombre ?? null,
  };

  const [conv] = await db.select().from(asistenteConversaciones)
    .where(and(eq(asistenteConversaciones.teamId, acceso.teamId), eq(asistenteConversaciones.userId, acceso.user.id)))
    .orderBy(desc(asistenteConversaciones.actualizadaEn))
    .limit(1);

  if (!conv) return NextResponse.json({ disponible: true, ia, ...perfil, conversacion: null });

  const mensajes = await db.select({
    id: asistenteMensajes.id, rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido,
    herramientas: asistenteMensajes.herramientas, creadoEn: asistenteMensajes.creadoEn,
  }).from(asistenteMensajes)
    .where(eq(asistenteMensajes.conversacionId, conv.id))
    .orderBy(asc(asistenteMensajes.id))
    .limit(200);

  return NextResponse.json({
    disponible: true,
    ia,
    ...perfil,
    conversacion: {
      id: conv.id,
      derivada: conv.derivadaTicketId != null,
      mensajes: mensajes.map((m) => ({ ...m, grande: m.rol === 'assistant' && esRespuestaGrande(m.contenido) })),
    },
  });
}

export async function POST(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  const { teamId, user } = acceso;

  const rl = await rateLimitDb(`asistente:${teamId}:${user.id}`, 40, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muchas consultas seguidas. Espera unos minutos.' }, { status: 429 });
  }

  const b = await req.json().catch(() => null);
  const texto = typeof b?.mensaje === 'string' ? b.mensaje.trim().slice(0, MAX_LARGO) : '';
  if (!texto) return NextResponse.json({ error: 'Escribe tu pregunta' }, { status: 400 });

  // La conversación tiene que ser de este usuario en este team; si no, nueva.
  let conversacionId: number | null = null;
  if (Number.isInteger(b?.conversacionId)) {
    const [c] = await db.select({ id: asistenteConversaciones.id }).from(asistenteConversaciones)
      .where(and(
        eq(asistenteConversaciones.id, b.conversacionId),
        eq(asistenteConversaciones.teamId, teamId),
        eq(asistenteConversaciones.userId, user.id),
      )).limit(1);
    conversacionId = c?.id ?? null;
  }
  if (conversacionId == null) {
    const [c] = await db.insert(asistenteConversaciones).values({
      teamId, userId: user.id, titulo: texto.slice(0, 120),
    }).returning({ id: asistenteConversaciones.id });
    conversacionId = c.id;
  }

  // Un reintento tras un fallo manda la misma pregunta otra vez: si lo último
  // de la conversación ya es esa pregunta sin contestar, no se guarda de nuevo.
  const [ultimo] = await db.select({ rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido })
    .from(asistenteMensajes)
    .where(eq(asistenteMensajes.conversacionId, conversacionId))
    .orderBy(desc(asistenteMensajes.id))
    .limit(1);
  if (!(ultimo?.rol === 'user' && ultimo.contenido === texto)) {
    await db.insert(asistenteMensajes).values({ conversacionId, rol: 'user', contenido: texto });
  }

  const previos = await db.select({ rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido })
    .from(asistenteMensajes)
    .where(eq(asistenteMensajes.conversacionId, conversacionId))
    .orderBy(desc(asistenteMensajes.id))
    .limit(MAX_HISTORIAL);
  const historial: MensajeChat[] = previos.reverse().map((m) => ({
    role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.contenido,
  }));

  const quierePdf = pidePdf(texto);
  if (quierePdf && texto.split(/\s+/).length <= 7) {
    // «Pásalo a PDF»: es la respuesta anterior, no una pregunta nueva.
    const [prev] = await db.select({ id: asistenteMensajes.id }).from(asistenteMensajes)
      .where(and(eq(asistenteMensajes.conversacionId, conversacionId), eq(asistenteMensajes.rol, 'assistant')))
      .orderBy(desc(asistenteMensajes.id)).limit(1);
    if (prev) {
      const contenido = 'Listo, aquí tienes el PDF de la respuesta anterior. Si no se descargó, usa el botón «PDF» debajo de ella.';
      const [g] = await db.insert(asistenteMensajes).values({ conversacionId, rol: 'assistant', contenido })
        .returning({ id: asistenteMensajes.id, creadoEn: asistenteMensajes.creadoEn });
      await db.update(asistenteConversaciones).set({ actualizadaEn: new Date() }).where(eq(asistenteConversaciones.id, conversacionId));
      return NextResponse.json({
        conversacionId, origen: 'local', descargarMensajeId: prev.id,
        mensaje: { id: g.id, rol: 'assistant', contenido, herramientas: [], creadoEn: g.creadoEn, grande: false },
      });
    }
  }

  const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);

  try {
    // Las búsquedas van por la API de la app con la cookie de la persona: ve lo que ve la pantalla.
    const api = crearClienteApi({ origen: req.nextUrl.origin, cookie: req.headers.get('cookie') });
    const ctx = await construirContexto(teamId, user.platformRole, acceso.teamRole, api);
    const r = await conversar(ctx, historial, {
      empresa: team?.nombre ?? null, usuario: user.name ?? null, usuarioId: user.id,
    });
    const [guardado] = await db.insert(asistenteMensajes).values({
      conversacionId, rol: 'assistant', contenido: r.respuesta,
      herramientas: r.consultas.length ? r.consultas : null,
    }).returning({ id: asistenteMensajes.id, creadoEn: asistenteMensajes.creadoEn });
    await db.update(asistenteConversaciones).set({ actualizadaEn: new Date() })
      .where(eq(asistenteConversaciones.id, conversacionId));

    return NextResponse.json({
      conversacionId,
      origen: r.origen,
      // Pidió el PDF en la misma pregunta: el panel lo descarga solo.
      descargarMensajeId: quierePdf ? guardado.id : undefined,
      mensaje: {
        id: guardado.id, rol: 'assistant', contenido: r.respuesta,
        herramientas: r.consultas, creadoEn: guardado.creadoEn, grande: esRespuestaGrande(r.respuesta),
        propuestas: r.propuestas ?? [],
      },
    });
  } catch (e) {
    console.error('[asistente]', e);
    // Cuota agotada del proveedor: no sirve reintentar de inmediato.
    if (e instanceof AsistenteSinCuotaError) {
      return NextResponse.json(
        { error: 'El asistente alcanzó su límite de uso por ahora. Intenta más tarde o habla con una persona.', conversacionId },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'El asistente no pudo responder. Intenta de nuevo.', conversacionId }, { status: 502 });
  }
}
