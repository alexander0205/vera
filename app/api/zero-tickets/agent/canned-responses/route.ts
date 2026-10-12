import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { requireZeroTicketsAgent } from '@/lib/auth/zero-tickets-guard';
import { db } from '@/lib/db/drizzle';
import { cannedResponses } from '@/lib/db/schema';

const CATEGORIES = ['saludo', 'espera', 'cierre', 'general'] as const;
type Category = (typeof CATEGORIES)[number];

function isValidCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export async function GET() {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

  const rows = await db
    .select()
    .from(cannedResponses)
    .orderBy(asc(cannedResponses.category), asc(cannedResponses.label));

  return NextResponse.json({ cannedResponses: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireZeroTicketsAgent();
  if (!auth.ok) return auth.response;

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

  const [created] = await db
    .insert(cannedResponses)
    .values({ label, category, content, createdBy: auth.user.id })
    .returning();

  return NextResponse.json({ cannedResponse: created });
}
