#!/usr/bin/env node
/**
 * Relé de SIGERD — se corre en la Mac que está en República Dominicana.
 *
 * SIGERD no contesta el TLS a las IPs de fuera del país: la conexión TCP abre
 * y ahí se queda, que es lo mismo que se vería si el portal estuviera caído.
 * Vercel sale por IPs de datacenter en Estados Unidos, así que desde ahí no hay
 * forma de entrar. Este proceso es el puente: Vercel le habla a esta máquina y
 * esta máquina le habla al portal, así que SIGERD ve una IP dominicana.
 *
 *   node scripts/sigerd-relay.mjs
 *
 * Y en Vercel:
 *   SIGERD_BASE_URL = https://<host-del-tunel>
 *   SIGERD_RELAY_KEY = <la misma clave que RELAY_KEY de aquí>
 *
 * Tres cosas que este archivo hace y que no son opcionales:
 *
 *  1. NO es un proxy abierto. Solo reenvía a `sigerd.minerd.gob.do` y solo si
 *     la petición trae la clave compartida. Un relé sin esas dos cosas es una
 *     puerta para que cualquiera navegue con tu IP.
 *  2. Reescribe `Location` a ruta relativa. El cliente descarta cualquier
 *     redirección cuyo origen no sea el de `SIGERD_BASE_URL` (ver
 *     `aRutaRelativa` en lib/sigerd/client.ts). Si el `Location` llegara como
 *     `https://sigerd.minerd.gob.do/...` el login se rompería en silencio.
 *  3. Quita `content-encoding` y `content-length` de la respuesta. `fetch` ya
 *     descomprimió el cuerpo; dejar esos headers hace que el otro lado intente
 *     descomprimir texto plano y falle con un error que no dice nada.
 */

import { createServer } from 'node:http';

const PUERTO   = Number(process.env.RELAY_PORT ?? 8787);
const DESTINO  = process.env.RELAY_TARGET ?? 'https://sigerd.minerd.gob.do';
const CLAVE    = process.env.RELAY_KEY ?? '';
const TIMEOUT  = Number(process.env.RELAY_TIMEOUT_MS ?? 60_000);

if (!CLAVE) {
  console.error('Falta RELAY_KEY. Sin clave compartida esto sería un proxy abierto.');
  process.exit(1);
}

const ORIGEN_DESTINO = new URL(DESTINO).origin;

/** Headers que no se reenvían al portal: los pone fetch, o son del túnel. */
const FUERA_PETICION = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding',
  'x-relay-key', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host',
  'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry', 'cdn-loop',
  'accept-encoding',
]);

/** Headers que no se devuelven a Vercel: ya no describen el cuerpo que mandamos. */
const FUERA_RESPUESTA = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection',
]);

const ARRANQUE = new Date().toISOString();

/** IP y país de salida, cacheados 10 minutos: es para diagnosticar, no para cada petición. */
let _donde = { en: 0, dato: { ip: null, pais: null, proveedor: null } };
async function dondeSalgo() {
  if (Date.now() - _donde.en < 600_000) return _donde.dato;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('https://ifconfig.co/json', { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    _donde = { en: Date.now(), dato: { ip: j.ip, pais: j.country_iso, proveedor: j.asn_org } };
  } catch {
    _donde = { en: Date.now(), dato: { ip: null, pais: null, proveedor: null } };
  }
  return _donde.dato;
}

function cuerpo(req) {
  return new Promise((res, rej) => {
    const trozos = [];
    req.on('data', (t) => trozos.push(t));
    req.on('end', () => res(Buffer.concat(trozos)));
    req.on('error', rej);
  });
}

/**
 * `https://sigerd.minerd.gob.do/Home/Index?x=1` → `/Home/Index?x=1`.
 * Lo que apunte a otro host se deja igual: el cliente lo descartará, que es
 * justo lo que debe pasar.
 */
function localizar(valor) {
  if (!valor) return null;
  if (valor.startsWith('/')) return valor;
  try {
    const u = new URL(valor);
    return u.origin === ORIGEN_DESTINO ? `${u.pathname}${u.search}` : valor;
  } catch {
    return valor;
  }
}

const servidor = createServer(async (req, res) => {
  const t0 = Date.now();

  if (req.url === '/salud') {
    // Un relé que no sale por una IP dominicana no sirve para nada, y el
    // síntoma sería idéntico a «el portal está caído». Mejor decirlo aquí.
    const donde = await dondeSalgo();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      ok: donde.pais === 'DO',
      destino: ORIGEN_DESTINO,
      ip: donde.ip,
      pais: donde.pais,
      proveedor: donde.proveedor,
      desde: ARRANQUE,
    }));
  }

  if (req.headers['x-relay-key'] !== CLAVE) {
    console.warn(`✗ sin clave  ${req.method} ${req.url}`);
    res.writeHead(403, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'clave de relé inválida' }));
  }

  const url = `${ORIGEN_DESTINO}${req.url}`;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!FUERA_PETICION.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v;
  }

  const cuerpoPeticion = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : await cuerpo(req);
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT);

  try {
    const r = await fetch(url, {
      method: req.method,
      headers,
      body: cuerpoPeticion?.length ? cuerpoPeticion : undefined,
      redirect: 'manual',          // el cliente decide qué hacer con los 302
      signal: ctrl.signal,
    });

    const salida = {};
    for (const [k, v] of r.headers) {
      if (FUERA_RESPUESTA.has(k.toLowerCase())) continue;
      if (k.toLowerCase() === 'set-cookie') continue;   // van aparte, pueden ser varias
      if (k.toLowerCase() === 'location') { salida.location = localizar(v); continue; }
      salida[k] = v;
    }

    const galletas = typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
    if (galletas.length) salida['set-cookie'] = galletas;

    const datos = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, salida);
    res.end(datos);
    console.log(`→ ${req.method} ${req.url} → ${r.status} (${Date.now() - t0}ms, ${datos.length}b)`);
  } catch (e) {
    const agotado = e?.name === 'AbortError';
    console.error(`✗ ${req.method} ${req.url} — ${agotado ? `timeout ${TIMEOUT}ms` : e?.message}`);
    res.writeHead(agotado ? 504 : 502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: agotado ? 'el portal no respondió a tiempo' : 'no se pudo contactar al portal' }));
  } finally {
    clearTimeout(reloj);
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Relé de SIGERD escuchando en http://127.0.0.1:${PUERTO}`);
  console.log(`Reenvía a ${ORIGEN_DESTINO} · timeout ${TIMEOUT}ms`);
  console.log('Salud: curl -s http://127.0.0.1:%d/salud', PUERTO);
  dondeSalgo().then((d) => {
    if (d.pais === 'DO') console.log(`Sale por ${d.ip} (${d.proveedor}) — República Dominicana ✓`);
    else if (d.pais) console.warn(`⚠ Sale por ${d.ip} — país ${d.pais}, NO República Dominicana. El portal no va a contestar.`);
    else console.warn('⚠ No se pudo averiguar la IP de salida.');
  });
});
