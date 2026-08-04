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
