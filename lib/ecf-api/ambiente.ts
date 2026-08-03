/**
 * Ambiente DGII del tenant — fuente de verdad para el gate de emisión.
 *
 * El ambiente vive en ecf-api (contrib.ambiente), nunca en la DB local: la
 * migración 0027 borró `teams.dgii_environment` justo porque la copia local se
 * desincronizaba. Aquí solo se cachea en memoria, con TTL corto.
 *
 * Regla: únicamente un contribuyente en 'Produccion' emite comprobantes con
 * valor fiscal. TesteCF y CerteCF son ambientes de prueba y certificación —
 * lo que se "emite" ahí no existe para la DGII.
 */

import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { me, contribuyentes, type AmbienteEcf } from '@/lib/ecf-api/client';

/** TTL del caché. Corto a propósito: promover a Producción debe notarse rápido. */
const TTL_MS = 5 * 60 * 1000;

type Entrada = { ambiente: AmbienteEcf | null; expiraEn: number };

const AMBIENTES: readonly AmbienteEcf[] = ['TesteCF', 'CerteCF', 'Produccion'];

function esAmbienteConocido(v: string | null | undefined): v is AmbienteEcf {
  return v != null && (AMBIENTES as readonly string[]).includes(v);
}

/**
 * Caché por instancia (no compartido entre lambdas). Suficiente: el peor caso
 * es una llamada extra a ecf-api por instancia cada 5 min, y nunca sirve un
 * ambiente más viejo que eso.
 */
const cache = new Map<number, Entrada>();

/**
 * Ambiente del tenant, o null si ecf-api no respondió.
 *
 * null NO significa "sin restricción" — significa "no se pudo verificar", y
 * quien decide sobre emisión debe tratarlo como bloqueo (ver `puedeEmitirADgii`).
 */
export async function getAmbienteTenant(teamId: number): Promise<AmbienteEcf | null> {
  const hit = cache.get(teamId);
  if (hit && hit.expiraEn > Date.now()) return hit.ambiente;

  let ambiente: AmbienteEcf | null = null;
  try {
    const [team] = await db
      .select({ cp: teams.ecfCodigoPublico })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (team?.cp) {
      const contrib = await contribuyentes.get(team.cp);
      ambiente = contrib.ambiente ?? null;
    } else {
      // Empresa aún no registrada en ecf-api → ambiente por defecto del software.
      // `ambienteDefault` viene como string libre; solo se acepta si coincide
      // con un ambiente conocido — cualquier otra cosa se trata como no
      // verificado, que para el gate equivale a bloqueo.
      const info = await me();
      ambiente = esAmbienteConocido(info.software.ambienteDefault)
        ? info.software.ambienteDefault
        : null;
    }
  } catch (e) {
    console.error(`[ambiente] ecf-api no respondió para team ${teamId}:`, e);
    // No se cachea el fallo: el próximo intento vuelve a preguntar.
    return null;
  }

  cache.set(teamId, { ambiente, expiraEn: Date.now() + TTL_MS });
  return ambiente;
}

/**
 * ¿Este tenant puede mandar comprobantes a la DGII?
 *
 * Falla cerrado: si ecf-api no responde no se emite. Un comprobante fiscal
 * emitido contra el ambiente equivocado no se puede "des-emitir", así que el
 * costo de un falso negativo (una factura que espera) es muy inferior al de un
 * falso positivo.
 */
export async function puedeEmitirADgii(teamId: number): Promise<boolean> {
  return (await getAmbienteTenant(teamId)) === 'Produccion';
}

/** Mensaje único para las rutas que rechazan por ambiente. */
export function mensajeAmbienteNoProduccion(ambiente: AmbienteEcf | null): string {
  if (ambiente == null) {
    return 'No se pudo verificar el ambiente DGII de la empresa. Intenta de nuevo en un momento.';
  }
  return `Esta empresa está en ambiente ${ambiente}, no en Producción. `
    + 'Los comprobantes fiscales electrónicos solo tienen validez en Producción. '
    + 'Completa la habilitación ante la DGII para emitir.';
}

/** Solo para tests y para el flujo de promoción a Producción. */
export function invalidarCacheAmbiente(teamId?: number): void {
  if (teamId == null) cache.clear();
  else cache.delete(teamId);
}
