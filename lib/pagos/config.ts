/**
 * Config de pasarelas por empresa (payment_provider_config).
 * Secretos cifrados AES-256-GCM. Nunca devolver el secreto en claro al cliente.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { paymentProviderConfig } from '@/lib/db/schema';
import { encryptField } from '@/lib/crypto/cert';

export type PaymentProviderRow = typeof paymentProviderConfig.$inferSelect;

/** Proveedores soportados. 'simulador' = gateway interno para pruebas/demo. */
export const PROVIDERS = ['cardnet', 'azul', 'simulador'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<string, string> = {
  cardnet:   'CardNet',
  azul:      'Azul',
  simulador: 'Simulador (pruebas)',
};

/** Config de un proveedor para un team (o null si no existe). */
export async function getProviderConfig(teamId: number, provider: string): Promise<PaymentProviderRow | null> {
  const [row] = await db.select().from(paymentProviderConfig)
    .where(and(eq(paymentProviderConfig.teamId, teamId), eq(paymentProviderConfig.provider, provider)))
    .limit(1);
  return row ?? null;
}

/** Primer proveedor ACTIVO del team (para generar links). null si ninguno. */
export async function getActiveProvider(teamId: number): Promise<PaymentProviderRow | null> {
  const rows = await db.select().from(paymentProviderConfig)
    .where(and(eq(paymentProviderConfig.teamId, teamId), eq(paymentProviderConfig.enabled, true)));
  // Prioridad: cardnet > azul > simulador.
  const orden = ['cardnet', 'azul', 'simulador'];
  return rows.sort((a, b) => orden.indexOf(a.provider) - orden.indexOf(b.provider))[0] ?? null;
}

/** Todos los configs del team, SIN el secreto en claro (para la UI). */
export async function listProviderConfigsSafe(teamId: number) {
  const rows = await db.select().from(paymentProviderConfig)
    .where(eq(paymentProviderConfig.teamId, teamId));
  return rows.map((r) => ({
    provider:   r.provider,
    merchantId: r.merchantId,
    terminalId: r.terminalId,
    ambiente:   r.ambiente,
    enabled:    r.enabled,
    hasAuthKey: !!r.authKey,
    hasApiKey:  !!r.apiKey,
  }));
}

export interface UpsertProviderInput {
  teamId:     number;
  provider:   string;
  merchantId?: string | null;
  terminalId?: string | null;
  /** Secreto principal en claro (CardNet AuthKey / Azul Auth1). undefined = no cambiar. */
  authKeyPlain?: string;
  /** Segundo secreto (Azul Auth2). undefined = no cambiar. */
  apiKeyPlain?: string;
  ambiente:   'sandbox' | 'prod';
  enabled:    boolean;
}

/** Crea o actualiza la config de un proveedor (cifra los secretos). */
export async function upsertProviderConfig(input: UpsertProviderInput) {
  const existing = await getProviderConfig(input.teamId, input.provider);

  const authKey = input.authKeyPlain
    ? encryptField(input.authKeyPlain)
    : existing?.authKey ?? null;
  const apiKey = input.apiKeyPlain
    ? encryptField(input.apiKeyPlain)
    : existing?.apiKey ?? null;

  const values = {
    teamId:     input.teamId,
    provider:   input.provider,
    merchantId: input.merchantId ?? null,
    terminalId: input.terminalId ?? null,
    authKey,
    apiKey,
    ambiente:   input.ambiente,
    enabled:    input.enabled,
    updatedAt:  new Date(),
  };

  if (existing) {
    await db.update(paymentProviderConfig).set(values)
      .where(eq(paymentProviderConfig.id, existing.id));
  } else {
    await db.insert(paymentProviderConfig).values(values);
  }
}
