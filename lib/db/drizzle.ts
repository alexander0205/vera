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
    connect_timeout: 10,
    ssl: isLocalDb ? false : 'require',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
