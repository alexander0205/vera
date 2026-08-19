// Relativo y no `@/…`: este archivo lo carga next.config.ts, que corre en Node
// antes de que exista el alias de TypeScript. Con `@/` el build muere con
// «Cannot find module».
import { validarBasesDeEnlaces } from './config/enlaces';

const REQUIRED_ENV_VARS = [
  'AUTH_SECRET',
  'POSTGRES_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_APP_URL',
  // Identidad del Proveedor de Servicios ante la DGII
  'PROVIDER_RNC',
  'PROVIDER_RAZON_SOCIAL',
  // ECF API — proveedor de NCF electrónicos
  'ECF_API_URL',
  'ECF_API_KEY',
] as const;

export function validateEnv() {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    console.error(`\n⛔ Variables de entorno faltantes:\n${missing.map(k => `  - ${k}`).join('\n')}\n`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  // Que estén no basta: una base de enlaces puede estar puesta y ser inservible,
  // o puede haber tres puestas diciendo cosas distintas. Ver enlaces.ts.
  validarBasesDeEnlaces();
}

// ─── Constantes de Proveedor — leer UNA sola vez, nunca hardcodear ───────────

export const provider = {
  rnc:            process.env.PROVIDER_RNC            ?? '1333307391',
  razonSocial:    process.env.PROVIDER_RAZON_SOCIAL   ?? 'Yisrael Technology SRL',
  nombreComercial:process.env.PROVIDER_NOMBRE_COMERCIAL ?? 'EmiteDO',
} as const;

export const software = {
  nombre:  process.env.SOFTWARE_NAME  ?? 'EmiteDO',
  tipo:    'EXTERNO' as const,
  // La versión viene de package.json — nunca hardcodear
  version: process.env.npm_package_version ?? '1',
} as const;
