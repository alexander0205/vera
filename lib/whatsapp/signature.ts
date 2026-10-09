import { createHmac, timingSafeEqual } from 'crypto';

/** Verifica `x-crm-signature: sha256=<hex>` de un webhook de crm-escolar. */
export function verificarFirma(rawBody: string, secret: string, headerFirma: string | null): boolean {
  if (!headerFirma) return false;
  const esperada = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  if (esperada.length !== headerFirma.length) return false;
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(headerFirma));
}
