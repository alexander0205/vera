import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { importarEstructuraSigerd } from '@/lib/administracion-escolar/importar-estructura-sigerd';

/**
 * Trae al año escolar la estructura descargada de Sigerd: servicios, grados y
 * secciones. Sin `periodoId` va sobre el activo.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { periodoId } = await req.json().catch(() => ({ periodoId: undefined }));

  let destino = Number(periodoId) || 0;
  if (!destino) {
    const [activo] = await db.select({ id: adminEscolarPeriodos.id })
      .from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
      .limit(1);
    if (!activo) return NextResponse.json({ error: 'No hay un año escolar activo.' }, { status: 409 });
    destino = activo.id;
  } else {
    const [p] = await db.select({ id: adminEscolarPeriodos.id })
      .from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, destino), eq(adminEscolarPeriodos.teamId, teamId)))
      .limit(1);
    if (!p) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  }

  const resumen = await importarEstructuraSigerd(teamId, destino);
  return NextResponse.json({ periodoId: destino, ...resumen });
}
