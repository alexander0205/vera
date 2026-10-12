import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { cannedResponses } from '@/lib/db/schema';

const CATEGORIES = ['saludo', 'espera', 'cierre', 'general'] as const;
type Category = (typeof CATEGORIES)[number];

function isValidCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const responseId = parseInt(id, 10);
  if (Number.isNaN(responseId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = (await req.json()) as { label?: string; category?: string; content?: string };
  const label = (body.label ?? '').trim();
  const content = (body.content ?? '').trim();
  const category = body.category;

  if (!label || !content) {
    return NextResponse.json({ error: 'label y content son requeridos' }, { status: 400 });
  }
  if (!isValidCategory(category)) {
    return NextResponse.json({ error: 'category inválida' }, { status: 400 });
  }

  const [updated] = await db
    .update(cannedResponses)
    .set({ label, category, content, updatedAt: new Date() })
    .where(eq(cannedResponses.id, responseId))
    .returning();
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json({ cannedResponse: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const responseId = parseInt(id, 10);
  if (Number.isNaN(responseId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [deleted] = await db.delete(cannedResponses).where(eq(cannedResponses.id, responseId)).returning();
  if (!deleted) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
