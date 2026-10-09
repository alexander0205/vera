import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarFormularioRespuestas,
  adminEscolarDocumentosRequeridos,
  adminEscolarDocumentosEntregados,
} from '@/lib/db/schema';
import { rateLimitDb } from '@/lib/rate-limit';
import { getIp } from '@/lib/audit';
import {
  buscarFormulario, motivoCerrado, formularioPublico, soloCamposConocidos,
  faltantes, LIMITE_DATOS,
} from '@/lib/administracion-escolar/formularios-publicos';
import type { ICampo, IFormularioConfig } from '@/lib/administracion-escolar/formularios';

/**
 * El formulario tal como lo ve una familia, y por donde lo contesta.
 *
 * SIN sesión: el enlace se le manda por WhatsApp a alguien que todavía no es
 * usuario del sistema —muchas veces ni siquiera es alumno todavía, porque esto
 * es lo que se llena ANTES de la admisión—. Por eso todo lo que sale por aquí
 * está recortado a mano: solo el formulario pedido, solo si está activo, y sin
 * un solo dato del colegio que no haga falta para pintarlo.
 */

interface Ctx { params: Promise<{ slug: string }> }

/**
 * Un formulario adjunto al expediente de un alumno es un renglón de su
 * checklist. Cuando la familia lo manda, ese renglón pasa a «por aprobar» —
 * como cualquier papel que sube—: recibido y aprobado siguen siendo dos actos
 * de dos personas, así que NO nace aprobado.
 */
async function marcarRenglonRecibido(teamId: number, matriculaId: number, formularioId: number) {
  const [renglon] = await db.select({ id: adminEscolarDocumentosRequeridos.id })
    .from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.matriculaId, matriculaId),
      eq(adminEscolarDocumentosRequeridos.formularioId, formularioId),
    ))
    .limit(1);
  if (!renglon) return;

  await db.insert(adminEscolarDocumentosEntregados).values({
    teamId,
    matriculaId,
    requeridoId: renglon.id,
    estado: 'recibido',
    subidoEn: new Date(),
    subidoFamilia: true,
  }).onConflictDoUpdate({
    target: [adminEscolarDocumentosEntregados.matriculaId, adminEscolarDocumentosEntregados.requeridoId],
    set: {
      estado: 'recibido',
      subidoEn: new Date(),
      subidoFamilia: true,
      // Si estaba rechazado, el motivo viejo ya no describe lo que hay.
      motivo: null,
      updatedAt: new Date(),
    },
  });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const f = await buscarFormulario(slug);
  if (!f) return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });

  const motivo = await motivoCerrado(f);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 410 });

  return NextResponse.json({ formulario: formularioPublico(f) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;

  // Por IP y por formulario. Un enlace público sin esto se llena de basura en
  // una semana, y cada respuesta falsa es una familia inventada que alguien
  // del colegio tiene que revisar a mano.
  const rl = await rateLimitDb(`formulario_publico:${slug}:${getIp(req) ?? 'anon'}`, 10, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados envíos seguidos. Inténtalo más tarde.' },
      { status: 429 },
    );
  }

  const f = await buscarFormulario(slug);
  if (!f) return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });

  const motivo = await motivoCerrado(f);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 410 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Envío inválido' }, { status: 400 });
  }

  // Trampa para robots: es un campo escondido que una persona nunca rellena.
  // Se responde OK para no enseñarle al robot que lo detectamos.
  if (typeof body.__hp === 'string' && body.__hp.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const datos = (body.datos ?? {}) as Record<string, unknown>;
  if (JSON.stringify(datos).length > LIMITE_DATOS) {
    return NextResponse.json({ error: 'El envío es demasiado grande' }, { status: 413 });
  }

  // Se revalida en el servidor lo mismo que valida la pantalla. Lo de delante
  // se salta con dos clics en las herramientas del navegador, y una ficha a la
  // que le falta el teléfono de emergencia es justo la que no sirve.
  const campos = (f.campos ?? []) as ICampo[];
  const faltan = faltantes(campos, datos);
  if (faltan.length > 0) {
    return NextResponse.json(
      { error: `Faltan campos obligatorios: ${faltan.slice(0, 5).join(', ')}` },
      { status: 400 },
    );
  }

  // Solo se guardan las respuestas de campos que EXISTEN en el formulario: sin
  // esto, cualquiera podría inflar el JSON con lo que quisiera.
  const limpio = soloCamposConocidos(campos, datos);
  const cfg = (f.configuracion ?? {}) as IFormularioConfig;
  const token = typeof body.token === 'string' ? body.token : null;

  // Venía de un borrador: se cierra ESA fila en vez de crear otra. Si no, la
  // bandeja del colegio acabaría con la ficha a medias y la definitiva.
  if (token) {
    const [cerrada] = await db.update(adminEscolarFormularioRespuestas)
      .set({
        datos: limpio,
        estado: 'pendiente',
        enviadoEn: new Date(),
        updatedAt: new Date(),
        ip: getIp(req),
        userAgent: req.headers.get('user-agent'),
      })
      .where(and(
        eq(adminEscolarFormularioRespuestas.token, token),
        eq(adminEscolarFormularioRespuestas.formularioId, f.id),
        // Solo si sigue siendo borrador: reenviar el mismo enlace no puede
        // reescribir lo que el colegio ya tiene por recibido.
        eq(adminEscolarFormularioRespuestas.estado, 'borrador'),
      ))
      .returning({
        id: adminEscolarFormularioRespuestas.id,
        matriculaId: adminEscolarFormularioRespuestas.matriculaId,
      });

    if (!cerrada) {
      return NextResponse.json(
        { error: 'Este formulario ya fue enviado.' },
        { status: 409 },
      );
    }

    if (cerrada.matriculaId) await marcarRenglonRecibido(f.teamId, cerrada.matriculaId, f.id);

    return NextResponse.json({
      ok: true,
      id: cerrada.id,
      mensaje: cfg.mensajeConfirmacion,
      urlRedireccion: cfg.urlRedireccion,
    });
  }

  const [fila] = await db.insert(adminEscolarFormularioRespuestas).values({
    teamId: f.teamId,
    formularioId: f.id,
    // El nombre se copia: si el colegio renombra el formulario el año que
    // viene, la respuesta sigue diciendo a qué contestó esta familia.
    formularioNombre: f.nombre,
    datos: limpio,
    enviadoEn: new Date(),
    ip: getIp(req),
    userAgent: req.headers.get('user-agent'),
  }).returning({ id: adminEscolarFormularioRespuestas.id });

  return NextResponse.json({
    ok: true,
    id: fila.id,
    mensaje: cfg.mensajeConfirmacion,
    urlRedireccion: cfg.urlRedireccion,
  });
}
