#!/usr/bin/env node
/**
 * Estado de los relés de SIGERD.
 *
 * Pregunta a cada relé de `SIGERD_RELAYS` por su `/salud` y dice cuál sirve.
 * Un relé sirve solo si sale por una IP de República Dominicana: si sale por
 * otro país el portal no le contesta, y el síntoma es idéntico a «SIGERD está
 * caído». Por eso se comprueba el país, no solo que el proceso conteste.
 *
 *   SIGERD_RELAYS=https://a,https://b SIGERD_RELAY_KEY=xxx node scripts/sigerd-relevos.mjs
 */

const LISTA = (process.env.SIGERD_RELAYS ?? process.env.SIGERD_BASE_URL ?? '')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const CLAVE = process.env.SIGERD_RELAY_KEY ?? '';

if (!LISTA.length) {
  console.error('No hay relés configurados. Define SIGERD_RELAYS.');
  process.exit(1);
}

async function revisar(base) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(`${base}/salud`, {
      headers: CLAVE ? { 'X-Relay-Key': CLAVE } : {},
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const ms = Date.now() - t0;
    if (!r.ok) return { base, ok: false, ms, detalle: `HTTP ${r.status}` };
    const j = await r.json();
    return {
      base, ok: j.pais === 'DO', ms,
      detalle: j.pais === 'DO'
        ? `${j.ip} · ${j.proveedor ?? 'proveedor desconocido'}`
        : `sale por ${j.pais ?? '¿?'} — el portal no le va a contestar`,
      desde: j.desde,
    };
  } catch (e) {
    return { base, ok: false, ms: Date.now() - t0, detalle: e.name === 'AbortError' ? 'no respondió en 10s' : e.message };
  }
}

const filas = await Promise.all(LISTA.map(revisar));
const ancho = Math.max(...filas.map((f) => f.base.length));

console.log('');
for (const f of filas) {
  const marca = f.ok ? '✓' : '✗';
  console.log(`  ${marca}  ${f.base.padEnd(ancho)}  ${String(f.ms + 'ms').padStart(7)}   ${f.detalle}`);
}

const vivos = filas.filter((f) => f.ok).length;
console.log('');
if (vivos === 0)      console.log(`  Ningún relé sirve. SIGERD va a fallar en producción.`);
else if (vivos === 1) console.log(`  1 de ${filas.length} sirve. Sin respaldo: si esa máquina se cae, se cae SIGERD.`);
else                  console.log(`  ${vivos} de ${filas.length} sirven.`);
console.log('');
process.exit(vivos ? 0 : 1);
