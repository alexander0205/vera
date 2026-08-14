import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentoListas, adminEscolarDocumentosRequeridos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/**
 * Los listados de documentos del colegio.
 *
 * Cada uno es un juego de papeles con nombre —«Admisión inicial», «Traslado de
 * otro centro»— y al matricular se elige uno. Van con su conteo porque un
 * listado vacío no pide nada, y eso hay que verlo desde fuera sin abrirlo.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const listas = await db
    .select({
      id: adminEscolarDocumentoListas.id,
      nombre: adminEscolarDocumentoListas.nombre,
      orden: adminEscolarDocumentoListas.orden,
      documentos: sql<number>`(
        SELECT COUNT(*)::int FROM admin_escolar_documentos_requeridos d
         WHERE d.lista_id = admin_escolar_documento_listas.id AND d.activo
      )`,
    })
    .from(adminEscolarDocumentoListas)
    .where(and(
      eq(adminEscolarDocumentoListas.teamId, auth.teamId),
      eq(adminEscolarDocumentoListas.activo, true),
    ))
    .orderBy(asc(adminEscolarDocumentoListas.orden), asc(adminEscolarDocumentoListas.id));

  return NextResponse.json({ listas });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const nombre = String(body?.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'Ponle un nombre al listado' }, { status: 400 });

  const [{ ultimo }] = await db
    .select({ ultimo: sql<number>`COALESCE(MAX(${adminEscolarDocumentoListas.orden}), -1)::int` })
    .from(adminEscolarDocumentoListas)
    .where(eq(adminEscolarDocumentoListas.teamId, auth.teamId));

  try {
    const [fila] = await db.insert(adminEscolarDocumentoListas)
      .values({ teamId: auth.teamId, nombre, orden: ultimo + 1 })
      .returning();

    // Copiar otro listado es lo que hace usable tener varios: casi siempre el
    // segundo es el primero menos dos papeles, y volver a escribir diez
    // nombres a mano es lo que hace que nadie cree el segundo.
    const copiarDe = Number(body?.copiarDe);
    if (Number.isInteger(copiarDe) && copiarDe > 0) {
      await db.execute(sql`
        INSERT INTO admin_escolar_documentos_requeridos
          (team_id, lista_id, nivel, tipo_inscripcion, nombre, exigencia, cantidad, orden)
        SELECT team_id, ${fila.id}, nivel, tipo_inscripcion, nombre, exigencia, cantidad, orden
          FROM admin_escolar_documentos_requeridos
         WHERE team_id = ${auth.teamId} AND lista_id = ${copiarDe} AND activo
      `);
    }

    return NextResponse.json({ lista: fila });
  } catch (e: unknown) {
    // El índice único por nombre: dos listados iguales serían indistinguibles
    // en el desplegable de matriculación, que es donde se eligen.
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya hay un listado con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 });

  const nombre = body?.nombre === undefined ? undefined : String(body.nombre).trim();
  if (nombre !== undefined && !nombre) {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
  }

  try {
    const [fila] = await db.update(adminEscolarDocumentoListas)
      .set({
        ...(nombre !== undefined ? { nombre } : {}),
        ...(body?.activo !== undefined ? { activo: Boolean(body.activo) } : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(adminEscolarDocumentoListas.id, id),
        eq(adminEscolarDocumentoListas.teamId, auth.teamId),
      ))
      .returning();
    if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json({ lista: fila });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya hay un listado con ese nombre' }, { status: 409 });
    }
    throw e;
  }
}

/**
 * Quitar un listado.
 *
 * Se desactiva en vez de borrarse. Sus documentos cuelgan con `ON DELETE
 * CASCADE`, así que un DELETE de verdad se llevaría por delante los renglones a
 * los que apuntan los documentos ya entregados de matrículas viejas — y con
 * ellos, el rastro de lo que esa familia entregó.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 });

  const [enUso] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
      eq(adminEscolarDocumentosRequeridos.listaId, id),
      eq(adminEscolarDocumentosRequeridos.activo, true),
    ));

  await db.update(adminEscolarDocumentoListas)
    .set({ activo: false, updatedAt: new Date() })
    .where(and(
      eq(adminEscolarDocumentoListas.id, id),
      eq(adminEscolarDocumentoListas.teamId, auth.teamId),
    ));

  return NextResponse.json({
    ok: true,
    aviso: enUso.n > 0
      ? `Listado quitado. Sus ${enUso.n} documento(s) se conservan por si lo vuelves a necesitar.`
      : 'Listado quitado.',
  });
}
