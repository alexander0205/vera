/**
 * Solo hay dos pantallas de planes, y cada una tiene su sitio.
 *
 *   `/precios`              — la web pública, para quien todavía no es cliente.
 *   `/dashboard/suscripcion` — dentro del sistema, donde se elige de verdad.
 *
 * Había una tercera, `/pricing`, heredada del template. No solo repetía: mandaba
 * siempre al checkout, así que a una empresa que nunca tuvo plan le pedía
 * tarjeta en vez de abrirle la prueba — que es lo que hace la buena con
 * `empezarPruebaAction`. Ocho sitios del código apuntaban a ella, y uno ya
 * llevaba escrito el porqué de no hacerlo («A la pantalla de suscripción, no a
 * /pricing: es donde de verdad se elige y se abre la prueba»).
 *
 * Se comprueba sobre el código porque el riesgo es que vuelva a colarse: una
 * referencia suelta a `/pricing` manda al usuario a una redirección en vez de a
 * la pantalla, y tres pantallas para lo mismo es como empezó esto.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = join(__dirname, '..', '..');

/** Todos los .ts/.tsx del código de la app, sin tests ni dependencias. */
function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) fuentes(p, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(p);
  }
  return acc;
}

describe('la pantalla de planes duplicada no vuelve', () => {
  it('la página /pricing no existe', () => {
    expect(existsSync(join(raiz, 'app/(dashboard)/pricing'))).toBe(false);
  });

  it('ningún archivo enlaza a /pricing', () => {
    const culpables = ['app', 'components', 'lib']
      .flatMap(d => fuentes(join(raiz, d)))
      .filter(p => /['"`]\/pricing(['"`?])/.test(readFileSync(p, 'utf8')))
      .map(p => relative(raiz, p));

    expect(culpables).toEqual([]);
  });

  it('queda la redirección: hay enlaces vivos que no se pueden reescribir', () => {
    // El cancel_url de sesiones de Stripe ya abiertas y el urlUpgrade que la
    // API de emisión ya devolvió apuntan a /pricing y no se pueden cambiar.
    const cfg = readFileSync(join(raiz, 'next.config.ts'), 'utf8');
    expect(cfg).toContain("source: '/pricing'");
    expect(cfg).toContain("destination: '/dashboard/suscripcion'");
    expect(cfg).toContain('permanent: true');
  });

  it('las dos que quedan siguen ahí', () => {
    expect(existsSync(join(raiz, 'app/(marketing)/precios/page.tsx'))).toBe(true);
    expect(existsSync(join(raiz, 'app/(dashboard)/dashboard/suscripcion/page.tsx'))).toBe(true);
  });
});
