#!/usr/bin/env node
/**
 * Deja el relé de SIGERD corriendo como servicio de macOS.
 *
 *   node scripts/sigerd-relay-servicio.mjs instalar     # con RELAY_KEY en el entorno
 *   node scripts/sigerd-relay-servicio.mjs desinstalar
 *   node scripts/sigerd-relay-servicio.mjs estado
 *
 * Qué hace `instalar`:
 *  - Escribe un plist de `launchd` en ~/Library/LaunchAgents.
 *  - `KeepAlive`, para que si el proceso muere vuelva solo.
 *  - Lo arranca con `caffeinate -is`, porque una Mac dormida no reenvía nada y
 *    ese es el modo más tonto de que se caiga el relé.
 *  - Guarda la salida en ~/Library/Logs/sigerd-rele.log.
 *
 * La clave NO se escribe en el plist en claro por gusto: launchd necesita el
 * entorno del proceso y no hay llavero para agentes. El plist queda 0600, que
 * es la misma protección que tiene la sesión en ~/.sigerd.
 */

import { writeFileSync, unlinkSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const ETIQUETA = 'do.zero.sigerd-rele';
const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${ETIQUETA}.plist`);
const LOG = join(homedir(), 'Library', 'Logs', 'sigerd-rele.log');
const RELAY = resolve(process.cwd(), 'scripts/sigerd-relay.mjs');
const accion = process.argv[2];

function lanzar(args) {
  try { return execFileSync('launchctl', args, { encoding: 'utf8' }).trim(); }
  catch (e) { return (e.stdout ?? '') + (e.stderr ?? ''); }
}

if (accion === 'instalar') {
  const clave = process.env.RELAY_KEY;
  if (!clave) {
    console.error('Falta RELAY_KEY.\n\n  RELAY_KEY=$(openssl rand -hex 32) node scripts/sigerd-relay-servicio.mjs instalar\n');
    process.exit(1);
  }
  if (!existsSync(RELAY)) { console.error(`No encuentro ${RELAY}`); process.exit(1); }

  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  const nodo = process.execPath;
  const puerto = process.env.RELAY_PORT ?? '8787';

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${ETIQUETA}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-is</string>
    <string>${nodo}</string>
    <string>${RELAY}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RELAY_KEY</key><string>${clave}</string>
    <key>RELAY_PORT</key><string>${puerto}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
`;
  writeFileSync(PLIST, plist);
  chmodSync(PLIST, 0o600);          // lleva la clave: que no la lea nadie más
  lanzar(['unload', PLIST]);
  console.log(lanzar(['load', '-w', PLIST]) || '');
  console.log(`Servicio instalado.
  plist   ${PLIST}
  log     ${LOG}
  puerto  127.0.0.1:${puerto}

Comprobar:  curl -s http://127.0.0.1:${puerto}/salud`);
}

else if (accion === 'desinstalar') {
  lanzar(['unload', '-w', PLIST]);
  if (existsSync(PLIST)) unlinkSync(PLIST);
  console.log('Servicio quitado.');
}

else if (accion === 'estado') {
  const salida = lanzar(['list', ETIQUETA]);
  console.log(salida || 'No está cargado.');
}

else {
  console.log(`Uso:
  RELAY_KEY=xxx node scripts/sigerd-relay-servicio.mjs instalar
  node scripts/sigerd-relay-servicio.mjs desinstalar
  node scripts/sigerd-relay-servicio.mjs estado`);
  process.exit(1);
}
