/**
 * PATCH /api/pos/favorito — marca/desmarca un producto como favorito del POS.
 * Body { productId, favorito }. Requiere pos:vender (conveniencia del cajero).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { products } from '@/lib/db/schema';

const schema = z.object({
  productId: z.number().int().positive(),
  favorito:  z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const [row] = await db.update(products)
    .set({ posFavorito: parsed.data.favorito, updatedAt: new Date() })
    .where(and(eq(products.id, parsed.data.productId), eq(products.teamId, teamId)))
    .returning({ id: products.id });
  if (!row) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
