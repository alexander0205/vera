/**
 * DGII readiness — ¿esta empresa puede emitir e-CF fiscales?
 *
 * Fuente única de verdad para el gate de tipos fiscales (E31/E32/…): la UI
 * (useTiposDisponibles, POS) y el server (/api/ecf/emitir) preguntan aquí.
 * Sin DGII lista, la empresa solo ve/usa `sin-ncf` (factura interna/ticket).
 *
 * Señales locales (sin llamar a ecf-api en caliente):
 *   - rnc presente                  → perfil fiscal mínimo
 *   - ecfCodigoPublico != null      → registrada en ecf-api (dueño de
 *     certificado y ambiente; se setea al subir certificado / registrar)
 *   - secuencia fiscal ACTIVA       → hay rango e-NCF del cual consumir
 *
 * `habilitacionCompletadoAt` NO es requisito (el flujo asistido puede emitir
 * en TesteCF durante las pruebas); se expone como dato informativo.
 */

import { cache } from 'react';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, sequences } from '@/lib/db/schema';

export interface DgiiReadiness {
  /** true → puede emitir tipos fiscales (31/32/…) */
  ready: boolean;
  rnc: boolean;
  registradaEcfApi: boolean;
  secuenciaFiscalActiva: boolean;
  habilitacionCompletada: boolean;
}

export const getDgiiReadiness = cache(async (teamId: number): Promise<DgiiReadiness> => {
  const [team] = await db
    .select({
      rnc: teams.rnc,
      codigo: teams.ecfCodigoPublico,
      completadoAt: teams.habilitacionCompletadoAt,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    return { ready: false, rnc: false, registradaEcfApi: false, secuenciaFiscalActiva: false, habilitacionCompletada: false };
  }

  // ¿Alguna secuencia fiscal (≠ sin-ncf) vigente y con números disponibles?
  const [seq] = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(and(
      eq(sequences.teamId, teamId),
      ne(sequences.tipoEcf, 'sin-ncf'),
      sql`(${sequences.fechaVencimiento} IS NULL OR ${sequences.fechaVencimiento} >= CURRENT_DATE)`,
      sql`${sequences.secuenciaActual} <= ${sequences.secuenciaHasta}`,
    ))
    .limit(1);

  const rnc = !!team.rnc;
  const registradaEcfApi = !!team.codigo;
  const secuenciaFiscalActiva = !!seq;

  return {
    ready: rnc && registradaEcfApi && secuenciaFiscalActiva,
    rnc,
    registradaEcfApi,
    secuenciaFiscalActiva,
    habilitacionCompletada: !!team.completadoAt,
  };
});
