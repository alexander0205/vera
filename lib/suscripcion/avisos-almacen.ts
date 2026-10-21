/**
 * Dónde se recuerda qué avisos de suscripción ya salieron.
 *
 * Sin tabla nueva: cada aviso enviado deja una fila en `audit_logs`
 * (`action = 'SUSCRIPCION_AVISO'`, `resource` = la llave de
 * `claveAviso` en datos-aviso.ts). Es lo único de los avisos que toca la base,
 * y por eso vive aparte: la lógica de `avisos.ts` se prueba sin base,
 * cambiando este módulo por uno en memoria.
 *
 * Se consulta ANTES de enviar y se escribe DESPUÉS de que el envío salió bien.
 * Al revés, un fallo de Resend dejaría la marca puesta y el cliente no se
 * enteraría nunca (la misma regla que sigue `aviso_solo_lectura_en`).
 */

import 'server-only';
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { auditLogs, teams } from '@/lib/db/schema';
import { ACCION_AVISO } from '@/lib/suscripcion/datos-aviso';

const DIA_MS = 86_400_000;

/**
 * ¿Ya se mandó el aviso con esta llave?
 *
 * @param ventanaDias Solo cuenta lo enviado en los últimos N días. null = nunca
 *                    expira (las llaves con ID de Stripe no se repiten).
 */
export async function yaAvisado(
  clave: string,
  ventanaDias: number | null,
  ahora: Date = new Date(),
): Promise<boolean> {
  const condiciones = [
    eq(auditLogs.action, ACCION_AVISO),
    eq(auditLogs.resource, clave),
  ];
  if (ventanaDias != null) {
    condiciones.push(gte(auditLogs.createdAt, new Date(ahora.getTime() - ventanaDias * DIA_MS)));
  }

  const [fila] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(...condiciones))
    .limit(1);
  return Boolean(fila);
}

/**
 * Deja constancia de un aviso ya enviado.
 *
 * Si la escritura falla NO se lanza: el correo ya salió, y devolver error aquí
 * haría creer que no. Lo peor que pasa es un duplicado cuando Stripe reintente
 * — que es exactamente lo que ocurría antes de existir esto.
 */
export async function registrarAviso(
  teamId: number,
  clave: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      teamId,
      userId: null,
      actor: 'system',
      action: ACCION_AVISO,
      resource: clave,
      metadata: JSON.stringify(meta),
    });
  } catch (err) {
    console.error(`[avisos] se envió ${clave} pero no se pudo registrar:`, err);
  }
}

/**
 * La empresa a la que Stripe dice que pertenece algo, por el `teamId` que
 * nosotros mismos grabamos en la metadata de la suscripción (onboarding y
 * checkout lo ponen siempre).
 *
 * Existe por una carrera, no por comodidad: el webhook busca a la empresa por
 * `stripe_customer_id`, pero esa columna se escribe DESPUÉS de crear en Stripe
 * — el onboarding la guarda cuando `subscriptions.create` ya devolvió, y el
 * checkout cuando llega `checkout.session.completed`. Los eventos
 * `subscription.created` e `invoice.payment_succeeded` pueden llegar antes, y
 * hasta ahora caían en «team not found» y se perdían: justo los dos momentos
 * en que el cliente más quiere que le confirmen algo.
 *
 * Solo se acepta si la empresa AÚN NO tiene customer, o tiene este mismo: un
 * `teamId` en la metadata de un customer ajeno no puede mandar el correo a otra
 * empresa.
 */
export async function equipoPorMetadata(
  teamIdTexto: string | null | undefined,
  customerId: string,
): Promise<{ id: number } | null> {
  const id = Number(teamIdTexto);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [equipo] = await db
    .select({ id: teams.id, stripeCustomerId: teams.stripeCustomerId })
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);

  if (!equipo) return null;
  if (equipo.stripeCustomerId && equipo.stripeCustomerId !== customerId) return null;
  return { id: equipo.id };
}

/** Una empresa en prueba cuyo fin cae en la ventana que se está mirando. */
export interface PruebaEnCurso {
  teamId: number;
  suscripcionId: string;
  trialEnd: Date;
}

/**
 * Las pruebas que terminan entre `desde` y `hasta`. Es solo un filtro grueso
 * para no traer todo: quien decide si faltan EXACTAMENTE siete días es
 * `venceExactamenteEn`, que cuenta por fecha dominicana y no por horas.
 */
export async function pruebasQueTerminanEntre(
  desde: Date,
  hasta: Date,
): Promise<PruebaEnCurso[]> {
  const filas = await db
    .select({
      teamId:        teams.id,
      suscripcionId: teams.stripeSubscriptionId,
      trialEnd:      teams.trialEnd,
    })
    .from(teams)
    .where(and(
      eq(teams.subscriptionStatus, 'trialing'),
      isNotNull(teams.stripeSubscriptionId),
      isNotNull(teams.trialEnd),
      gte(teams.trialEnd, desde),
      lte(teams.trialEnd, hasta),
    ));

  return filas.flatMap(f =>
    f.suscripcionId && f.trialEnd
      ? [{ teamId: f.teamId, suscripcionId: f.suscripcionId, trialEnd: f.trialEnd }]
      : [],
  );
}
