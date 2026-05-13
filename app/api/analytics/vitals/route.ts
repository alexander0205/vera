export const dynamic = 'force-dynamic';

/**
 * Receives Core Web Vitals metrics from the client.
 * For now this just logs to stdout; later it can forward to a
 * proper analytics sink (Vercel Analytics, Sentry, etc.).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(null, { status: 400 });
  }
  // eslint-disable-next-line no-console
  console.log('[web-vitals]', body);
  return new Response(null, { status: 204 });
}
