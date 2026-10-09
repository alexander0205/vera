/**
 * PATCH /api/administracion-escolar/documentos/entregados/[id] — aprobar o rechazar.
 *
 * Solo estas dos acciones: subir el archivo (POST /entregados) y decidir sobre
 * él son actos separados, y quien decide deja su firma. Aprobar exige
 * `aprobado_por` + `aprobado_en` — la base lo obliga con un CHECK, esta ruta
 * es simplemente quien los rellena.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosEntregados, adminEscolarDocumentosRequeridos,
  adminEscolarDocumentoArchivos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const entregadoId = Number(id);
  if (!Number.isInteger(entregadoId) || entregadoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const accion = String(body?.accion ?? '');
  if (accion !== 'aprobar' && accion !== 'rechazar') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }

  const [actual] = await db
    .select()
    .from(adminEscolarDocumentosEntregados)
    .where(and(
      eq(adminEscolarDocumentosEntregados.id, entregadoId),
      eq(adminEscolarDocumentosEntregados.teamId, auth.teamId),
    ))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (accion === 'aprobar') {
    /**
     * Cuántos archivos hay DE VERDAD.
     *
     * `archivoNombre` es la columna de cuando un renglón tenía un solo archivo.
     * Lo que sube la familia va a `documento_archivos` y deja esa columna en
     * NULL, así que mirarla decía «No hay archivo entregado para aprobar» con
     * el archivo listado en pantalla, sus kilobytes y todo. La validación de
     * cantidad, veinte líneas más abajo, ya contaba bien esta tabla: eran dos
     * criterios distintos para la misma pregunta dentro del mismo bloque.
     */
    const [{ n: nArchivos }] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(adminEscolarDocumentoArchivos)
      .where(eq(adminEscolarDocumentoArchivos.entregadoId, actual.id));

    // Solo hay algo que aprobar si hay un archivo de verdad. Un "no aplica" no
    // se aprueba —ya está resuelto por su propio camino— y un "pendiente" no
    // debería poder llegar aquí porque sin fila no hay id que mandar.
    // Se acepta `archivoNombre` para las filas viejas, de antes de que los
    // archivos vivieran en su propia tabla.
    if (nArchivos === 0 && !actual.archivoNombre) {
      // Salvo que el renglón sea un formulario: ahí lo entregado no es un
      // papel, es lo que la familia contestó. Sin esta salida, un formulario
      // recibido se quedaba en «por aprobar» para siempre.
      const [esFormulario] = await db
        .select({ formularioId: adminEscolarDocumentosRequeridos.formularioId })
        .from(adminEscolarDocumentosRequeridos)
        .where(eq(adminEscolarDocumentosRequeridos.id, actual.requeridoId))
        .limit(1);

      if (!esFormulario?.formularioId) {
        return NextResponse.json(
          { error: 'No hay archivo entregado para aprobar' }, { status: 422 },
        );
      }
    }

    // «Fotos 2x2 ×3» pedía tres y se daba por bueno con una: la cantidad se
    // enseñaba en pantalla y no la comprobaba nadie. Se cuenta lo que hay de
    // verdad en la tabla de archivos, no el nombre suelto de la fila.
    const [renglon] = await db
      .select({
        cantidad: adminEscolarDocumentosRequeridos.cantidad,
        nombre: adminEscolarDocumentosRequeridos.nombre,
        formularioId: adminEscolarDocumentosRequeridos.formularioId,
      })
      .from(adminEscolarDocumentosRequeridos)
      .where(eq(adminEscolarDocumentosRequeridos.id, actual.requeridoId))
      .limit(1);

    if (renglon && !renglon.formularioId && renglon.cantidad > 1 && nArchivos < renglon.cantidad) {
      return NextResponse.json({
        error: `«${renglon.nombre}» pide ${renglon.cantidad} y solo hay ${nArchivos}. Pídele el resto a la familia o baja la cantidad en Configuración.`,
      }, { status: 422 });
    }
    const [fila] = await db
      .update(adminEscolarDocumentosEntregados)
      .set({
        estado: 'aprobado',
        aprobadoPor: auth.user.id,
        aprobadoEn: new Date(),
        // El motivo de un rechazo anterior ya no describe el estado actual.
        motivo: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(adminEscolarDocumentosEntregados.id, entregadoId),
        eq(adminEscolarDocumentosEntregados.teamId, auth.teamId),
      ))
      .returning();
    return NextResponse.json({ ok: true, entregado: fila });
  }

  // Rechazar
  const motivo = String(body?.motivo ?? '').trim();
  if (!motivo) {
    return NextResponse.json({ error: 'El motivo es obligatorio para rechazar' }, { status: 400 });
  }
  const [fila] = await db
    .update(adminEscolarDocumentosEntregados)
    .set({
      estado: 'rechazado',
      motivo,
      // Rechazar deshace cualquier aprobación previa: el CHECK de la base no lo
      // exige (solo aplica a estado='aprobado'), pero dejar la firma de una
      // aprobación que ya no vale sería mentir en el rastro.
      aprobadoPor: null,
      aprobadoEn: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(adminEscolarDocumentosEntregados.id, entregadoId),
      eq(adminEscolarDocumentosEntregados.teamId, auth.teamId),
    ))
    .returning();
  return NextResponse.json({ ok: true, entregado: fila });
}
