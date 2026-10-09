/**
 * GET  /api/cuentas-por-cobrar/[docId]/gestion — log + estado de seguimiento
 * POST /api/cuentas-por-cobrar/[docId]/gestion — registra evento o guarda estado
 *
 * Body POST (una de estas formas):
 *   { accion: 'evento', tipo: 'contacto'|'nota'|'promesa', fecha, canal?,
 *     comentario?, promesaFecha?, promesaMontoDOP? }
 *   { accion: 'seguimiento', responsableUserId?, proximaAccion?, proximaAccionFecha? }
 *   { accion: 'cerrar-promesa', eventoId, estado: 'cumplida'|'incumplida' }
 *
 * Gate: `facturas:ver` para leer, `facturas:crear` para escribir — misma regla
 * que registrar un pago: quien puede cobrar puede dejar constancia de la gestión.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers, ecfDocuments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import {
  getGestionCuenta, registrarEvento, guardarSeguimiento, cerrarPromesa,
  evaluarPromesasVencidas, CANALES,
} from '@/lib/cobranza/seguimiento';

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Sin .refine: discriminatedUnion consume el objeto base, así que un refine
// aquí nunca correría. La regla "promesa ⇒ fecha" se valida en el handler.
const eventoSchema = z.object({
  accion:          z.literal('evento'),
  tipo:            z.enum(['contacto', 'nota', 'promesa']),
  fecha:           z.string().regex(ISO_FECHA),
  canal:           z.enum(CANALES as [string, ...string[]]).optional(),
  comentario:      z.string().max(2000).optional(),
  promesaFecha:    z.string().regex(ISO_FECHA).optional(),
  promesaMontoDOP: z.number().positive().optional(),
});

const seguimientoSchema = z.object({
  accion:             z.literal('seguimiento'),
  responsableUserId:  z.number().int().positive().nullable().optional(),
  proximaAccion:      z.string().max(500).nullable().optional(),
  proximaAccionFecha: z.string().regex(ISO_FECHA).nullable().optional(),
});

const cerrarSchema = z.object({
  accion:   z.literal('cerrar-promesa'),
  eventoId: z.number().int().positive(),
  estado:   z.enum(['cumplida', 'incumplida']),
});

const bodySchema = z.discriminatedUnion('accion', [
  eventoSchema, seguimientoSchema, cerrarSchema,
]);

/** Resuelve team + permiso + que el documento sea de ese team. */
async function contexto(docIdStr: string, permiso: 'facturas:ver' | 'facturas:crear') {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };

  const teamId = await getTeamIdForUser();
  if (!teamId) return { error: NextResponse.json({ error: 'Sin equipo' }, { status: 403 }) };

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, permiso)) {
    return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  const docId = parseInt(docIdStr, 10);
  if (isNaN(docId)) return { error: NextResponse.json({ error: 'ID inválido' }, { status: 400 }) };

  // El documento debe ser del team activo: sin esto, cualquiera podría anotar
  // gestión sobre la factura de otra empresa pasando su id.
  const [doc] = await db
    .select({ id: ecfDocuments.id })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);
  if (!doc) return { error: NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 }) };

  return { user, teamId, docId };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { docId: raw } = await params;
  const ctx = await contexto(raw, 'facturas:ver');
  if ('error' in ctx) return ctx.error;

  // Las promesas vencidas se resuelven aquí, al abrir la cuenta, no por cron.
  // Es idempotente (solo toca las que siguen en 'pendiente') y son dos UPDATE
  // indexados por team. Corre ANTES de leer para que el panel muestre el estado
  // ya evaluado y no el de la visita anterior.
  //
  // Compromiso conocido: una promesa que nadie abre nunca se marca. Hoy no
  // importa porque el estado solo se consume en esta pantalla; el día que haya
  // un aviso automático de "promesa incumplida" habrá que moverlo a un cron.
  // No se deja fallar la lectura si la evaluación revienta.
  try {
    await evaluarPromesasVencidas(ctx.teamId);
  } catch (e) {
    console.error('[gestion] no se pudieron evaluar las promesas vencidas', e);
  }

  return NextResponse.json(await getGestionCuenta(ctx.teamId, ctx.docId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { docId: raw } = await params;
  const ctx = await contexto(raw, 'facturas:crear');
  if ('error' in ctx) return ctx.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  if (body.accion === 'evento') {
    if (body.tipo === 'promesa' && !body.promesaFecha) {
      return NextResponse.json({ error: 'Una promesa necesita la fecha comprometida' }, { status: 400 });
    }
    const id = await registrarEvento({
      teamId: ctx.teamId,
      docId:  ctx.docId,
      userId: ctx.user.id,
      tipo:   body.tipo,
      fecha:  body.fecha,
      canal:  body.canal as never,
      comentario: body.comentario ?? null,
      promesaFecha: body.promesaFecha ?? null,
      promesaMontoCents: body.promesaMontoDOP
        ? Math.round(body.promesaMontoDOP * 100)
        : null,
    });
    return NextResponse.json({ ok: true, id });
  }

  if (body.accion === 'seguimiento') {
    await guardarSeguimiento({
      teamId: ctx.teamId,
      docId:  ctx.docId,
      userId: ctx.user.id,
      responsableUserId:  body.responsableUserId ?? null,
      proximaAccion:      body.proximaAccion ?? null,
      proximaAccionFecha: body.proximaAccionFecha ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  const ok = await cerrarPromesa(ctx.teamId, body.eventoId, body.estado);
  if (!ok) return NextResponse.json({ error: 'Promesa no encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
