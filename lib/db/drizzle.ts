import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

const connectionString = process.env.POSTGRES_URL;
// Postgres local (Docker) no expone SSL; los remotos (Neon) lo exigen.
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

// Singleton pattern — prevents "too many clients" in Next.js dev mode (HMR creates new modules)
const globalForDb = globalThis as unknown as { _pgClient?: ReturnType<typeof postgres> };

export const client =
  globalForDb._pgClient ??
  postgres(connectionString, {
    max: 10,
    // Neon está en us-east-1 y cada reconexión cuesta ~1.4s (TLS + wake). Con
    // idle_timeout bajo, cualquier hueco entre acciones (p. ej. POS entre
    // clientes) cerraba la conexión y el próximo cobro pagaba ese arranque en
    // frío. Mantener las conexiones vivas 5 min elimina esos picos; max_lifetime
    // las recicla para que ninguna quede huérfana indefinidamente.
    idle_timeout: 300,
    max_lifetime: 60 * 30,
    // Neon en autosuspend puede tardar bastante más que unos pocos segundos
    // en despertar cuando el wake coincide con una ráfaga de conexiones
    // simultáneas (ver warm-up abajo) — 10s cortaba esa espera a mitad de
    // camino y el request fallaba en vez de simplemente tardar un poco más.
    connect_timeout: 20,
    ssl: isLocalDb ? false : 'require',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });

// Precalienta la conexión ni bien arranca el proceso, en vez de esperar a
// que la dispare el primer request real. Sin esto, el primer load de página
// dispara ~8-10 fetches en paralelo (ticket, presencia, empresa, usuario,
// etc.) — si Neon estaba en autosuspend, esos 10 disparan 10 intentos de
// reconexión/wake simultáneos contra el mismo compute recién arrancando, y
// algunos quedan esperando minutos en vez de los ~1-2s normales de un cold
// start. Con esta única conexión ya en camino desde que carga el módulo, el
// compute suele estar despierto para cuando esa ráfaga llega.
if (!globalForDb._pgClient) {
  client`select 1`.catch(() => {});
}
