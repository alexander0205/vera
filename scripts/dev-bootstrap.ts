/**
 * Bootstrap de entorno DEV — idempotente, sin prompts.
 *
 * Uso:
 *   pnpm dev:bootstrap
 *
 * Hace:
 *   1. Levanta postgres en Docker (docker compose up -d)
 *   2. Espera healthcheck
 *   3. Crea .env con defaults DEV si no existe (secrets random)
 *   4. Aplica migraciones (drizzle-kit migrate)
 *   5. Corre seed (admin@emitedo.test / Admin1234!)
 *
 * Re-ejecutable: si ya existe .env, no lo toca. Si seed ya corrió, falla
 * por unique constraint — borrá el volumen con `pnpm dev:reset` para reseed.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');

function log(step: string, msg: string) {
  console.log(`\x1b[36m[${step}]\x1b[0m ${msg}`);
}

function ok(msg: string) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function die(msg: string): never {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

function run(cmd: string, opts: { silent?: boolean } = {}) {
  try {
    return execSync(cmd, {
      stdio: opts.silent ? 'pipe' : 'inherit',
      cwd: ROOT,
    });
  } catch (err) {
    die(`Comando falló: ${cmd}`);
  }
}

function checkDocker() {
  log('1/5', 'Verificando Docker…');
  const res = spawnSync('docker', ['--version'], { stdio: 'pipe' });
  if (res.status !== 0) die('Docker no instalado. https://docs.docker.com/get-docker/');
  const info = spawnSync('docker', ['info'], { stdio: 'pipe' });
  if (info.status !== 0) die('Docker daemon no corriendo. Abrí Docker Desktop.');
  ok('Docker OK');
}

function startPostgres() {
  log('2/5', 'Levantando postgres (docker compose up -d)…');
  run('docker compose up -d postgres');
  ok('Container arriba');
}

function waitForPostgres() {
  log('3/5', 'Esperando healthcheck postgres…');
  const maxAttempts = 30;
  for (let i = 1; i <= maxAttempts; i++) {
    const res = spawnSync(
      'docker',
      ['inspect', '-f', '{{.State.Health.Status}}', 'emitedo_postgres'],
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    const status = res.stdout?.trim();
    if (status === 'healthy') {
      ok(`Postgres healthy (intento ${i})`);
      return;
    }
    process.stdout.write('.');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  die('Postgres no llegó a healthy en 30s');
}

function writeEnvIfMissing() {
  log('4/5', 'Configurando .env…');
  if (existsSync(ENV_PATH)) {
    ok('.env ya existe, no se sobrescribe');
    return;
  }
  const authSecret = randomBytes(32).toString('hex');
  const certKey = randomBytes(32).toString('hex');
  const env = [
    '# Generado por scripts/dev-bootstrap.ts',
    '# DEV LOCAL — no usar en QA/PROD',
    '',
    '# Postgres (docker-compose.yml)',
    'POSTGRES_URL=postgres://postgres:postgres@localhost:54322/emitedo',
    '',
    '# Auth',
    `AUTH_SECRET=${authSecret}`,
    '',
    '# Stripe (stubs — reemplazar para probar pagos)',
    'STRIPE_SECRET_KEY=sk_test_dummy',
    'STRIPE_WEBHOOK_SECRET=whsec_dummy',
    'STRIPE_PRICE_STARTER=price_dummy_starter',
    'STRIPE_PRICE_INVOICE=price_dummy_invoice',
    'STRIPE_PRICE_BUSINESS=price_dummy_business',
    'STRIPE_PRICE_PRO=price_dummy_pro',
    '',
    '# App',
    'BASE_URL=http://localhost:3000',
    'NEXT_PUBLIC_APP_URL=http://localhost:3000',
    '',
    '# DGII',
    'DGII_ENVIRONMENT=TesteCF',
    '',
    '# Identidad proveedor FE (Yisrael Technology SRL)',
    'PROVIDER_RNC=1333307391',
    'PROVIDER_RAZON_SOCIAL=Yisrael Technology SRL',
    'PROVIDER_NOMBRE_COMERCIAL=EmiteDO',
    'SOFTWARE_NAME=EmiteDO',
    '',
    '# Cifrado certificados AES-256-GCM (NUNCA cambiar en prod)',
    `CERT_MASTER_KEY=${certKey}`,
    '',
    '# ECF API (proveedor NCF externo)',
    'ECF_API_URL=http://localhost:3010',
    'ECF_API_KEY=ecfk_dev_dummy',
    'ECF_HABILITACION_AMBIENTE=TesteCF',
    '',
  ].join('\n');
  writeFileSync(ENV_PATH, env);
  ok('.env creado con secrets random + defaults DEV');
}

function migrateAndSeed() {
  log('5/5', 'Migrando + sembrando…');
  run('pnpm db:migrate');
  ok('Migraciones aplicadas');
  run('pnpm db:seed');
  ok('Seed completo');
}

function printCreds() {
  console.log('\n\x1b[32m─────────────────────────────────────────\x1b[0m');
  console.log('\x1b[32m✅ Bootstrap completo\x1b[0m');
  console.log('\x1b[32m─────────────────────────────────────────\x1b[0m');
  console.log('  Email:    admin@emitedo.test');
  console.log('  Password: Admin1234!');
  console.log('  URL:      http://localhost:3000/sign-in');
  console.log('  DB:       postgres://postgres:postgres@localhost:54322/emitedo');
  console.log('\n  Siguiente: pnpm dev\n');
}

async function main() {
  console.log('\n🚀 EmiteDO — bootstrap DEV\n');
  checkDocker();
  startPostgres();
  waitForPostgres();
  writeEnvIfMissing();
  migrateAndSeed();
  printCreds();
}

main();
