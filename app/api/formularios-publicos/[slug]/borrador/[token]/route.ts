import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularioRespuestas } from '@/lib/db/schema';
import { rateLimitDb } from '@/lib/rate-limit';
import {
  buscarFormulario, soloCamposConocidos, LIMITE_DATOS,
} from '@/lib/administracion-escolar/formularios-publicos';
import type { ICampo } from '@/lib/administracion-escolar/formularios';

/**
 * Guardado automático de una ficha a medio llenar.
 *
 * El token del enlace es la ÚNICA credencial, así que aquí no se busca nunca
 * por id: se busca por token y además se comprueba que ese borrador sea de
 * este formulario. Un token de otro colegio no abre esta ficha.
 *
 * Solo se toca mientras el estado sea 'borrador'. Una vez enviada, la respuesta
 * queda congelada: si el enlace se le reenvía a alguien —o se queda en el
 * historial de un teléfono prestado—, no puede reescribir lo que el colegio ya
 * dio por recibido.
 */

interface Ctx { params: Promise<{ slug: string; token: string }> }

async function buscarBorrador(slug: string, token: string) {
  const f = await buscarFormulario(slug);
  if (!f) return { error: 'Formulario no encontrado', status: 404 as const };

  const [fila] = await db.select().from(adminEscolarFormularioRespuestas)
    .where(and(
      eq(adminEscolarFormularioRespuestas.token, token),
      eq(adminEscolarFormularioRespuestas.formularioId, f.id),
    ))
    .limit(1);

  if (!fila) return { error: 'Este enlace ya no existe', status: 404 as const };
  return { formulario: f, fila };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug, token } = await params;
  const r = await buscarBorrador(slug, token);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  return NextResponse.json({
    datos: r.fila.datos,
    pagina: r.fila.pagina,
    enviado: r.fila.estado !== 'borrador',
    actualizado: r.fila.updatedAt,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, token } = await params;

  // Alto, pero acotado: el guardado va cada pocos segundos mientras se escribe,
  // y aun así una ficha entera no llega a doscientos guardados.
  const rl = await rateLimitDb(`form_borrador:${token}`, 600, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiados guardados seguidos' }, { status: 429 });
  }

  const r = await buscarBorrador(slug, token);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  if (r.fila.estado !== 'borrador') {
    return NextResponse.json({ error: 'Este formulario ya fue enviado' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Envío inválido' }, { status: 400 });
  }

  const datos = (body.datos ?? {}) as Record<string, unknown>;
  if (JSON.stringify(datos).length > LIMITE_DATOS) {
    return NextResponse.json({ error: 'El formulario es demasiado grande' }, { status: 413 });
  }

  const campos = (r.formulario.campos ?? []) as ICampo[];
  const pagina = Number.isInteger(body.pagina) ? Math.max(0, body.pagina as number) : r.fila.pagina;

  await db.update(adminEscolarFormularioRespuestas)
    .set({
      datos: soloCamposConocidos(campos, datos),
      pagina,
      updatedAt: new Date(),
    })
    .where(eq(adminEscolarFormularioRespuestas.id, r.fila.id));

  return NextResponse.json({ ok: true });
}
