import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setPruebas, simulacion } from '@/lib/ecf-api/client';
import { ensureContribuyente } from '@/lib/ecf-api/contribuyente';

/**
 * Verifica que `runId` pertenezca al team dado.
 *
 * Un mismo endpoint de ecf-api (ej. `/set-pruebas/runs/{runId}/package`) se
 * usa tanto para runs del flujo "Set de Pruebas" como para runs del flujo
 * "Simulación" (paso 4/5 del stepper) — no sabemos de antemano cuál es cuál
 * del lado de vera. Por eso probamos las dos vías de verificación:
 *
 *   1. `setPruebas.listRuns()` trae `rncEmisor` por corrida → si aparece
 *      ahí y coincide con el RNC del team, es dueño.
 *   2. Si no aparece, puede ser un run de Simulación: `simulacion.getRun`
 *      SÍ está acotado por `codigoPublico` en ecf-api — si responde sin
 *      error para el `codigoPublico` propio del team, es dueño.
 */
export async function ownsRun(teamId: number, runId: string): Promise<boolean> {
  const [team] = await db.select({ rnc: teams.rnc }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team?.rnc) return false;

  const all = await setPruebas.listRuns();
  const run = all.find(r => r.importId === runId);
  if (run) return run.rncEmisor === team.rnc;

  try {
    const cp = await ensureContribuyente(teamId);
    await simulacion.getRun(cp, runId);
    return true; // no lanzó → ecf-api confirma que este runId es de este cp
  } catch {
    return false;
  }
}
