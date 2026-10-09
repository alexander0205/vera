/**
 * Una base de enlaces mal puesta tiene que romper el build, no salir por correo.
 *
 * Ocurrió de verdad, y dos veces seguidas. Los correos llevaban enlaces a
 * `facturacion-v2.zero.com.do` —un resto de la migración, no un dominio de
 * producto—. Se cambió `NEXT_PUBLIC_APP_URL`, se desplegó, y el correo siguiente
 * seguía saliendo igual: `PLANTILLAS_BASE_URL` se lee ANTES y conservaba el
 * valor viejo. Además estaba marcada `sensitive` en Vercel, así que ni la API ni
 * `vercel env pull` devolvían su contenido — se leía como vacía.
 *
 * Nada avisó en ningún momento. La aplicación funcionaba, compilaba, desplegaba,
 * y mandaba correos con una dirección equivocada.
 *
 * Lo que se prueba aquí es el guardián: con tres variables capaces de decidir lo
 * mismo, que discrepen tiene que ser un error ruidoso.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validarBasesDeEnlaces, baseDeEnlaces, BASE_PUBLICA } from '@/lib/config/enlaces';

const CLAVES = ['PLANTILLAS_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'BASE_URL'] as const;
const BUENA  = 'https://app.zero.com.do';

describe('validarBasesDeEnlaces', () => {
  const previo: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of CLAVES) { previo[k] = process.env[k]; delete process.env[k]; }
    // El guardián solo lanza en un despliegue de producción de verdad.
    // NODE_ENV no vale: `next build` lo pone en 'production' también en local.
    vi.stubEnv('VERCEL_ENV', 'production');
  });
  afterEach(() => {
    for (const k of CLAVES) {
      if (previo[k] === undefined) delete process.env[k];
      else process.env[k] = previo[k];
    }
    vi.unstubAllEnvs();
  });

  it('sin ninguna puesta no protesta: hay base por defecto', () => {
    expect(() => validarBasesDeEnlaces()).not.toThrow();
  });

  it('con las tres iguales, pasa', () => {
    for (const k of CLAVES) process.env[k] = BUENA;
    expect(() => validarBasesDeEnlaces()).not.toThrow();
  });

  it('tolera la barra final: no es una discrepancia de verdad', () => {
    process.env.NEXT_PUBLIC_APP_URL = BUENA;
    process.env.BASE_URL = `${BUENA}/`;
    expect(() => validarBasesDeEnlaces()).not.toThrow();
  });

  it('EL CASO REAL: dos puestas que no coinciden rompe', () => {
    process.env.PLANTILLAS_BASE_URL = 'https://facturacion-v2.zero.com.do';
    process.env.NEXT_PUBLIC_APP_URL = BUENA;
    expect(() => validarBasesDeEnlaces()).toThrow(/no coinciden/);
  });

  it('el error nombra cuál manda, que es lo que nadie sabía', () => {
    process.env.PLANTILLAS_BASE_URL = 'https://facturacion-v2.zero.com.do';
    process.env.NEXT_PUBLIC_APP_URL = BUENA;
    expect(() => validarBasesDeEnlaces()).toThrow(/Manda PLANTILLAS_BASE_URL/);
  });

  it('una base relativa rompe: en un correo no lleva a ninguna parte', () => {
    process.env.NEXT_PUBLIC_APP_URL = '/dashboard';
    expect(() => validarBasesDeEnlaces()).toThrow(/no sirve como base/);
  });

  it('una dirección de casa rompe en producción', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    expect(() => validarBasesDeEnlaces()).toThrow(/no sirve como base/);
  });

  it('un build local con .env de desarrollo avisa, pero NO rompe', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    expect(() => validarBasesDeEnlaces()).not.toThrow();
  });
});

describe('el dominio de la migración no vuelve por la puerta de atrás', () => {
  it('BASE_PUBLICA no es facturacion-v2', () => {
    expect(BASE_PUBLICA).not.toContain('facturacion-v2');
  });

  it('sin variables, baseDeEnlaces cae en algo absoluto y de producto', () => {
    const previo = CLAVES.map(k => [k, process.env[k]] as const);
    for (const k of CLAVES) delete process.env[k];
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    try {
      const b = baseDeEnlaces();
      expect(b).toMatch(/^https:\/\//);
      expect(b).not.toContain('facturacion-v2');
    } finally {
      for (const [k, v] of previo) if (v !== undefined) process.env[k] = v;
    }
  });

  it('nadie escribe facturacion-v2 a mano en el código', () => {
    const raiz = join(__dirname, '..', '..');
    const fuentes = (dir: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) fuentes(p, acc);
        else if (/\.tsx?$/.test(e)) acc.push(p);
      }
      return acc;
    };
    const culpables = ['app', 'lib', 'components']
      .flatMap(d => fuentes(join(raiz, d)))
      .filter(p => {
        // Sin comentarios: enlaces.ts lo nombra para contar la historia.
        const src = readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        return src.includes('facturacion-v2');
      })
      .map(p => relative(raiz, p));
    expect(culpables).toEqual([]);
  });
});
