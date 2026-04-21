/**
 * lib/dgii/auth.ts — Módulo central de autenticación DGII
 *
 * Gestiona el token DGII por team (cifrado AES-256-GCM en `teams.dgiiToken*`).
 * La DGII emite tokens de ~1 hora. Los renovamos con 5 minutos de margen.
 *
 * El SDK dgii-ecf maneja internamente el flujo completo de autenticación:
 *   1. GET /Semilla        → XML challenge con <valor> y <fecha>
 *   2. Firmar con P12      → XML firmado XMLDSig RSA-SHA256
 *   3. POST /ValidarSemilla → { token, expira, expedido }
 *
 * Usamos `signer.authenticate()` que encapsula todo eso sin necesidad de
 * gestionar la semilla nosotros mismos.
 */

import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DgiiClient, type DgiiEnvironment } from './client';
import { DgiiSigner } from './signer';
import { decryptField, encryptField, isEncrypted } from '@/lib/crypto/cert';

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Margen de seguridad: si el token expira en menos de este tiempo lo renovamos
 * aunque técnicamente siga válido. Evita que un request llegue con un token a
 * punto de expirar y la DGII lo rechace durante el procesamiento.
 */
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 minutos

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface DgiiAuthResult {
  client:    DgiiClient;
  token:     string;
  expiresAt: Date;
}

// ─── Entry point público ──────────────────────────────────────────────────────

/**
 * Devuelve un `DgiiClient` ya autenticado para el team indicado.
 *
 * Flujo de decisión:
 *   ┌─ ¿Token en `teams` sigue vigente (> 5 min margen)? ──────────────────┐
 *   │  SÍ → descifrar y devolver                                            │
 *   └─ NO → Autenticar ──────────────────────────────────────────────────── ┘
 *         1. Descifrar P12 + PIN del team
 *         2. Llamar signer.authenticate() — el SDK hace internamente:
 *            GET /Semilla → firma → POST /ValidarSemilla → { token, expira }
 *         3. Cifrar token y guardarlo en `teams`
 *         4. Devolver cliente autenticado
 *
 * @throws Error si el team no existe, no tiene certificado configurado,
 *              o la DGII rechaza la autenticación.
 */
export async function getDgiiAuth(teamId: number): Promise<DgiiAuthResult> {
  // ── 1. Cargar el team ────────────────────────────────────────────────────
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) throw new Error('Empresa no encontrada');

  const environment = (team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF';
  const client      = new DgiiClient(environment);

  // ── 2. ¿Token sigue vigente? ─────────────────────────────────────────────
  const tokenOk =
    isEncrypted(team.dgiiTokenCiphered, team.dgiiTokenIv, team.dgiiTokenAuthTag) &&
    team.dgiiTokenExpiresAt != null &&
    Date.now() < team.dgiiTokenExpiresAt.getTime() - TOKEN_BUFFER_MS;

  if (tokenOk) {
    const token = decryptField({
      ciphered: team.dgiiTokenCiphered!,
      iv:       team.dgiiTokenIv!,
      authTag:  team.dgiiTokenAuthTag!,
    });
    client.setToken(token, team.dgiiTokenExpiresAt!);
    return { client, token, expiresAt: team.dgiiTokenExpiresAt! };
  }

  // ── 3. Token expirado → necesitamos re-autenticar ────────────────────────
  if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
    throw new Error(
      'Certificado digital no configurado. Sube tu P12 en Configuración → Certificado.',
    );
  }

  const p12Base64 = decryptField({
    ciphered: team.certP12Ciphered!,
    iv:       team.certP12Iv!,
    authTag:  team.certP12AuthTag!,
  });
  const pin = decryptField({
    ciphered: team.certPinCiphered!,
    iv:       team.certPinIv!,
    authTag:  team.certPinAuthTag!,
  });

  // ── 4. Autenticar con la DGII usando el SDK ───────────────────────────────
  const signer = new DgiiSigner({
    p12Buffer:   Buffer.from(p12Base64, 'base64'),
    password:    pin,
    environment,
  });

  // signer.authenticate() delega en ecf.authenticate() del SDK:
  //   GET /Semilla → firma XMLDSig RSA-SHA256 → POST /ValidarSemilla → { token, expira }
  const { token, expiresAt } = await signer.authenticate();

  // ── 5. Cifrar y persistir token en BD ────────────────────────────────────
  const enc = encryptField(token);
  await db
    .update(teams)
    .set({
      dgiiTokenCiphered:  enc.ciphered,
      dgiiTokenIv:        enc.iv,
      dgiiTokenAuthTag:   enc.authTag,
      dgiiTokenExpiresAt: expiresAt,
      updatedAt:          new Date(),
    })
    .where(eq(teams.id, teamId));

  client.setToken(token, expiresAt);
  return { client, token, expiresAt };
}
