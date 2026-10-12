import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { getUser } from '@/lib/db/queries';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TTL_SEGUNDOS = 600;
const TIMEOUT_TURN_MS = 3000;

/**
 * STUN-only casi nunca alcanza en la práctica (VPN, NAT simétrico, firewall
 * corporativo) — sin un TURN de respaldo la conexión P2P se queda pegada en
 * "conectando" y el timeout de 20s de useLlamada la cuelga sola. Por eso TURN
 * no es opcional para producción, es la única forma de garantizar que la
 * llamada conecte sin importar la red del usuario.
 *
 * Dos formas de configurarlo, la que haya credenciales para esa gana:
 *  1) Cloudflare Realtime TURN (CF_TURN_KEY_ID + CF_TURN_API_TOKEN) — gratis,
 *     sin servidor propio que mantener, funciona igual en Vercel.
 *  2) coturn autohosteado (TURN_URL + TURN_SECRET) — credenciales efímeras
 *     HMAC-SHA1 calculadas acá mismo, el secreto nunca sale del server.
 * Sin ninguna de las dos, degrada a STUN-only (mismo criterio que
 * `s3Disponible()` degradando a base64 en `lib/storage/tickets.ts`).
 */
async function obtenerTurnCloudflare(): Promise<IceServer[]> {
  const keyId = process.env.CF_TURN_KEY_ID;
  const apiToken = process.env.CF_TURN_API_TOKEN;
  if (!keyId || !apiToken) return [];

  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL_SEGUNDOS }),
    // Sin timeout propio, un problema de red deja al que llama esperando los
    // ~10s del default de undici ANTES de siquiera empezar a negociar. Mejor
    // fallar rápido y arrancar con lo que haya (STUN), que es justamente para
    // lo que este fetch está envuelto en try/catch.
    signal: AbortSignal.timeout(TIMEOUT_TURN_MS),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN respondió ${res.status}`);

  // OJO: `iceServers` es un ARRAY — Cloudflare devuelve una entrada con sus
  // STUN y otra con los TURN + credenciales, no un solo objeto. Envolverlo
  // (`[data.iceServers]`) genera un array anidado que RTCPeerConnection
  // descarta como config inválida: la llamada se queda sin TURN y nunca
  // conecta, que es exactamente el síntoma que tenía este feature.
  const data = (await res.json()) as { iceServers: IceServer[] };
  return Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
}

function obtenerTurnAutohosteado(): IceServer[] {
  const turnUrl = process.env.TURN_URL;
  const turnSecret = process.env.TURN_SECRET;
  if (!turnUrl || !turnSecret) return [];

  const username = `${Math.floor(Date.now() / 1000) + TTL_SEGUNDOS}:zero-tickets`;
  const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
  return [{ urls: turnUrl, username, credential }];
}

async function construirIceServers(): Promise<IceServer[]> {
  const servers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  try {
    const cloudflare = await obtenerTurnCloudflare();
    if (cloudflare.length > 0) return [...servers, ...cloudflare];
  } catch (err) {
    // Si Cloudflare falla, seguimos probando el resto de las opciones en vez
    // de dejar al usuario sin ninguna alternativa de TURN.
    console.error('[zero-tickets/calls/ice-servers] Cloudflare TURN falló', err);
  }

  return [...servers, ...obtenerTurnAutohosteado()];
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  return NextResponse.json({ iceServers: await construirIceServers() });
}
