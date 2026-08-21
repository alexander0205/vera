import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { getUser } from '@/lib/db/queries';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TTL_SEGUNDOS = 600;

/**
 * STUN público siempre disponible, sin credenciales — alcanza para la
 * mayoría de las redes. TURN solo se agrega si hay credenciales configuradas
 * (TURN_URL + TURN_SECRET); si no las hay, degrada a STUN-only, mismo
 * criterio que `s3Disponible()` degradando a base64 en
 * `lib/storage/tickets.ts`.
 */
function construirIceServers(): IceServer[] {
  const servers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  const turnUrl = process.env.TURN_URL;
  const turnSecret = process.env.TURN_SECRET;
  if (!turnUrl || !turnSecret) return servers;

  // Credenciales efímeras (REST API de coturn/Cloudflare): username con
  // vencimiento embebido, credential = HMAC-SHA1 del username con el
  // secreto del servidor. El secreto nunca sale de acá.
  const username = `${Math.floor(Date.now() / 1000) + TTL_SEGUNDOS}:zero-tickets`;
  const credential = createHmac('sha1', turnSecret).update(username).digest('base64');

  servers.push({ urls: turnUrl, username, credential });
  return servers;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  return NextResponse.json({ iceServers: construirIceServers() });
}
