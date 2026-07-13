/**
 * GET /api/facturas/[id]/maestros — maestros que aplican a facturas
 *   (target='factura') + valores + clasificación actual del documento.
 * PUT /api/facturas/[id]/maestros — reemplaza la clasificación del documento.
 *
 * Gate: GET → facturas:ver · PUT → facturas:crear.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, facturaMaestroValores } from '@/lib/db/schema';
import { getPermisoContext, ctxCan } from '@/lib/auth/permiso';
import { eq, and } from 'drizzle-orm';
import { loadFacturaMaestros } from '@/lib/maestros/factura';

async function loadDoc(teamId: number, id: number) {
  const [d] = await db.select({ id: ecfDocuments.id })
    .from(ecfDocuments).where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId))).limit(1);
  return d ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'facturas:ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const doc = await loadDoc(ctx.teamId, id);
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const [ms, asignaciones] = await Promise.all([
    loadFacturaMaestros(ctx.teamId),
    db.select({
      maestroId: facturaMaestroValores.maestroId,
      valorId: facturaMaestroValores.valorId,
    }).from(facturaMaestroValores).where(eq(facturaMaestroValores.ecfDocumentId, id)),
  ]);

  return NextResponse.json({ maestros: ms, asignaciones });
}

const putSchema = z.object({
  asignaciones: z.array(z.object({
    maestroId: z.number().int(),
    valorId: z.number().int(),
  })),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPermisoContext();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!ctxCan(ctx, 'facturas:crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt((await params).id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const doc = await loadDoc(ctx.teamId, id);
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const { asignaciones } = parsed.data;

  // Validar contra maestros target='factura' del equipo + sus valores.
  const factMaestros = await loadFacturaMaestros(ctx.teamId);
  const byId = new Map(factMaestros.map(m => [m.id, m]));

  const seenSingle = new Set<number>();
  const dedup = new Set<string>();
  const clean: { maestroId: number; valorId: number }[] = [];

  for (const a of asignaciones) {
    const m = byId.get(a.maestroId);
    if (!m) return NextResponse.json({ error: 'Maestro no aplica a facturas' }, { status: 400 });
    const v = m.valores.find(x => x.id === a.valorId);
    if (!v) return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    if (!m.multiple) {
      if (seenSingle.has(m.id)) {
        return NextResponse.json({ error: `El maestro "${m.nombre}" solo admite un valor` }, { status: 400 });
      }
      seenSingle.add(m.id);
    }
    const key = `${a.maestroId}:${a.valorId}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    clean.push({ maestroId: a.maestroId, valorId: a.valorId });
  }

  await db.transaction(async (tx) => {
    await tx.delete(facturaMaestroValores).where(eq(facturaMaestroValores.ecfDocumentId, id));
    if (clean.length) {
      await tx.insert(facturaMaestroValores).values(
        clean.map(c => ({ ecfDocumentId: id, maestroId: c.maestroId, valorId: c.valorId })),
      );
    }
  });

  return NextResponse.json({ ok: true, count: clean.length });
}
