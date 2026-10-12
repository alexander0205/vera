import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularios } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { slugUnico } from '@/lib/administracion-escolar/formularios-server';

/**
 * Copia campos + configuración; NO copia vistas/envíos (arrancan en cero: es
 * un formulario nuevo, no un contador heredado) ni el slug (chocaría). Sale
 * INACTIVO — igual que crear uno nuevo, no se publica solo.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const [original] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.id, parseInt(id)),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .limit(1);
  if (!original) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const nombreCopia = `${original.nombre} (copia)`;
  const slug = await slugUnico(auth.teamId, nombreCopia);

  const [fila] = await db.insert(adminEscolarFormularios).values({
    teamId: auth.teamId,
    nombre: nombreCopia,
    descripcion: original.descripcion,
    slug,
    activo: false,
    campos: original.campos,
    configuracion: original.configuracion,
    creadoPor: auth.user.id,
  }).returning();

  return NextResponse.json({ formulario: fila });
}
