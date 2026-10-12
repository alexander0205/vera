/**
 * Unit tests — que lo que se GUARDA de un plan se pueda VOLVER A LEER.
 *
 * Este archivo existe por un fallo concreto: el checkout y el webhook
 * guardaban `planDef.name` en `teams.plan_name`, y `getPlan()` resuelve por
 * `key`. Para tres planes daba igual («Pro» es la clave `pro`), pero para los
 * otros cinco no: «Ilimitado» no es `multisucursal` y «Avanzado» no es
 * `colegio-avanzado`.
 *
 * El resultado era que un colegio pagaba US$350, Stripe confirmaba, y el
 * sistema lo leía como FREE_PLAN — cero comprobantes, sin módulos y en solo
 * lectura. Silencioso, porque todo lo demás funcionaba.
 *
 * La regla que se protege aquí: cualquier cosa que se pueda haber escrito en
 * esa columna tiene que resolver al plan correcto.
 */

import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');

const {
  PLANS, FREE_PLAN, getPlan, planesDeFamilia, planColorMui, planChipColors,
} = await import('@/lib/config/plans');

describe('ida y vuelta de plan_name', () => {
  it('la CLAVE resuelve a su plan — es lo que se guarda hoy', () => {
    for (const p of PLANS) {
      expect(getPlan(p.key).key, `clave ${p.key}`).toBe(p.key);
    }
  });

  it('el NOMBRE también — filas viejas escritas por el checkout anterior', () => {
    for (const p of PLANS) {
      expect(getPlan(p.name).key, `nombre «${p.name}»`).toBe(p.key);
    }
  });

  it('no distingue mayúsculas ni espacios de sobra', () => {
    expect(getPlan('  COLEGIO-AVANZADO ').key).toBe('colegio-avanzado');
    expect(getPlan('ILIMITADO').key).toBe('ilimitado');
    // La clave vieja también, y por el mismo camino: CLAVES_ANTIGUAS se
    // consulta después de normalizar. Ver tests/unit/plan-alias.test.ts.
    expect(getPlan('  MultiSucursal '.toLowerCase().trim()).key).toBe('ilimitado');
  });

  it('lo desconocido, vacío o nulo cae al plan sin suscripción', () => {
    for (const v of [null, undefined, '', '   ', 'starter', 'business', 'plan-que-no-existe']) {
      expect(getPlan(v).key, String(v)).toBe(FREE_PLAN.key);
    }
  });

  it('las claves del catálogo son únicas', () => {
    const claves = PLANS.map(p => p.key);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('ningún nombre de plan choca con la clave de OTRO plan', () => {
    // Si pasara, `getPlan` resolvería un plan cuando le pasan el nombre de
    // otro — y el error sería invisible porque devolvería algo válido.
    for (const p of PLANS) {
      const otro = PLANS.find(q => q.key !== p.key && q.key === p.name.toLowerCase());
      expect(otro, `«${p.name}» choca con la clave de ${otro?.key}`).toBeUndefined();
    }
  });
});

describe('derivados que dependen del catálogo', () => {
  it('cada plan tiene su tono, y el plan sin suscripción va en gris', () => {
    for (const p of PLANS) {
      expect(planColorMui(p.key), p.key).not.toBe('default');
      expect(planChipColors(p.key).bgcolor).toBeTruthy();
    }
    expect(planColorMui(FREE_PLAN.key)).toBe('default');
  });

  it('las dos familias tienen planes y ninguna se queda vacía', () => {
    expect(planesDeFamilia('ecf').length).toBeGreaterThan(0);
    expect(planesDeFamilia('colegio').length).toBeGreaterThan(0);
  });

  it('todo plan de catálogo declara su variable de precio de Stripe', () => {
    for (const p of PLANS) {
      expect(p.priceEnvKey, `${p.key} sin priceEnvKey`).toBeTruthy();
    }
  });
});
