import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappConfig } from '@/lib/db/schema';
import { encryptField, decryptField } from '@/lib/crypto/cert';

export interface WhatsAppTeamConfig {
  negocioId: string;
  apiKey: string;
  webhookSecret: string | null;
  conectado: boolean;
  numeroWhatsapp: string | null;
}

/** Quién manda el mensaje: el número del propio negocio, o el de Zero. */
export interface RemitenteWhatsApp {
  apiKey: string;
  /** true = número del negocio · false = número de Zero (respaldo). */
  propio: boolean;
}

/**
 * Decide con qué número sale un mensaje. Puro y sin base de datos: es la regla
 * que decide de quién parece venir un aviso, y quería poder probarla sola.
 *
 * Por defecto sale por el de Zero. Conectar el número propio es una mejora que
 * el negocio hace cuando quiere y como quiere, no un requisito para que le
 * funcionen los avisos: pedirle a un colegio que abra una cuenta de Meta
 * Business antes de poder recordar una mensualidad es pedirle que no los use.
 *
 * El suyo gana en cuanto lo conecta. Y conviene que lo conecte, porque con el
 * de Zero: las respuestas de los padres llegan a NUESTRO buzón, no al suyo; la
 * calificación del número la comparten todos los colegios —si los padres de uno
 * reportan, Meta frena los envíos de TODOS—; y lo pagamos nosotros.
 *
 * Ojo con `conectado`: hay filas con negocio creado y número sin conectar
 * todavía. Esas NO valen como remitente, y sin este chequeo el aviso saldría
 * con una llave que el CRM contesta con 409.
 */
export function elegirRemitente(
  propia: WhatsAppTeamConfig | null,
  llaveZero: string | undefined,
): RemitenteWhatsApp | null {
  if (propia?.conectado) return { apiKey: propia.apiKey, propio: true };
  if (llaveZero) return { apiKey: llaveZero, propio: false };
  return null;
}

/** `elegirRemitente` con la config del team ya buscada. Devuelve null si no hay ninguna vía. */
export async function resolverRemitente(teamId: number): Promise<RemitenteWhatsApp | null> {
  return elegirRemitente(await getWhatsAppConfig(teamId), process.env.CRM_ZERO_API_KEY);
}

export async function getWhatsAppConfig(teamId: number): Promise<WhatsAppTeamConfig | null> {
  const [row] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
  if (!row) return null;
  return {
    negocioId: row.negocioId,
    apiKey: decryptField({ ciphered: row.apiKeyCiphered, iv: row.apiKeyIv, authTag: row.apiKeyAuthTag }),
    webhookSecret: row.webhookSecretCiphered
      ? decryptField({ ciphered: row.webhookSecretCiphered, iv: row.webhookSecretIv!, authTag: row.webhookSecretAuthTag! })
      : null,
    conectado: row.conectado,
    numeroWhatsapp: row.numeroWhatsapp,
  };
}

export async function crearWhatsAppConfig(teamId: number, negocioId: string, apiKey: string) {
  const enc = encryptField(apiKey);
  await db.insert(whatsappConfig).values({
    teamId,
    negocioId,
    apiKeyCiphered: enc.ciphered,
    apiKeyIv: enc.iv,
    apiKeyAuthTag: enc.authTag,
  });
}

export async function guardarWebhookSecret(teamId: number, secret: string) {
  const enc = encryptField(secret);
  await db.update(whatsappConfig).set({
    webhookSecretCiphered: enc.ciphered,
    webhookSecretIv: enc.iv,
    webhookSecretAuthTag: enc.authTag,
    actualizadoEn: new Date(),
  }).where(eq(whatsappConfig.teamId, teamId));
}

export async function actualizarEstadoConexion(teamId: number, conectado: boolean, numeroWhatsapp: string | null) {
  await db.update(whatsappConfig).set({
    conectado,
    numeroWhatsapp,
    actualizadoEn: new Date(),
  }).where(eq(whatsappConfig.teamId, teamId));
}
