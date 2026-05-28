/**
 * Reset DEV — borra container + volumen postgres y re-bootstrappea.
 *
 * Uso: pnpm dev:reset
 *
 * NO toca .env (preserva tus secrets). Si querés regenerar .env, borralo manual.
 */

import { execSync } from 'node:child_process';

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' });
}

console.log('\n🧹 EmiteDO — reset DEV (borra DB local)\n');
try {
  run('docker compose down -v');
} catch {
  // ok si no existe
}
run('pnpm dev:bootstrap');
