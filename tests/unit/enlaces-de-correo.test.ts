/**
 * Los enlaces que salen del sistema pasan todos por `baseDeEnlaces()`.
 *
 * Reportado desde producción: el correo «Verifica tu email» llevaba una URL de
 * `facturacion-v2.zero.com.do` — que no es un dominio de producto sino un resto
 * de la migración a v2. Funcionaba, porque los siete dominios son alias del
 * mismo despliegue, pero salía impreso en cada correo y dentro del enlace de
 * pago que le llega al padre por WhatsApp.
 *
 * Debajo del dominio había algo peor: siete sitios leían
 * `process.env.NEXT_PUBLIC_APP_URL` en crudo, saltándose el módulo que existe
 * justo para esto. Y cada uno fallaba a su manera si la variable no estaba:
 *
 *     `${undefined}/reset-password?token=abc`  → "undefined/reset-password?…"
 *     `${'' }/dashboard/suscripcion`           → "/dashboard/suscripcion"
 *
 * El primero es un enlace roto que se ve; el segundo es relativo, y pegado en
 * un correo no lleva a ninguna parte. Son exactamente las dos reglas que
 * `lib/config/enlaces.ts` dice imponer, incumplidas por quien más las necesita.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BASE_PUBLICA } from '@/lib/config/enlaces';

const raiz = join(__dirname, '..', '..');

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fuentes(p, acc);
    else if (/\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

/** Los que construyen enlaces para alguien de fuera. Aquí no se lee la env. */
const ZONAS = ['lib/email', 'app/api/equipo', 'app/api/cron', 'app/api/caja'];

describe('la base de los enlaces', () => {
  it('no es el dominio de la migración', () => {
    expect(BASE_PUBLICA).not.toContain('facturacion-v2');
  });

  it('es absoluta, con esquema, y sin barra al final', () => {
    expect(BASE_PUBLICA).toMatch(/^https:\/\//);
    expect(BASE_PUBLICA.endsWith('/')).toBe(false);
  });

  it('apunta al host de la cuenta, que es donde resuelven las rutas de cuenta', () => {
    expect(BASE_PUBLICA).toBe('https://app.zero.com.do');
  });
});

describe('quien manda enlaces hacia fuera usa el helper, no la variable', () => {
  it.each(ZONAS)('%s no lee NEXT_PUBLIC_APP_URL en crudo', (zona) => {
    const culpables = fuentes(join(raiz, zona))
      .filter(p => {
        // Sin comentarios: alguno la nombra para explicar por qué NO se usa.
        const src = readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        return src.includes('process.env.NEXT_PUBLIC_APP_URL');
      })
      .map(p => relative(raiz, p));

    expect(culpables).toEqual([]);
  });

  it('ningún enlace de correo puede empezar por "undefined" ni ser relativo', () => {
    // Lo que producían los dos patrones que había, con la variable ausente.
    const roto     = `${undefined}/reset-password?token=abc`;
    const relativo = `${'' }/dashboard/suscripcion`;
    expect(roto.startsWith('undefined')).toBe(true);
    expect(relativo.startsWith('http')).toBe(false);

    // Y lo que produce el helper: absoluto siempre.
    expect(`${BASE_PUBLICA}/reset-password?token=abc`).toMatch(/^https:\/\//);
  });
});
