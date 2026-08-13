import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosRequeridos, adminEscolarDocumentosEntregados,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { EXIGENCIAS } from '@/lib/administracion-escolar/documentos';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json();

  // Reordenar llega como una lista completa de ids, no como "sube uno": con
  // dos personas tocando la pantalla, mandar posiciones relativas deja el orden
  // dependiendo de quién guardó último.
  if (Array.isArray(body?.orden)) {
    const ids = body.orden.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return NextResponse.json({ ok: true });
    const casos = sql.join(
      ids.map((docId: number, i: number) => sql`WHEN ${docId}::int THEN ${i}::int`), sql` `);
    await db.execute(sql`
      UPDATE admin_escolar_documentos_requeridos
      SET orden = CASE id ${casos} END, updated_at = NOW()
      WHERE team_id = ${auth.teamId} AND id IN (${sql.join(ids.map((n: number) => sql`${n}::int`), sql`, `)})
    `);
    return NextResponse.json({ ok: true });
  }

  if (body?.exigencia && !EXIGENCIAS.includes(String(body.exigencia) as never)) {
    return NextResponse.json({ error: 'Exigencia inválida' }, { status: 400 });
  }

  const [fila] = await db.update(adminEscolarDocumentosRequeridos)
    .set({
      ...(body?.nombre !== undefined ? { nombre: String(body.nombre).trim() } : {}),
      ...(body?.exigencia !== undefined ? { exigencia: String(body.exigencia) } : {}),
      ...(body?.cantidad !== undefined
        ? { cantidad: Math.max(1, Math.min(20, Number(body.cantidad) || 1)) } : {}),
      ...(body?.nivel !== undefined
        ? { nivel: body.nivel ? String(body.nivel).trim() : null } : {}),
      ...(body?.activo !== undefined ? { activo: Boolean(body.activo) } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(adminEscolarDocumentosRequeridos.id, parseInt(id)),
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
    ))
    .returning();

  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ documento: fila });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const docId = parseInt(id);

  // Si ya se le entregó a alguien, borrarlo se llevaría por delante el archivo
  // escaneado y el rastro de quién lo aprobó (la FK es ON DELETE CASCADE). Se
  // desactiva en su lugar: deja de pedirse en las matrículas nuevas y lo ya
  // entregado sigue consultable.
  const [{ usos }] = await db
    .select({ usos: sql<number>`COUNT(*)::int` })
    .from(adminEscolarDocumentosEntregados)
    .where(and(
      eq(adminEscolarDocumentosEntregados.teamId, auth.teamId),
      eq(adminEscolarDocumentosEntregados.requeridoId, docId),
    ));

  if (usos > 0) {
    const [fila] = await db.update(adminEscolarDocumentosRequeridos)
      .set({ activo: false, updatedAt: new Date() })
      .where(and(
        eq(adminEscolarDocumentosRequeridos.id, docId),
        eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
      ))
      .returning();
    if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json({
      ok: true, desactivado: true,
      aviso: `Ya se entregó en ${usos} matrícula(s), así que se desactivó en vez de borrarse: deja de pedirse, pero lo entregado se conserva.`,
    });
  }

  const [fila] = await db.delete(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.id, docId),
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
    ))
    .returning();
  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true, desactivado: false });
}
