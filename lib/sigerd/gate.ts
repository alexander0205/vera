/**
 * Compuerta global de tráfico hacia SIGERD.
 *
 * Todas las peticiones al portal pasan por aquí (lo llama `SigerdClient.pedir`).
 * Existe por una razón concreta: en producción el tráfico de TODOS los colegios
 * sale por las mismas IPs (las de Vercel/nuestro proxy). Si 10 colegios pegan a
 * la vez, el WAF del MINERD (FortiADC/FortiWeb) ve una ráfaga desde una IP de
 * datacenter y eso parece un bot, no personas. La compuerta aplana esa ráfaga:
 *
 *   - CONCURRENCIA: nunca más de `SIGERD_MAX_CONCURRENCIA` peticiones a la vez.
 *   - RITMO: al menos `SIGERD_INTERVALO_MS` entre el arranque de una y la
 *     siguiente, para no disparar en tromba.
 *   - JITTER: un pequeño aleatorio sobre ese intervalo, para no parecer un reloj
 *     (los intervalos exactos son la firma clásica de un script).
 *   - REINTENTO: ante 503/502/504 (el portal se cae seguido) reintenta con
 *     backoff en vez de fallarle al usuario a la primera.
 *
 * LÍMITE HONESTO: el semáforo es en memoria del proceso. En Vercel serverless
 * cada instancia tiene el suyo, así que esto acota por instancia, no de forma
 * global entre instancias. Con una flota pequeña ayuda mucho; para un techo
 * global de verdad hay que coordinar por Postgres/Redis (ver `rate-limit.ts`,
 * que ya tiene la variante distribuida). Aun así, la mayor parte del beneficio
 * —no disparar en tromba desde un mismo runtime— se consigue aquí.
 */

const MAX_CONCURRENCIA = Number(process.env.SIGERD_MAX_CONCURRENCIA ?? 3);
const INTERVALO_MS = Number(process.env.SIGERD_INTERVALO_MS ?? 350);
const JITTER_MS = Number(process.env.SIGERD_JITTER_MS ?? 250);

/** Reintentos ante caídas del portal (503/502/504) antes de rendirse. */
const MAX_REINTENTOS = Number(process.env.SIGERD_MAX_REINTENTOS ?? 2);
const BACKOFF_BASE_MS = Number(process.env.SIGERD_BACKOFF_MS ?? 800);
const REINTENTABLES = new Set([502, 503, 504]);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Aleatorio SIN `Math.random` (prohibido en este entorno para no romper el
 * replay de workflows). No es criptográfico ni falta que haga: solo desincroniza
 * el ritmo. Mezcla reloj + un contador que avanza en cada llamada.
 */
let semilla = 0x9e3779b9;
function jitter(max: number): number {
  if (max <= 0) return 0;
  semilla = (semilla * 1664525 + 1013904223 + Date.now()) >>> 0;
  return semilla % (max + 1);
}

// ─── Semáforo de concurrencia ──────────────────────────────────────────────

let enVuelo = 0;
const cola: Array<() => void> = [];
/** Epoch ms en que se permitió arrancar la última petición (para el ritmo). */
let ultimoArranque = 0;

function adquirir(): Promise<void> {
  if (enVuelo < MAX_CONCURRENCIA) {
    enVuelo++;
    return Promise.resolve();
  }
  return new Promise((resolve) => cola.push(resolve));
}

function liberar(): void {
  enVuelo--;
  const siguiente = cola.shift();
  if (siguiente) {
    enVuelo++;
    siguiente();
  }
}

/**
 * Espera a que toque, respetando el intervalo mínimo entre arranques + jitter.
 *
 * Clave: reserva el turno escribiendo `ultimoArranque` ANTES de dormir. Si no,
 * dos tareas concurrentes leen el mismo `ultimoArranque`, calculan el mismo
 * objetivo y arrancan juntas. Como JS es de un solo hilo, el read-modify-write
 * sin `await` en medio es atómico y serializa los arranques de verdad.
 */
async function esperarRitmo(): Promise<void> {
  const ahora = Date.now();
  const objetivo = Math.max(ahora, ultimoArranque + INTERVALO_MS + jitter(JITTER_MS));
  ultimoArranque = objetivo; // reservar el turno antes de ceder el hilo
  const espera = objetivo - ahora;
  if (espera > 0) await dormir(espera);
}

/**
 * Ejecuta `fn` (una petición a SIGERD) a través de la compuerta.
 *
 * `esReintentable` decide, mirando el resultado, si conviene reintentar (p. ej.
 * un 503). Solo se usa para caídas del portal; los errores de lógica no se
 * reintentan.
 */
export async function porLaCompuerta<T>(
  fn: () => Promise<T>,
  esReintentable: (resultado: T) => boolean,
): Promise<T> {
  await adquirir();
  try {
    let intento = 0;
    for (;;) {
      await esperarRitmo();
      const resultado = await fn();

      if (intento >= MAX_REINTENTOS || !esReintentable(resultado)) return resultado;

      // Backoff creciente + jitter antes de reintentar una caída del portal.
      await dormir(BACKOFF_BASE_MS * 2 ** intento + jitter(JITTER_MS));
      intento++;
    }
  } finally {
    liberar();
  }
}

/** Estado actual, para observabilidad/tests. */
export function estadoCompuerta() {
  return { enVuelo, enCola: cola.length, maxConcurrencia: MAX_CONCURRENCIA, intervaloMs: INTERVALO_MS };
}

export const _config = { MAX_CONCURRENCIA, INTERVALO_MS, JITTER_MS, MAX_REINTENTOS, REINTENTABLES };
