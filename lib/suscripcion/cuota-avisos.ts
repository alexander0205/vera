/**
 * Cuánto le queda a un colegio de sus avisos del mes.
 *
 * De los seis límites del modelo, WhatsApp y SMS son los únicos que se
 * traducen en una factura NUESTRA por cada unidad consumida. Los demás
 * (comprobantes, usuarios, estudiantes) son topes comerciales: pasarse cuesta
 * una conversación. Pasarse de mensajes cuesta dinero, todos los días, sin
 * que nadie se entere hasta que llega la factura del proveedor.
 *
 * El correo no entra: sale por Resend a costo despreciable y es el único canal
 * que le queda a una familia sin celular. Ver CANALES_SIN_TOPE.
 */

import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarAvisosEnviados, teams } from '@/lib/db/schema';
import { getPlan } from '@/lib/config/plans';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { evaluarLimite, limiteDelCanal, type EstadoLimite } from '@/lib/config/suscripcion';

/** Los canales con tope. Coincide con las claves de LIMITES que aplican aquí. */
export type CanalConTope = 'whatsapp' | 'sms';

export const CANALES_CON_TOPE: readonly CanalConTope[] = ['whatsapp', 'sms'];

/** Primer instante del mes en curso. El tope es por mes calendario. */
function inicioDelMes(ahora = new Date()): Date {
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
}

/**
 * Avisos ya enviados este mes, por canal, en una sola consulta.
 *
 * Se apoya en el índice `admin_escolar_avisos_team_fecha (team_id, enviado_at)`
 * que ya existe. Un canal sin filas no aparece en el resultado — de ahí el 0
 * por defecto al leer.
 */
export async function avisosDelMes(
  teamId: number,
  ahora = new Date(),
): Promise<Record<string, number>> {
  const filas = await db
    .select({
      canal: adminEscolarAvisosEnviados.canal,
      n: sql<number>`count(*)::int`,
    })
    .from(adminEscolarAvisosEnviados)
    .where(and(
      eq(adminEscolarAvisosEnviados.teamId, teamId),
      gte(adminEscolarAvisosEnviados.enviadoAt, inicioDelMes(ahora)),
    ))
    .groupBy(adminEscolarAvisosEnviados.canal);

  return Object.fromEntries(filas.map(f => [f.canal, f.n]));
}

export interface CuotaAvisos {
  /** Estado de cada canal con tope, para pintarlo o para decidir. */
  porCanal: Record<CanalConTope, EstadoLimite>;
  /**
   * Cuántos mensajes más puede mandar cada canal. Infinity = sin tope.
   * Es lo que consume el despachador mientras recorre la tanda.
   */
  restante: Record<CanalConTope, number>;
}

/**
 * Cuota de avisos de un colegio, ahora mismo.
 *
 * Con el billing apagado todo sale sin tope: es el estado de hoy y este
 * archivo no debe ser lo que empiece a cortar mensajes antes de tiempo.
 */
export async function cuotaAvisos(
  teamId: number,
  ahora = new Date(),
): Promise<CuotaAvisos> {
  const [fila] = await db
    .select({ planName: teams.planName })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const plan = getPlan(fila?.planName);
  const usados = await avisosDelMes(teamId, ahora);

  const topes: Record<CanalConTope, number> = BILLING_ENABLED
    ? { whatsapp: plan.limits.whatsappMensajes, sms: plan.limits.smsMensajes }
    : { whatsapp: -1, sms: -1 };

  const porCanal = {} as Record<CanalConTope, EstadoLimite>;
  const restante = {} as Record<CanalConTope, number>;

  for (const canal of CANALES_CON_TOPE) {
    const usado = usados[canal] ?? 0;
    const tope  = topes[canal];
    porCanal[canal] = evaluarLimite(canal, usado, tope);
    restante[canal] = tope < 0 ? Infinity : Math.max(0, tope - usado);
  }

  return { porCanal, restante };
}

/**
 * Cuánto le queda a un canal cualquiera, incluido el correo.
 *
 * Los canales sin tope devuelven Infinity en vez de 0, que es la diferencia
 * entre "manda todo lo que quieras" y "no mandes nada". Confundirlas dejaría
 * al correo mudo, que es el canal que menos debe callarse.
 */
export function restanteDelCanal(cuota: CuotaAvisos, canal: string): number {
  const clave = limiteDelCanal(canal);
  if (!clave || clave === 'docs' || clave === 'usuarios' || clave === 'estudiantes') {
    return Infinity;
  }
  return cuota.restante[clave];
}
