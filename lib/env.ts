const REQUIRED_ENV_VARS = [
  'AUTH_SECRET',
  'POSTGRES_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_APP_URL',
] as const;

export function validateEnv() {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    console.error(`\n⛔ Variables de entorno faltantes:\n${missing.map(k => `  - ${k}`).join('\n')}\n`);
    // Don't crash in development, just warn
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}
