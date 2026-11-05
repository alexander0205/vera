import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contrasenaAleatoria, credencialDeSiembra } from '@/lib/db/credenciales-seed';

/**
 * El repo es PÚBLICO: nada que sirva para entrar a algo se escribe en él.
 *
 * Esta prueba recorre el código, los scripts, las pruebas E2E y los informes de
 * QA buscando hashes bcrypt, claves de Stripe
 * en modo real, llaves privadas y tokens de GitHub/AWS. Los valores falsos de
 * `tests/unit` (fixtures) y los marcadores `placeholder` quedan fuera.
 */

const RAIZ = process.cwd();
const IGNORAR = new Set(['node_modules', '.next', '.git', 'migrations', 'unit', 'pnpm-lock.yaml']);
const EXT = /\.(ts|tsx|js|mjs|sh|md|json|yml|yaml|sql)$/;
// El único hash bcrypt legítimo: el señuelo que iguala el tiempo de respuesta del login.
const PERMITIDOS = new Set(['lib/auth/api-key-guard.ts']);

function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (EXT.test(e.name) && statSync(p).size < 2_000_000) acc.push(p);
  }
  return acc;
}

const PATRONES: [string, RegExp][] = [
  ['hash bcrypt completo', /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{40,}/],
  ['clave secreta de Stripe real', /sk_live_[A-Za-z0-9]{10,}|rk_live_[A-Za-z0-9]{10,}/],
  ['clave de la API de e-CF real', /ecfk_live_[A-Za-z0-9_]{12,}/],
  ['llave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/]{20,}/],
  ['token de GitHub', /ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ['clave de acceso de AWS', /AKIA[0-9A-Z]{16}/],
  ['cadena de conexión con clave real', /(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/(?!postgres:|user:|USER:|emitedo:)[A-Za-z0-9_.-]+:(?!<|\$|\{|PASSWORD|password|HOST|\*+)[^@:/\s<>"'`]{6,}@/],
];

describe('sin secretos escritos en el código', () => {
  const todos = archivos(RAIZ)
    .map((p) => p.slice(RAIZ.length + 1))
    .filter((p) => !PERMITIDOS.has(p));

  it('hay archivos que escanear', () => { expect(todos.length).toBeGreaterThan(200); });

  it.each(PATRONES)('ninguno contiene: %s', (_nombre, patron) => {
    const culpables = todos.filter((p) => patron.test(readFileSync(join(RAIZ, p), 'utf8')));
    expect(culpables, `aparece en: ${culpables.join(', ')}`).toEqual([]);
  });
});

describe('credenciales de siembra', () => {
  it('sin variable (o muy corta) se genera una aleatoria y distinta cada vez', () => {
    const a = credencialDeSiembra('NO_EXISTE', {});
    const b = credencialDeSiembra('NO_EXISTE', { NO_EXISTE: 'corta' });
    expect(a.generada).toBe(true);
    expect(b.generada).toBe(true);
    expect(a.valor.length).toBeGreaterThanOrEqual(20);
    expect(a.valor).not.toBe(b.valor);
    expect(contrasenaAleatoria()).not.toBe(contrasenaAleatoria());
  });

  it('con la variable de entorno usa esa y no la marca como generada', () => {
    const c = credencialDeSiembra('SEED_PASSWORD', { SEED_PASSWORD: '  una-clave-larga-123  ' });
    expect(c).toEqual({ valor: 'una-clave-larga-123', generada: false });
  });
});
