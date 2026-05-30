import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { me, contribuyentes } from '@/lib/ecf-api/client';

/**
 * Ambiente DGII del TENANT activo (TesteCF/CerteCF/Produccion).
 * Fuente de verdad: ecf-api — el ambiente del contribuyente de la empresa
 * activa (contribuyentes.get(codigoPublico).ambiente). Cambia al cambiar de
 * empresa. Si la empresa aún no está registrada en ecf-api, cae al ambiente
 * por defecto del software (me().software.ambienteDefault).
 *
 * Llamada directa al API en cada request — no se cachea ni vive en la DB local.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return Response.json({ ambiente: null });

  try {
    const [team] = await db
      .select({ cp: teams.ecfCodigoPublico })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (team?.cp) {
      const contrib = await contribuyentes.get(team.cp);
      return Response.json({ ambiente: contrib.ambiente });
    }

    // Empresa sin contribuyente en ecf-api → ambiente por defecto del software.
    const info = await me();
    return Response.json({ ambiente: info.software.ambienteDefault });
  } catch (e) {
    console.error('[api/sistema/ambiente] ecf-api error:', e);
    return Response.json({ ambiente: null });
  }
}
