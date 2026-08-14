/**
 * PATCH /api/administracion-escolar/documentos/entregados/[id] — aprobar o rechazar.
 *
 * Solo estas dos acciones: subir el archivo (POST /entregados) y decidir sobre
 * él son actos separados, y quien decide deja su firma. Aprobar exige
 * `aprobado_por` + `aprobado_en` — la base lo obliga con un CHECK, esta ruta
 * es simplemente quien los rellena.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosEntregados, adminEscolarDocumentosRequeridos,
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
    // Solo hay algo que aprobar si hay un archivo de verdad. Un "no aplica" no
    // se aprueba —ya está resuelto por su propio camino— y un "pendiente" no
    // debería poder llegar aquí porque sin fila no hay id que mandar.
    if (!actual.archivoNombre) {
      // Salvo que el renglón sea un formulario: ahí lo entregado no es un
      // papel, es lo que la familia contestó. Sin esta salida, un formulario
      // recibido se quedaba en «por aprobar» para siempre.
      const [renglon] = await db
        .select({ formularioId: adminEscolarDocumentosRequeridos.formularioId })
        .from(adminEscolarDocumentosRequeridos)
        .where(eq(adminEscolarDocumentosRequeridos.id, actual.requeridoId))
        .limit(1);

      if (!renglon?.formularioId) {
        return NextResponse.json(
          { error: 'No hay archivo entregado para aprobar' }, { status: 422 },
        );
      }
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
