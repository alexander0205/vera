/**
 * La llave pública VAPID viaja en base64 «url-safe» y `pushManager.subscribe`
 * la pide como bytes. Pura y sin DOM, para poder probarla.
 */
export function base64UrlABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}
