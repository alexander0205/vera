import { NextRequest, NextResponse } from 'next/server';
import { and, eq, asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentosRequeridos, adminEscolarServicios } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  sembrarDocumentos, TIPOS_INSCRIPCION, EXIGENCIAS,
} from '@/lib/administracion-escolar/documentos';

/**
 * La configuración: qué documentos pide el colegio, por nivel y por tipo de
 * inscripción.
 *
 * Es una lista corta —decenas de filas por colegio— así que se devuelve entera
 * y la pantalla la agrupa. Paginarla complicaría el reordenar sin ahorrar nada.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const [documentos, niveles] = await Promise.all([
    db.select().from(adminEscolarDocumentosRequeridos)
      .where(eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId))
      .orderBy(asc(adminEscolarDocumentosRequeridos.orden), asc(adminEscolarDocumentosRequeridos.id)),
    // Los niveles que existen de verdad en la estructura del colegio. Van
    // DISTINCT por nombre porque el mismo nivel se repite una vez por año y por
    // tanda ("Primario · Matutina", "Primario · Vespertina"), y la
    // configuración de documentos es por nivel, no por tanda ni por año.
    db.selectDistinct({ nombre: adminEscolarServicios.nombre })
      .from(adminEscolarServicios)
      .where(eq(adminEscolarServicios.teamId, auth.teamId))
      .orderBy(asc(adminEscolarServicios.nombre)),
  ]);

  return NextResponse.json({
    documentos,
    niveles: niveles.map((n) => n.nombre).filter(Boolean),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json();

  // `sembrar: true` deja la lista que dictó el colegio. Es idempotente, así que
  // el botón se puede pulsar dos veces sin duplicar nada.
  if (body?.sembrar === true) {
    const { creados } = await sembrarDocumentos(auth.teamId);
    return NextResponse.json({ creados });
  }

  const nombre = String(body?.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });

  const tipo = String(body?.tipoInscripcion ?? '');
  if (!TIPOS_INSCRIPCION.includes(tipo as never)) {
    return NextResponse.json({ error: 'Tipo de inscripción inválido' }, { status: 400 });
  }
  const exigencia = String(body?.exigencia ?? 'requerido');
  if (!EXIGENCIAS.includes(exigencia as never)) {
    return NextResponse.json({ error: 'Exigencia inválida' }, { status: 400 });
  }

  // Al final de su grupo: lo nuevo se añade abajo, que es donde lo busca quien
  // lo acaba de escribir.
  const [{ ultimo }] = await db
    .select({ ultimo: sql<number>`COALESCE(MAX(${adminEscolarDocumentosRequeridos.orden}), -1)::int` })
    .from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
      eq(adminEscolarDocumentosRequeridos.tipoInscripcion, tipo),
    ));

  const [fila] = await db.insert(adminEscolarDocumentosRequeridos).values({
    teamId: auth.teamId,
    // El listado al que pertenece. Sin él el documento no lo pide nadie: la
    // matrícula elige un listado, no un nivel.
    listaId: Number.isInteger(Number(body?.listaId)) ? Number(body.listaId) : null,
    nivel: body?.nivel ? String(body.nivel).trim() : null,
    tipoInscripcion: tipo,
    nombre,
    exigencia,
    cantidad: Math.max(1, Math.min(20, Number(body?.cantidad) || 1)),
    orden: ultimo + 1,
  }).returning();

  return NextResponse.json({ documento: fila });
}
