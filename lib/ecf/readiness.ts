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
 *
 * ── GATE DE PRODUCCIÓN ───────────────────────────────────────────────────────
 * Además de lo local, se exige que ecf-api confirme `ambiente === 'Produccion'`.
 * En TesteCF/CerteCF la DGII acepta el envío, pero es de prueba: emitir ahí
 * creyendo que es real quema números de la secuencia fiscal. Falla cerrado —
 * si no se puede confirmar el ambiente, no se emite.
 *
 * Excepción (`permitirFueraDeProduccion`): desarrollo local o admin de
 * plataforma. Así seguimos pudiendo certificar empresas en TesteCF desde el
 * asistente de habilitación y trabajar en local, sin que un usuario normal en
 * producción pueda mandarle a la DGII desde un ambiente de pruebas.
 */

import { cache } from 'react';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, sequences } from '@/lib/db/schema';
import { getAmbienteDgii } from '@/lib/ecf/ambiente';

export interface DgiiReadiness {
  /** true → puede emitir tipos fiscales (31/32/…) */
  ready: boolean;
  rnc: boolean;
  registradaEcfApi: boolean;
  secuenciaFiscalActiva: boolean;
  habilitacionCompletada: boolean;
  /** ecf-api confirmó ambiente 'Produccion'. */
  enProduccion: boolean;
  /** Ambiente reportado por ecf-api: 'Produccion' | 'CerteCF' | 'TesteCF' | null. */
  ambiente: string | null;
  /** false = ecf-api no respondió; se bloquea por precaución. */
  ambienteConfirmado: boolean;
  /** El gate de producción se saltó por desarrollo o admin de plataforma. */
  omitidoPorPrivilegio: boolean;
}

/**
 * ¿Este actor puede emitir fuera de Producción?
 *
 * Se resuelve SIEMPRE en el servidor. No debe depender de ningún campo del
 * body: un flag que mande el cliente sería un bypass de una línea de JSON.
 */
export function permitirFueraDeProduccion(platformRole?: string | null): boolean {
  return process.env.NODE_ENV === 'development' || platformRole === 'admin';
}

export const getDgiiReadiness = cache(async (
  teamId: number,
  /** platformRole del usuario en sesión. Sin él, se aplica el gate estricto. */
  platformRole?: string | null,
): Promise<DgiiReadiness> => {
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
    return {
      ready: false, rnc: false, registradaEcfApi: false, secuenciaFiscalActiva: false,
      habilitacionCompletada: false, enProduccion: false, ambiente: null,
      ambienteConfirmado: false, omitidoPorPrivilegio: false,
    };
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
  const baseLocal = rnc && registradaEcfApi && secuenciaFiscalActiva;

  const omitidoPorPrivilegio = permitirFueraDeProduccion(platformRole);

  // Solo se le pregunta el ambiente a ecf-api si lo local ya cuadra: no tiene
  // sentido gastar la llamada en una empresa que igual no puede emitir.
  const amb = baseLocal
    ? await getAmbienteDgii(teamId)
    : { ambiente: null, esProduccion: false, confirmado: false, certificadoVigente: false };

  return {
    // Falla cerrado: sin confirmación de Producción no se emite, salvo que el
    // actor tenga el privilegio (desarrollo o admin de plataforma).
    ready: baseLocal && (amb.esProduccion || omitidoPorPrivilegio),
    rnc,
    registradaEcfApi,
    secuenciaFiscalActiva,
    habilitacionCompletada: !!team.completadoAt,
    enProduccion: amb.esProduccion,
    ambiente: amb.ambiente,
    ambienteConfirmado: amb.confirmado,
    omitidoPorPrivilegio,
  };
});
