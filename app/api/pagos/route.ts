import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { payments, ecfDocuments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const docId = req.nextUrl.searchParams.get('ecfDocumentId');
  const conditions: Parameters<typeof and>[0][] = [eq(payments.teamId, teamId)];
  if (docId) conditions.push(eq(payments.ecfDocumentId, Number(docId)));
  const rows = await db.select().from(payments).where(and(...conditions));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const { ecfDocumentId, monto, metodo, referencia, notas, fecha } = await req.json();
  if (!monto || !fecha) return NextResponse.json({ error: 'Monto y fecha son requeridos' }, { status: 400 });

  const [pago] = await db.insert(payments).values({
    teamId,
    ecfDocumentId: ecfDocumentId ?? null,
    monto: Math.round(Number(monto) * 100),
    metodo,
    referencia,
    notas,
    fecha,
    registradoPorId: user.id,
  }).returning();

  // If associated with a document, mark it as paid
  if (ecfDocumentId) {
    await db.update(ecfDocuments)
      .set({
        pagoRecibido: 'true',
        pagoMetodo: metodo,
        pagoValorCts: Math.round(Number(monto) * 100),
        pagoFecha: fecha,
        updatedAt: new Date(),
      })
      .where(and(eq(ecfDocuments.id, Number(ecfDocumentId)), eq(ecfDocuments.teamId, teamId)));
  }

  return NextResponse.json(pago, { status: 201 });
}
