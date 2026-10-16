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
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes, teams } from '@/lib/db/schema';
import { rateLimitDb } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { clasificarSolicitud } from '@/lib/asistente/politicas';
import { sugerenciasPara } from '@/lib/asistente/sugerencias';
import { interpretarPantalla } from '@/lib/asistente/pantalla';
import { frecuentesDe } from '@/lib/asistente/frecuentes';
import { seguimientosDe } from '@/lib/asistente/seguimientos';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { construirContexto } from '@/lib/asistente/contexto';
import { crearClienteApi } from '@/lib/asistente/api';
import { responderGuiado } from '@/lib/asistente/guiado-servidor';
import { quitarBloquesGuiados, sinBloquesGuiadosParaElModelo } from '@/lib/asistente/formulario';
import { esRespuestaGrande, pideExcel, pidePdf, tieneDatosTabulares } from '@/lib/asistente/bloques';
import { asistenteIaDisponible, conversar, AsistenteSinCuotaError, type MensajeChat } from '@/lib/asistente/agente';

// Principal 35 s + respaldo 25 s + consultas a la base: cabe en 60.
export const maxDuration = 60;

const MAX_LARGO = 1500;
/** Las de los atajos por defecto: no tiene sentido repetirlas como «las que sueles preguntar». */
const SUGERENCIAS_FIJAS = ['¿Cuánto he vendido este mes?', '¿Quién me debe y cuánto?', 'Dame el resumen de hoy', '¿Cuáles son mis mejores clientes?', 'Resumen de ITBIS del mes'];
const MAX_HISTORIAL = 20;

export async function GET(req: NextRequest) {
  const acceso = await evaluarAcceso();
  // Quien no es dueño/admin no ve el asistente: no es un error, es «no aplica».
  if (!acceso.ok) {
    return NextResponse.json({ disponible: false, motivo: acceso.motivo }, { status: acceso.status === 401 ? 401 : 200 });
  }
  const ia = asistenteIaDisponible();

  // Historial: lista de conversaciones anteriores de esta persona en esta empresa, o una en concreto.
  const sp = req.nextUrl.searchParams;
  if (sp.get('conversaciones') === '1') {
    const lista = await db.select({
      id: asistenteConversaciones.id, titulo: asistenteConversaciones.titulo, actualizadaEn: asistenteConversaciones.actualizadaEn,
    }).from(asistenteConversaciones)
      .where(and(eq(asistenteConversaciones.teamId, acceso.teamId), eq(asistenteConversaciones.userId, acceso.user.id)))
      .orderBy(desc(asistenteConversaciones.actualizadaEn))
      .limit(15);
    return NextResponse.json({ conversaciones: lista });
  }
  const idPedido = Number(sp.get('id'));
  if (sp.has('id')) {
    if (!Number.isInteger(idPedido) || idPedido <= 0) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 });
    const [c] = await db.select().from(asistenteConversaciones)
      .where(and(
        eq(asistenteConversaciones.id, idPedido),
        eq(asistenteConversaciones.teamId, acceso.teamId),
        eq(asistenteConversaciones.userId, acceso.user.id),
      )).limit(1);
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    const ms = await db.select({
      id: asistenteMensajes.id, rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido,
      herramientas: asistenteMensajes.herramientas, creadoEn: asistenteMensajes.creadoEn,
      valoracion: asistenteMensajes.valoracion, valoracionMotivo: asistenteMensajes.valoracionMotivo, origen: asistenteMensajes.origen,
    }).from(asistenteMensajes)
      .where(eq(asistenteMensajes.conversacionId, c.id))
      .orderBy(asc(asistenteMensajes.id))
      .limit(200);
    return NextResponse.json({
      conversacion: {
        id: c.id, derivada: c.derivadaTicketId != null,
        mensajes: ms.map((m) => ({ ...m, grande: m.rol === 'assistant' && esRespuestaGrande(m.contenido) })),
      },
    });
  }

  // Para saludar por nombre y decir de qué empresa se habla.
  const [team] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, acceso.teamId)).limit(1);
  // Lo que esta persona suele preguntar (solo sus propias preguntas, últimos 90 días).
  const propias = await db.select({ contenido: asistenteMensajes.contenido }).from(asistenteMensajes)
    .innerJoin(asistenteConversaciones, eq(asistenteConversaciones.id, asistenteMensajes.conversacionId))
    .where(and(
      eq(asistenteConversaciones.teamId, acceso.teamId),
      eq(asistenteConversaciones.userId, acceso.user.id),
      eq(asistenteMensajes.rol, 'user'),
      gte(asistenteMensajes.creadoEn, new Date(Date.now() - 90 * 86_400_000)),
    ))
    .orderBy(desc(asistenteMensajes.id))
    .limit(400);
  const perfil = {
    frecuentes: frecuentesDe(propias.map((p) => p.contenido), { excluir: SUGERENCIAS_FIJAS }),
    usuario: (acceso.user.name ?? '').trim().split(/\s+/)[0] || null,
    empresa: team?.nombre ?? null,
    // Los atajos dependen de los módulos y permisos: un colegio ve matrículas, no turnos de caja.
    sugerencias: sugerenciasPara(await construirContexto(
      acceso.teamId, acceso.user.platformRole, acceso.teamRole,
      crearClienteApi({ origen: req.nextUrl.origin, cookie: req.headers.get('cookie') }),
    )).map(({ texto, icono }) => ({ texto, icono })),
  };

  const [conv] = await db.select().from(asistenteConversaciones)
    .where(and(eq(asistenteConversaciones.teamId, acceso.teamId), eq(asistenteConversaciones.userId, acceso.user.id)))
    .orderBy(desc(asistenteConversaciones.actualizadaEn))
    .limit(1);

  if (!conv) return NextResponse.json({ disponible: true, ia, empresaId: acceso.teamId, ...perfil, conversacion: null });

  const mensajes = await db.select({
    id: asistenteMensajes.id, rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido,
    herramientas: asistenteMensajes.herramientas, creadoEn: asistenteMensajes.creadoEn,
    valoracion: asistenteMensajes.valoracion, valoracionMotivo: asistenteMensajes.valoracionMotivo,
    origen: asistenteMensajes.origen,
  }).from(asistenteMensajes)
    .where(eq(asistenteMensajes.conversacionId, conv.id))
    .orderBy(asc(asistenteMensajes.id))
    .limit(200);

  return NextResponse.json({
    disponible: true,
    ia,
    empresaId: acceso.teamId,
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

  const rl = await rateLimitDb(`asistente:${teamId}:${user.id}`, 100, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muchas consultas seguidas. Espera unos minutos.' }, { status: 429 });
  }

  // Ráfaga: más de 20 mensajes en 2 minutos no es una persona leyendo (la creación guiada son muchas respuestas cortas).
  const rafaga = await rateLimitDb(`asistente_rafaga:${teamId}:${user.id}`, 20, 2 * 60_000);
  if (!rafaga.allowed) {
    logAudit({ teamId, userId: user.id, actor: user.email, action: 'ASISTENTE_ABUSO', resource: 'rafaga', meta: { motivo: 'más de 20 mensajes en 2 minutos' } });
    return NextResponse.json({ error: 'Vas muy rápido. Espera un par de minutos y vuelve a preguntar.' }, { status: 429 });
  }

  const b = await req.json().catch(() => null);
  const crudo = typeof b?.mensaje === 'string'
    // eslint-disable-next-line no-control-regex
    ? b.mensaje.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
    : '';
  if (!crudo) return NextResponse.json({ error: 'Escribe tu pregunta' }, { status: 400 });
  if (crudo.length > MAX_LARGO) {
    return NextResponse.json(
      { error: `Tu mensaje es muy largo (${crudo.length} caracteres; el máximo es ${MAX_LARGO}). Resúmelo o divídelo en preguntas más cortas.` },
      { status: 400 },
    );
  }
  const texto = crudo;
  // «No es lo que buscaba»: la IA responde de nuevo, sin pasar por el contestador automático.
  const forzarIa = b?.forzarIa === true;
  // La pantalla mostraba otra empresa (se cambió en otra pestaña): nada se guarda ni se consulta.
  if (Number.isInteger(b?.empresaId) && b.empresaId !== teamId) {
    return NextResponse.json({ error: 'Cambiaste de empresa.', cambioEmpresa: true, empresaId: teamId }, { status: 409 });
  }
  if (clasificarSolicitud(texto)?.categoria === 'volcado') {
    logAudit({ teamId, userId: user.id, actor: user.email, action: 'ASISTENTE_ABUSO', resource: 'volcado', meta: { texto: texto.slice(0, 200) } });
  }

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
  if (!forzarIa && !(ultimo?.rol === 'user' && ultimo.contenido === texto)) {
    await db.insert(asistenteMensajes).values({ conversacionId, rol: 'user', contenido: texto });
  }

  const previos = await db.select({ rol: asistenteMensajes.rol, contenido: asistenteMensajes.contenido })
    .from(asistenteMensajes)
    .where(eq(asistenteMensajes.conversacionId, conversacionId))
    .orderBy(desc(asistenteMensajes.id))
    .limit(MAX_HISTORIAL);
  previos.reverse();
  // Al modelo no le llega el estado interno de la creación guiada ni los formularios ya llenos: solo ruido y superficie de inyección.
  const paraModelo = (m: { rol: string; contenido: string }) => (m.rol === 'assistant' ? sinBloquesGuiadosParaElModelo(m.contenido) : m.contenido);
  const historial: MensajeChat[] = previos.map((m) => ({
    role: m.rol === 'assistant' ? 'assistant' : 'user', content: paraModelo(m),
  }));

  if (forzarIa) {
    // La pregunta ya está en la conversación; solo se le pide a la IA que la vuelva a interpretar.
    if (!historial.some((m) => m.role === 'user')) {
      return NextResponse.json({ error: 'No hay una pregunta anterior que repetir.' }, { status: 400 });
    }
    historial.push({
      role: 'user',
      content: 'La respuesta anterior no era lo que buscaba. Vuelve a interpretar mi pregunta anterior y respóndela bien.',
    });
  }

  // «Pásalo a Excel»: es la respuesta anterior, no una pregunta nueva.
  const esPolitica = clasificarSolicitud(texto) != null;

  // Creación guiada: el asistente pregunta de a una y la persona contesta escribiendo.
  // Es determinista (sin modelo); solo arma el formulario, que la persona envía.
  const anterior = previos.length >= 2 && previos[previos.length - 2].rol === 'assistant' ? previos[previos.length - 2].contenido : null;
  // Una respuesta como «1» (sin letras) la tomaría la política de «vacío»: dentro de un flujo guiado es una opción válida.
  const soloNumero = clasificarSolicitud(texto)?.categoria === 'vacio';
  if (!forzarIa && (!esPolitica || soloNumero)) {
    const guiada = await responderGuiado(texto, anterior, crearClienteApi({ origen: req.nextUrl.origin, cookie: req.headers.get('cookie') }), `${teamId}:${user.id}:${conversacionId}`);
    if (guiada) {
      const [g] = await db.insert(asistenteMensajes).values({ conversacionId, rol: 'assistant', contenido: guiada.contenido, origen: 'local' })
        .returning({ id: asistenteMensajes.id, creadoEn: asistenteMensajes.creadoEn });
      await db.update(asistenteConversaciones).set({ actualizadaEn: new Date() }).where(eq(asistenteConversaciones.id, conversacionId));
      return NextResponse.json({
        conversacionId, origen: 'local',
        mensaje: { id: g.id, rol: 'assistant', contenido: guiada.contenido, herramientas: [], creadoEn: g.creadoEn, grande: false, origen: 'local', seguimientos: guiada.chips },
      });
    }
  }
  const quiereExcel = !forzarIa && !esPolitica && pideExcel(texto);
  if (quiereExcel && texto.split(/\s+/).length <= 8) {
    const [prev] = await db.select({ id: asistenteMensajes.id, contenido: asistenteMensajes.contenido }).from(asistenteMensajes)
      .where(and(eq(asistenteMensajes.conversacionId, conversacionId), eq(asistenteMensajes.rol, 'assistant')))
      .orderBy(desc(asistenteMensajes.id)).limit(1);
    if (prev) {
      const contenido = tieneDatosTabulares(prev.contenido)
        ? 'Listo, aquí tienes el Excel de la respuesta anterior. Si no se descargó, usa el botón «Excel» debajo de ella.'
        : 'La respuesta anterior es solo texto; te dejé el Excel con ese texto. Para una hoja con cifras, pídeme primero el dato (por ejemplo «ventas por cliente»).';
      const [g] = await db.insert(asistenteMensajes).values({ conversacionId, rol: 'assistant', contenido, origen: 'local' })
        .returning({ id: asistenteMensajes.id, creadoEn: asistenteMensajes.creadoEn });
      await db.update(asistenteConversaciones).set({ actualizadaEn: new Date() }).where(eq(asistenteConversaciones.id, conversacionId));
      return NextResponse.json({
        conversacionId, origen: 'local', descargarExcelId: prev.id,
        mensaje: { id: g.id, rol: 'assistant', contenido, herramientas: [], creadoEn: g.creadoEn, grande: false, origen: 'local', seguimientos: [] },
      });
    }
  }

  const quierePdf = !forzarIa && !esPolitica && pidePdf(texto);
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
      pantalla: interpretarPantalla(b?.pantalla),
      forzarIa,
    });
    // Solo la creación guiada (código determinista y firmado) escribe bloques de paso o formularios llenos.
    r.respuesta = quitarBloquesGuiados(r.respuesta);
    const [guardado] = await db.insert(asistenteMensajes).values({
      conversacionId, rol: 'assistant', contenido: r.respuesta,
      herramientas: r.consultas.length ? r.consultas : null,
      origen: r.origen,
    }).returning({ id: asistenteMensajes.id, creadoEn: asistenteMensajes.creadoEn });
    await db.update(asistenteConversaciones).set({ actualizadaEn: new Date() })
      .where(eq(asistenteConversaciones.id, conversacionId));

    return NextResponse.json({
      conversacionId,
      origen: r.origen,
      // Pidió el PDF en la misma pregunta: el panel lo descarga solo.
      descargarMensajeId: quierePdf ? guardado.id : undefined,
      // Pidió el Excel en la misma pregunta («ventas por cliente en excel»).
      descargarExcelId: quiereExcel && tieneDatosTabulares(r.respuesta) ? guardado.id : undefined,
      mensaje: {
        id: guardado.id, rol: 'assistant', contenido: r.respuesta, origen: r.origen,
        herramientas: r.consultas, creadoEn: guardado.creadoEn, grande: esRespuestaGrande(r.respuesta),
        propuestas: r.propuestas ?? [],
        // Qué preguntar después (solo si contestó el automático: sabe qué fue).
        seguimientos: seguimientosDe(r.intencion),
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
