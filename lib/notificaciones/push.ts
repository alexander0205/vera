/**
 * Envío de avisos push (Web Push, protocolo VAPID) a los dispositivos de quienes
 * activaron los avisos.
 *
 * Es OPCIONAL a propósito: sin las llaves VAPID en el entorno, no hace nada y lo
 * dice una sola vez en el log. La campana funciona igual; lo que falta es el
 * empujón al celular. Variables:
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   la llave pública (la lee el navegador)
 *   VAPID_PRIVATE_KEY              la privada (solo el servidor)
 *   VAPID_SUBJECT                  mailto: o URL de contacto (por defecto soporte@zero.com.do)
 *
 * Se generan una vez con `npx web-push generate-vapid-keys`.
 *
 * Solo sale desde producción (`VERCEL_ENV === 'production'`), igual que los
 * correos del colegio: una copia de la base trae los dispositivos reales de las
 * personas, y una prueba en local o en un preview no puede hacerles sonar el
 * teléfono. Fuera de producción el aviso queda en el log.
 */

import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pushSuscripciones } from '@/lib/db/schema';
import type { PayloadPush } from './texto';

const SUBJECT_POR_DEFECTO = 'mailto:soporte@zero.com.do';

/** Tope de dispositivos por aviso: un colegio no tiene cientos de empleados. */
const MAX_DISPOSITIVOS = 200;

export interface ClavesVapid {
  publica: string;
  privada: string;
  subject: string;
}

/** Las llaves VAPID del entorno, o `null` si no están puestas. */
export function claveVapid(): ClavesVapid | null {
  const publica = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? '').trim();
  const privada = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  if (!publica || !privada) return null;
  return { publica, privada, subject: (process.env.VAPID_SUBJECT ?? '').trim() || SUBJECT_POR_DEFECTO };
}

/** La llave pública para el navegador; `null` oculta el botón de activar. */
export const clavePublicaVapid = (): string | null => claveVapid()?.publica ?? null;

let avisadoSinLlaves = false;
let avisadoFueraDeProduccion = false;

type WebPush = typeof import('web-push');
let configurado: Promise<WebPush | null> | null = null;

/** `web-push` ya configurado, o `null`. Se importa al usarlo, no al cargar la ruta. */
function cargarWebPush(): Promise<WebPush | null> {
  configurado ??= (async () => {
    const llaves = claveVapid();
    if (!llaves) {
      if (!avisadoSinLlaves) {
        avisadoSinLlaves = true;
        console.warn('[push] sin VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY: los avisos push están apagados.');
      }
      return null;
    }
    const mod = await import('web-push');
    const webpush: WebPush = (mod as unknown as { default?: WebPush }).default ?? mod;
    webpush.setVapidDetails(llaves.subject, llaves.publica, llaves.privada);
    return webpush;
  })();
  return configurado;
}

/** ¿Este entorno puede empujar a dispositivos reales? */
const pushDeVerdad = () => process.env.VERCEL_ENV === 'production';

/** El código de estado con que el servicio de push rechazó la suscripción, si lo hubo. */
const estadoDe = (e: unknown): number | undefined =>
  typeof e === 'object' && e !== null && 'statusCode' in e
    ? Number((e as { statusCode: unknown }).statusCode)
    : undefined;

/**
 * Empuja `payload` a todos los dispositivos de estas personas. Nunca lanza.
 *
 * Una suscripción que el servicio de push da por muerta (404 o 410: se
 * desinstaló el navegador, se revocó el permiso) se borra aquí mismo; dejarla
 * haría que cada pago intentara de nuevo para siempre.
 */
export async function empujarA(userIds: readonly number[], payload: PayloadPush): Promise<number> {
  try {
    if (userIds.length === 0) return 0;
    const webpush = await cargarWebPush();
    if (!webpush) return 0;

    const subs = await db.select().from(pushSuscripciones)
      .where(inArray(pushSuscripciones.userId, [...userIds]))
      .limit(MAX_DISPOSITIVOS);
    if (subs.length === 0) return 0;

    if (!pushDeVerdad()) {
      if (!avisadoFueraDeProduccion) {
        avisadoFueraDeProduccion = true;
        console.info(`[push] fuera de producción no se empuja a dispositivos (${subs.length} suscritos). Aviso: «${payload.title}»`);
      }
      return 0;
    }

    const cuerpo = JSON.stringify(payload);
    const resultados = await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          cuerpo,
          // Un pago de hace un día ya no es una noticia: si el dispositivo estaba
          // apagado y no lo recibe en 24 h, se descarta. `high` para que el
          // sistema operativo lo entregue aunque el teléfono esté dormido.
          { TTL: 86_400, urgency: 'high' },
        );
        return true;
      } catch (e) {
        const estado = estadoDe(e);
        if (estado === 404 || estado === 410) {
          await db.delete(pushSuscripciones).where(eq(pushSuscripciones.endpoint, s.endpoint));
        } else {
          console.error('[push] no se pudo avisar a un dispositivo:', estado ?? (e instanceof Error ? e.message : e));
        }
        return false;
      }
    }));
    return resultados.filter((r) => r.status === 'fulfilled' && r.value).length;
  } catch (e) {
    console.error('[push] falló el envío:', e instanceof Error ? e.message : e);
    return 0;
  }
}
