import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentosRequeridos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/**
 * Quita un documento colgado de un alumno.
 *
 * Solo los extras: `matricula_id IS NOT NULL`. Un renglón del listado del nivel
 * no se quita desde el expediente de un alumno —se le está pidiendo a todos, y
 * quitarlo aquí lo quitaría de los trescientos—. Eso se hace en Configuración.
 *
 * Se lleva por delante lo entregado y sus archivos (cascada en la tabla): es lo
 * correcto, porque si el documento deja de pedirse, el papel que se subió para
 * cumplirlo ya no cuelga de nada.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const [borrado] = await db.delete(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.id, id),
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
      isNotNull(adminEscolarDocumentosRequeridos.matriculaId),
    ))
    .returning({ id: adminEscolarDocumentosRequeridos.id });

  if (!borrado) {
    return NextResponse.json(
      { error: 'Ese documento no es de este alumno: quítalo desde Configuración → Documentos' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
