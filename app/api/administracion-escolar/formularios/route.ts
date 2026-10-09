import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularios } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { configuracionPorDefecto } from '@/lib/administracion-escolar/formularios';
import { slugUnico } from '@/lib/administracion-escolar/formularios-server';

/**
 * Lista de formularios del colegio, para la pantalla /escolar/documentos/formularios.
 *
 * Sin paginar a propósito: son decenas por colegio (ficha de inscripción,
 * permisos de salida, encuestas...), no miles. Igual que la lista de
 * documentos requeridos.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const formularios = await db.select().from(adminEscolarFormularios)
    .where(eq(adminEscolarFormularios.teamId, auth.teamId))
    .orderBy(desc(adminEscolarFormularios.updatedAt));

  return NextResponse.json({ formularios });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const nombre = String(body?.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  const descripcion = body?.descripcion ? String(body.descripcion).trim() : null;

  const slug = await slugUnico(auth.teamId, nombre);

  const [fila] = await db.insert(adminEscolarFormularios).values({
    teamId: auth.teamId,
    nombre,
    descripcion,
    slug,
    campos: [],
    configuracion: configuracionPorDefecto(),
    creadoPor: auth.user.id,
  }).returning();

  return NextResponse.json({ formulario: fila });
}
