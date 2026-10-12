/**
 * La pantalla de acceso nunca puede salir en blanco.
 *
 * Pasó en producción: cerrar sesión dejaba /sign-in completamente vacío, y solo
 * se arreglaba recargando a mano. Dos cosas tenían que coincidir, y coincidían:
 *
 *   1. `Login` lee `useSearchParams`, así que va dentro de un <Suspense>. Con
 *      PPR el shell estático de la ruta es lo que pinte el `fallback` — y no
 *      había: el HTML del servidor traía 51 caracteres, solo el <title>. En el
 *      propio HTML se ve por qué el hueco no se rellena en servidor:
 *      `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">`. Ese trozo lo
 *      pinta el cliente o no lo pinta nadie.
 *
 *   2. Al cerrar sesión se navegaba con `router.push('/sign-in')`, que es
 *      navegación suave: se servía ese shell vacío desde la caché del router y
 *      ahí se quedaba.
 *
 * Las dos son estructurales —viven en cómo está escrita la pantalla, no en una
 * función que se pueda llamar—, así que se comprueban sobre el código. Un
 * render de prueba no serviría: el bug era justo que en servidor no se renderiza.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

const PANTALLAS = ['app/(login)/sign-in/page.tsx', 'app/(login)/sign-up/page.tsx'];

describe('el shell de /sign-in y /sign-up nunca va vacío', () => {
  it.each(PANTALLAS)('%s envuelve Login en Suspense CON fallback', (ruta) => {
    const src = leer(ruta);
    expect(src).toContain('<Suspense');
    // `<Suspense>` a secas es exactamente el bug.
    expect(src).not.toMatch(/<Suspense>\s/);
    expect(src).toMatch(/<Suspense\s+fallback=\{/);
  });

  it.each(PANTALLAS)('%s usa el esqueleto compartido, no un fallback vacío', (ruta) => {
    expect(leer(ruta)).toContain('EsqueletoDeAcceso');
  });

  it('el esqueleto pinta algo de verdad: no es un fragmento vacío', () => {
    const src = leer('app/(login)/_esqueleto.tsx');
    expect(src).toContain('min-h-[100dvh]');
    expect((src.match(/animate-pulse/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('el esqueleto se anuncia como carga para quien usa lector de pantalla', () => {
    const src = leer('app/(login)/_esqueleto.tsx');
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-label="Cargando"');
  });
});

describe('cerrar sesión recarga entero, no navega suave', () => {
  const src = leer('components/profile-dropdown.tsx');

  it('no vuelve al login con router.push: serviría el shell de la caché', () => {
    expect(src).not.toMatch(/router\.push\(['"]\/sign-in['"]\)/);
  });

  it('sale con una carga completa, que además tira la caché del router', () => {
    expect(src).toMatch(/window\.location\.(href|replace)/);
  });

  it('el borrado de la sesión sigue ocurriendo antes de salir', () => {
    const i = src.indexOf("fetch('/api/user', { method: 'DELETE' })");
    const j = src.search(/window\.location\.(href|replace)/);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
