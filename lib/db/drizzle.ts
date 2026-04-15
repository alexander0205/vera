import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

// Singleton pattern — prevents "too many clients" in Next.js dev mode (HMR creates new modules)
const globalForDb = globalThis as unknown as { _pgClient?: ReturnType<typeof postgres> };

export const client =
  globalForDb._pgClient ??
  postgres(process.env.POSTGRES_URL, { max: 10 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
