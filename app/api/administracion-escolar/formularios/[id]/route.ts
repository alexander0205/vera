import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularios } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { slugUnico } from '@/lib/administracion-escolar/formularios-server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const [fila] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.id, parseInt(id)),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .limit(1);

  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ formulario: fila });
}

/**
 * El constructor guarda entero: nombre, campos y configuración llegan
 * siempre juntos porque así los edita FormularioBuilder (un solo botón
 * "Guardar"). Renombrar rehace el slug si el nombre cambió, para que el
 * enlace público lo refleje — pero conservando el mismo slug si el nombre no
 * cambió, así no se rompe un enlace ya compartido por un cambio de otra cosa.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const formularioId = parseInt(id);
  const body = await req.json().catch(() => ({}));

  const [actual] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.id, formularioId),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const nombreNuevo = body?.nombre !== undefined ? String(body.nombre).trim() : actual.nombre;
  if (!nombreNuevo) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });

  const slug = nombreNuevo !== actual.nombre
    ? await slugUnico(auth.teamId, nombreNuevo, formularioId)
    : actual.slug;

  const [fila] = await db.update(adminEscolarFormularios)
    .set({
      nombre: nombreNuevo,
      slug,
      ...(body?.descripcion !== undefined ? { descripcion: body.descripcion ? String(body.descripcion).trim() : null } : {}),
      ...(body?.campos !== undefined ? { campos: body.campos } : {}),
      ...(body?.configuracion !== undefined ? { configuracion: body.configuracion } : {}),
      ...(body?.activo !== undefined ? { activo: Boolean(body.activo) } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(adminEscolarFormularios.id, formularioId),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .returning();

  return NextResponse.json({ formulario: fila });
}

/**
 * Borra el formulario y, en cascada (ver migración 0121), sus respuestas. No
 * hay "ya se usó, se desactiva en su lugar" como en documentos requeridos:
 * las respuestas se van con él a propósito porque no dejan un rastro que otra
 * pantalla necesite después (a diferencia del documento entregado, que sigue
 * consultable aunque se deje de pedir).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const [fila] = await db.delete(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.id, parseInt(id)),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .returning();

  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
