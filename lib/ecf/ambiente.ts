/**
 * Ambiente DGII de la empresa — ¿está en Producción de verdad?
 *
 * Solo se le manda un e-CF a la DGII cuando la empresa está aprobada para
 * Producción. En TesteCF/CerteCF la DGII sí acepta el documento, pero es un
 * envío de prueba: emitir ahí creyendo que es real quema números de la
 * secuencia fiscal y ensucia el historial del contribuyente.
 *
 * La fuente de verdad es ecf-api, no la DB local (ver comentario en
 * lib/db/schema.ts sobre teams: el ambiente NO se duplica acá). Se usa
 * `dgii-status` porque trae ambiente y vigencia del certificado en una sola
 * llamada.
 *
 * Caché corto en memoria: sin él, cada pantalla de factura y cada emisión le
 * pegaría a ecf-api. 60s es suficiente — un cambio de ambiente es un evento
 * de días, no de segundos.
 *
 * FALLA CERRADO: si ecf-api no contesta, `confirmado` queda en false y quien
 * llama debe bloquear. No poder confirmar el ambiente no es lo mismo que estar
 * en Producción.
 */

import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { dgiiStatus } from '@/lib/ecf-api/client';

export interface AmbienteDgii {
  /** 'Produccion' | 'CerteCF' | 'TesteCF', o null si no se pudo averiguar. */
  ambiente: string | null;
  /** true solo si ecf-api confirmó que la empresa está en Producción. */
  esProduccion: boolean;
  /** false = ecf-api no respondió o la empresa no está registrada. */
  confirmado: boolean;
  /** Certificado de firma vigente y no revocado (dato informativo). */
  certificadoVigente: boolean;
}

const NO_CONFIRMADO: AmbienteDgii = {
  ambiente: null,
  esProduccion: false,
  confirmado: false,
  certificadoVigente: false,
};

const TTL_MS = 60_000;

const cache = new Map<number, { valor: AmbienteDgii; expira: number }>();

/** Invalida el caché de una empresa (usar tras promover ambiente en admin). */
export function invalidarAmbienteCache(teamId: number): void {
  cache.delete(teamId);
}

export async function getAmbienteDgii(teamId: number): Promise<AmbienteDgii> {
  const hit = cache.get(teamId);
  if (hit && hit.expira > Date.now()) return hit.valor;

  const [team] = await db
    .select({ cp: teams.ecfCodigoPublico })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  // Sin contribuyente en ecf-api no hay ambiente que confirmar. No se cachea:
  // en cuanto se registre queremos verlo sin esperar el TTL.
  if (!team?.cp) return NO_CONFIRMADO;

  try {
    const status = await dgiiStatus.get(team.cp);
    const valor: AmbienteDgii = {
      ambiente: status.ambiente ?? null,
      esProduccion: status.ambiente === 'Produccion',
      confirmado: true,
      certificadoVigente: !!status.certificado?.vigente && !status.certificado?.revocado,
    };
    cache.set(teamId, { valor, expira: Date.now() + TTL_MS });
    return valor;
  } catch (e) {
    // Falla cerrado a propósito: los negativos NO se cachean, así el sistema
    // se recupera en el primer request bueno en vez de quedar bloqueado 60s.
    console.error('[ecf/ambiente] ecf-api no respondió, teamId=%d:', teamId, e);
    return NO_CONFIRMADO;
  }
}
