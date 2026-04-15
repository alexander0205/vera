import { NextResponse } from 'next/server';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { clients, sequences, ecfDocuments } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [team, clientCount, seqCount, docCount] = await Promise.all([
    getTeamProfile(teamId),
    db.select({ c: count() }).from(clients).where(eq(clients.teamId, teamId)),
    db.select({ c: count() }).from(sequences).where(eq(sequences.teamId, teamId)),
    db.select({ c: count() }).from(ecfDocuments).where(eq(ecfDocuments.teamId, teamId)),
  ]);

  return NextResponse.json({
    tieneCertificado: !!team?.certP12,
    tieneSecuencias: (seqCount[0]?.c ?? 0) > 0,
    tieneClientes: (clientCount[0]?.c ?? 0) > 0,
    tieneFacturas: (docCount[0]?.c ?? 0) > 0,
    perfilCompleto: !!(team?.rnc && team?.razonSocial && team?.direccion),
  });
}
