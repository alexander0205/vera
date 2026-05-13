/**
 * Auto-link helpers entre teams (EmiteDO) y contribuyentes (ecf-api).
 * El link se guarda en teams.ecfCodigoPublico.
 */

import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { contribuyentes, EcfApiError, type ContribuyenteResponseDto } from './client';

export interface LinkStatus {
  linked: boolean;
  codigoPublico: string | null;
  contribuyente: ContribuyenteResponseDto | null;
  /** Si existe en ecf-api con mismo RNC pero no estaba linkeado en DB */
  autoLinked: boolean;
}

/**
 * Garantiza que un team EmiteDO esté linkeado a un contribuyente en ecf-api.
 *
 * Lógica:
 * 1. Si team.ecfCodigoPublico ya existe → fetch directo y validar
 * 2. Si NULL → buscar por RNC en ecf-api
 *    a. Si existe → auto-link (guardar cp en team)
 *    b. Si NO existe → retorna {linked: false} (UI muestra botón "Registrar")
 */
export async function ensureContribuyenteLink(teamId: number): Promise<LinkStatus> {
  const [team] = await db
    .select({
      id: teams.id,
      rnc: teams.rnc,
      ecfCodigoPublico: teams.ecfCodigoPublico,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    return { linked: false, codigoPublico: null, contribuyente: null, autoLinked: false };
  }

  // Caso 1: ya linkeado
  if (team.ecfCodigoPublico) {
    try {
      const c = await contribuyentes.get(team.ecfCodigoPublico);
      return { linked: true, codigoPublico: c.codigoPublico, contribuyente: c, autoLinked: false };
    } catch (e) {
      // Link stale (cp borrado en ecf-api) → limpiar y reintentar por RNC
      if (e instanceof EcfApiError && e.status === 404) {
        await db.update(teams).set({ ecfCodigoPublico: null }).where(eq(teams.id, teamId));
      } else {
        throw e;
      }
    }
  }

  // Caso 2: no linkeado → buscar por RNC
  if (!team.rnc) {
    return { linked: false, codigoPublico: null, contribuyente: null, autoLinked: false };
  }

  try {
    const all = await contribuyentes.list();
    const match = all.find(c => c.rnc === team.rnc);
    if (match) {
      // Auto-link
      await db.update(teams).set({ ecfCodigoPublico: match.codigoPublico }).where(eq(teams.id, teamId));
      return { linked: true, codigoPublico: match.codigoPublico, contribuyente: match, autoLinked: true };
    }
  } catch (e) {
    // ecf-api inalcanzable — devolver estado no linkeado pero loggear
    console.error('[ensureContribuyenteLink] error listing contribuyentes:', e);
  }

  return { linked: false, codigoPublico: null, contribuyente: null, autoLinked: false };
}

/**
 * Crea un contribuyente nuevo en ecf-api desde los datos del team y guarda el link.
 */
export async function createContribuyenteForTeam(teamId: number): Promise<ContribuyenteResponseDto> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) throw new Error('Team no encontrado');
  if (!team.rnc) throw new Error('Team sin RNC');
  if (!team.razonSocial) throw new Error('Team sin razón social');
  if (!team.direccion) throw new Error('Team sin dirección');

  const contrib = await contribuyentes.create({
    rnc: team.rnc,
    nombre: team.razonSocial,
    direccion: team.direccion,
    nombreComercial: team.nombreComercial ?? undefined,
    telefono: team.telefono ?? undefined,
    provincia: team.provincia ?? undefined,
    municipio: team.municipio ?? undefined,
    ambiente: (team.dgiiEnvironment as 'TesteCF' | 'CerteCF' | 'Produccion') ?? 'TesteCF',
  });

  await db
    .update(teams)
    .set({ ecfCodigoPublico: contrib.codigoPublico })
    .where(eq(teams.id, teamId));

  return contrib;
}
