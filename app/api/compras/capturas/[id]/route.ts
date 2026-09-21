/**
 * PATCH /api/compras/capturas/[id] — { accion: 'descartar' }.
 *
 * Saca una captura de la cola sin registrarla (foto ilegible, duplicada,
 * prueba). No borra la foto: queda como 'descartada' por si hay que auditar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { comprasCapturas } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';

const bodySchema = z.object({ accion: z.enum(['descartar']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('productos:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const capturaId = Number(id);
  if (!Number.isInteger(capturaId)) return NextResponse.json({ error: 'Id no válido' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  const [fila] = await db
    .update(comprasCapturas)
    .set({ estado: 'descartada', actualizadoEn: new Date() })
    .where(and(
      eq(comprasCapturas.id, capturaId),
      eq(comprasCapturas.teamId, auth.teamId),
      eq(comprasCapturas.estado, 'pendiente'),
    ))
    .returning({ id: comprasCapturas.id });

  if (!fila) return NextResponse.json({ error: 'Captura no encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
