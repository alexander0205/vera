import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El panel `/admin` y su API se escanean ENTEROS: toda página, ruta y acción
 * futura que se olvide de la compuerta pone esta prueba en rojo.
 *
 * Por qué hace falta (fuga real, agosto 2026): en el App Router el layout y la
 * página se renderizan a la vez, así que un `redirect()` en el layout NO impide
 * que la página consulte la base y mande los datos en el payload. La compuerta
 * que cuenta va DENTRO de cada página, antes de la primera consulta.
 */

const RAIZ = process.cwd();
const leer = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function archivos(dir: string, nombre: (n: string) => boolean, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) archivos(p, nombre, acc);
    else if (nombre(e.name)) acc.push(p);
  }
  return acc;
}
const rel = (p: string) => p.slice(RAIZ.length + 1);

/** Parte un archivo en el cuerpo de cada `export async function X` (hasta el siguiente). */
function porFuncion(src: string, patron: RegExp): { nombre: string; cuerpo: string }[] {
  const marcas = [...src.matchAll(patron)];
  return marcas.map((m, i) => ({ nombre: m[1], cuerpo: src.slice(m.index!, marcas[i + 1]?.index ?? src.length) }));
}

const GUARDAS_API = [/requirePlatformAdmin\(/, /requireAdminConLlave\(/, /requireAdmin\(/, /platformRole\s*!==\s*'admin'/];
const tieneGuarda = (cuerpo: string) => GUARDAS_API.some((g) => g.test(cuerpo));

describe('páginas de /admin', () => {
  const paginas = archivos(join(RAIZ, 'app', 'admin'), (n) => n === 'page.tsx');

  it('hay páginas que escanear', () => { expect(paginas.length).toBeGreaterThanOrEqual(12); });

  it.each(paginas.map((p) => [rel(p), p]))('%s: exige ser admin ANTES de cualquier consulta', (_n, p) => {
    const s = leer(p);
    const guarda = s.indexOf('await exigirAdmin(');
    expect(guarda, 'falta `await exigirAdmin()`').toBeGreaterThan(-1);
    // La primera consulta (`db.`, `await consultar…`, `resumenDe…`) tiene que ir DESPUÉS de la compuerta.
    const consultas = [...s.matchAll(/\bdb\s*\.|await\s+(consultar|colegiosCon|resumenDe|listar|esDueno|opcionesDe)\w*\(|Promise\.all\(\[/g)]
      .map((m) => m.index!).filter((i) => i < guarda);
    // Solo vale una mención dentro de una función auxiliar declarada antes de la página.
    const antesDeLaPagina = s.indexOf('export default');
    for (const i of consultas) expect(i, `consulta antes de la compuerta en ${rel(p)}`).toBeLessThan(antesDeLaPagina);
    // Y la compuerta está dentro del cuerpo de la página, no suelta.
    expect(guarda).toBeGreaterThan(antesDeLaPagina);
  });

  it('el layout también comprueba (segunda capa)', () => {
    expect(leer(join(RAIZ, 'app', 'admin', 'layout.tsx'))).toMatch(/platformRole\s*!==\s*'admin'/);
  });
});

describe('rutas de /api/admin', () => {
  const rutas = archivos(join(RAIZ, 'app', 'api', 'admin'), (n) => n === 'route.ts');

  it('hay rutas que escanear', () => { expect(rutas.length).toBeGreaterThanOrEqual(20); });

  it.each(rutas.map((p) => [rel(p), p]))('%s: cada método comprueba al administrador', (_n, p) => {
    const s = leer(p);
    const metodos = porFuncion(s, /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g);
    expect(metodos.length, 'sin métodos exportados').toBeGreaterThan(0);

    // La única ruta que no es de sesión es el ejecutor de migraciones: va con el secreto de las tareas programadas.
    if (rel(p).endsWith(join('admin', 'migrate', 'route.ts'))) {
      expect(s).toContain('llamadaDeCronValida(');
      return;
    }
    for (const m of metodos) expect(tieneGuarda(m.cuerpo), `${m.nombre} sin compuerta`).toBe(true);
  });

  it('las rutas que CAMBIAN algo también exigen que la petición nazca en este sitio', () => {
    const conOrigen = [
      ['app', 'api', 'admin', 'equipo', 'route.ts'],
      ['app', 'api', 'admin', 'equipo', '[id]', 'route.ts'],
      ['app', 'api', 'admin', 'equipo', '[id]', 'perfil', 'route.ts'],
      ['app', 'api', 'admin', 'notificaciones', 'leidas', 'route.ts'],
      ['app', 'api', 'admin', 'notificaciones', 'push', 'route.ts'],
      ['app', 'api', 'admin', 'academia', 'route.ts'],
      ['app', 'api', 'admin', 'academia', '[id]', 'route.ts'],
    ];
    for (const r of conOrigen) {
      const s = leer(join(RAIZ, ...r));
      const mutan = porFuncion(s, /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g);
      expect(mutan.length, r.join('/')).toBeGreaterThan(0);
      for (const m of mutan) expect(m.cuerpo, `${r.join('/')} ${m.nombre}`).toContain('origenValido(');
    }
  });
});

describe('server actions de /admin', () => {
  const comprueba = /platformRole\s*!==\s*'admin'|exigirAdmin\(|requireAdmin\(/;

  it('los archivos de acciones comprueban en cada acción exportada', () => {
    const acciones = archivos(join(RAIZ, 'app', 'admin'), (n) => n === 'actions.ts' || n.endsWith('-actions.ts'));
    expect(acciones.length).toBeGreaterThanOrEqual(3);
    for (const p of acciones) {
      const s = leer(p);
      expect(s, rel(p)).toMatch(/^'use server';/);
      // Si la compuerta es una función local, esa función tiene que comprobar el rol de verdad.
      if (/requireAdmin\(/.test(s)) expect(s, rel(p)).toMatch(/async function requireAdmin\(\)[\s\S]{0,200}platformRole\s*!==\s*'admin'/);
      for (const f of porFuncion(s, /export\s+async\s+function\s+(\w+)/g)) {
        expect(comprueba.test(f.cuerpo), `${rel(p)}: ${f.nombre}`).toBe(true);
      }
    }
  });

  it('las acciones en línea de las páginas comprueban también', () => {
    for (const p of archivos(join(RAIZ, 'app', 'admin'), (n) => n.endsWith('.tsx'))) {
      const s = leer(p);
      for (const f of porFuncion(s, /async\s+function\s+(\w+)\([^)]*\)[^{]*\{\s*'use server';/g)) {
        // El cuerpo llega hasta la siguiente acción o el fin del archivo: basta con que la compuerta esté al inicio.
        expect(comprueba.test(f.cuerpo.slice(0, 600)), `${rel(p)}: ${f.nombre}`).toBe(true);
      }
    }
  });
});
