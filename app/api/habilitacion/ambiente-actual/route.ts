/**
 * GET /api/habilitacion/ambiente-actual
 *
 * Lectura liviana del ambiente DGII actual del team — usada por el nav del
 * dashboard para decidir dónde mostrar el link de habilitación (arriba
 * mientras no está en Producción, dentro de Configuración una vez lo está).
 *
 * A diferencia de /api/habilitacion/contexto, NO llama a ensureContribuyente
 * (que auto-registra el contribuyente en ecf-api): si el team todavía no
 * tiene ecfCodigoPublico, simplemente no ha empezado la habilitación, y no
 * hace falta ninguna llamada a ecf-api para saberlo.
 *
 * El ambiente sigue viviendo solo en ecf-api (no se duplica en la DB de
 * vera) — este endpoint lee en vivo en vez de confiar en un flag local, así
 * que también refleja correctamente a los teams que ya llegaron a
 * Producción antes de que existiera cualquier flag de completado.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { contribuyentes, EcfApiError } from '@/lib/ecf-api/client';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const [team] = await db
    .select({ ecfCodigoPublico: teams.ecfCodigoPublico })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team?.ecfCodigoPublico) {
    // Nunca se registró en ecf-api → no ha empezado la habilitación.
    return NextResponse.json({ ambiente: null });
  }

  try {
    const contrib = await contribuyentes.get(team.ecfCodigoPublico);
    // Auto-heal: si ya está en Producción pero el flag local no se marcó
    // (p.ej. equipos que llegaron a producción antes de que existiera este
    // flag), lo dejamos escrito para que el próximo load del nav ya no
    // necesite esta llamada — ver layout.tsx, que usa el flag local para
    // decidir sin esperar esta lectura en vivo.
    if (contrib.ambiente === 'Produccion') {
      await db.update(teams)
        .set({ habilitacionCompletadoAt: sql`coalesce(${teams.habilitacionCompletadoAt}, now())` })
        .where(eq(teams.id, teamId));
    }
    return NextResponse.json({ ambiente: contrib.ambiente });
  } catch (err) {
    // Fail-open: si ecf-api está caído o el código quedó huérfano, el nav no
    // debe romperse — simplemente se comporta como "no completado".
    if (err instanceof EcfApiError) {
      console.error('[GET /api/habilitacion/ambiente-actual] ecf-api', err.status, err.humanMessage);
    } else {
      console.error('[GET /api/habilitacion/ambiente-actual] unexpected', err);
    }
    return NextResponse.json({ ambiente: null });
  }
}
