import { getTeamForUser } from '@/lib/db/queries';

/**
 * Lista de campos sensibles que NUNCA deben salir por la API pública del team.
 * Incluye material criptográfico, IDs de Stripe y estado interno de habilitación DGII.
 * Cualquier campo nuevo sensible debe agregarse aquí.
 */
const SENSITIVE_TEAM_FIELDS = new Set([
  'certP12Ciphered',  'certP12Iv',   'certP12AuthTag',
  'certPinCiphered',  'certPinIv',   'certPinAuthTag',
  'dgiiTokenCiphered','dgiiTokenIv', 'dgiiTokenAuthTag',
  'stripeCustomerId', 'stripeSubscriptionId', 'stripeProductId',
  'habilitacionState',
]);

function stripSensitive<T extends Record<string, unknown> | null>(t: T): T {
  if (!t) return t;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (SENSITIVE_TEAM_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out as T;
}

export async function GET() {
  const team = await getTeamForUser();
  return Response.json(stripSensitive(team as Record<string, unknown> | null));
}
