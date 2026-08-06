/**
 * Apertura de sesión para los scripts de línea de comandos.
 *
 * Reutiliza la sesión guardada en `~/.sigerd/` y solo pide credenciales cuando
 * de verdad hace falta. La contraseña nunca se guarda: si la sesión murió, se
 * vuelve a teclear.
 */

import { createInterface } from 'readline';
import { SigerdClient } from './client';
import { guardarSesionArchivo, leerSesionArchivo, minutosRestantes } from './sesion-archivo';
import type { SigerdPerfil } from './types';

function preguntar(etiqueta: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(etiqueta, (r) => {
      rl.close();
      resolve(r.trim());
    });
  });
}

/** Contraseña con eco de `*`: un prompt mudo se confunde con un cuelgue. */
export function preguntarClave(etiqueta: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(etiqueta);

    if (!stdin.isTTY) {
      const rl = createInterface({ input: stdin, output: process.stdout, terminal: false });
      rl.once('line', (l) => {
        rl.close();
        process.stdout.write('\n');
        resolve(l.trim());
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let buffer = '';
    const onData = (trozo: string) => {
      for (const c of trozo) {
        if (c === '\n' || c === '\r' || c === '\x04') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          return resolve(buffer.trim());
        }
        if (c === '\x03') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n✗ Cancelado.\n');
          process.exit(130);
        }
        if (c === '\x7f' || c === '\b') {
          if (buffer.length) {
            buffer = buffer.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        buffer += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

export interface OpcionesSesion {
  usuario?: string;
  /** Índice del perfil cuando el usuario tiene varios. */
  perfil?: number;
  /** Ignora la sesión guardada y fuerza login nuevo. */
  forzar?: boolean;
  onEvento?: (mensaje: string) => void;
}

export interface SesionAbierta {
  cli: SigerdClient;
  /** `true` si se reutilizó la del disco (no se pidió contraseña). */
  reutilizada: boolean;
}

/**
 * Devuelve un cliente con sesión viva.
 *
 * Primero intenta la sesión guardada y la valida contra el portal — una cookie
 * presente no significa que siga siendo válida. Si no sirve, pide credenciales.
 */
export async function abrirSesion(opts: OpcionesSesion = {}): Promise<SesionAbierta> {
  if (!opts.forzar) {
    const guardada = leerSesionArchivo();
    if (guardada) {
      const cli = SigerdClient.desdeSesion(guardada, { onEvento: opts.onEvento });
      process.stdout.write(`→ Reutilizando sesión guardada (${minutosRestantes()} min restantes)… `);

      if (await cli.estaAutenticado()) {
        console.log('viva ✓');
        guardarSesionArchivo(cli.exportarSesion()); // el portal rota el token
        return { cli, reutilizada: true };
      }
      console.log('caducada, hay que entrar de nuevo.');
    }
  }

  const usuario = opts.usuario ?? process.env.SIGERD_USUARIO ?? (await preguntar('Usuario (cédula): '));
  const password = process.env.SIGERD_PASSWORD ?? (await preguntarClave('Contraseña (se marca con *): '));

  if (!usuario || !password) throw new Error('Faltan credenciales.');

  const cli = new SigerdClient({ onEvento: opts.onEvento });
  const login = await cli.iniciarSesion(usuario, password);

  if (login.estado === 'seleccion-perfil') {
    login.perfiles.forEach((p: SigerdPerfil, i: number) =>
      console.log(`   [${i}] ${p.nombreRol}${p.nombreCentro ? ` — ${p.nombreCentro}` : ''} (id=${p.id})`),
    );

    const elegido = login.perfiles[opts.perfil ?? 0];
    if (!elegido) throw new Error(`Índice de perfil inválido: ${opts.perfil}`);
    await cli.seleccionarPerfil(elegido);
  }

  guardarSesionArchivo(cli.exportarSesion());
  console.log('✓ Sesión abierta y guardada en ~/.sigerd/sesion.enc');

  return { cli, reutilizada: false };
}
