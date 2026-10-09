/**
 * Tests unitarios de la lógica de fecha RD que arregló el hotfix
 * hotfix/vencimiento-fecha-utc (bug: "hoy" se calculaba en UTC, así que entre
 * las 20:00 y las 00:00 hora RD el sistema creía que ya era mañana — mora
 * cobrada un día antes de tiempo, facturas marcadas vencidas de más).
 *
 * No requieren DB ni browser: corren con `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { fechaRD, diasVencido } from '@/lib/utils/format';

describe('fechaRD — fecha calendario en zona RD', () => {
  test('un instante de las 21:00 RD del día 20 sigue siendo 20 en RD, aunque UTC ya sea 21', () => {
    // 21:00 RD (UTC-4) del 20-jul == 01:00 UTC del 21-jul.
    const instante = new Date('2026-07-21T01:00:00Z');
    assert.equal(instante.toISOString().slice(0, 10), '2026-07-21'); // lo que daba el código viejo (mal)
    assert.equal(fechaRD(instante), '2026-07-20'); // lo que es en RD (correcto)
  });

  test('un instante de la 01:00 RD del día 21 ya es 21 tanto en RD como en UTC', () => {
    // 01:00 RD del 21-jul == 05:00 UTC del 21-jul.
    const instante = new Date('2026-07-21T05:00:00Z');
    assert.equal(fechaRD(instante), '2026-07-21');
  });

  test('justo en el borde: 00:00 RD (04:00 UTC) ya cuenta como el nuevo día en RD', () => {
    const instante = new Date('2026-07-21T04:00:00Z');
    assert.equal(fechaRD(instante), '2026-07-21');
  });

  test('un minuto antes del borde (03:59 UTC) todavía es el día anterior en RD', () => {
    const instante = new Date('2026-07-21T03:59:00Z');
    assert.equal(fechaRD(instante), '2026-07-20');
  });
});

describe('diasVencido — días de atraso contra una fecha calendario RD', () => {
  test('fecha límite null/undefined → 0', () => {
    assert.equal(diasVencido(null), 0);
    assert.equal(diasVencido(undefined), 0);
  });

  test('fecha límite hoy mismo → 0 días vencido (vence hoy, no está vencida)', () => {
    assert.equal(diasVencido('2026-07-20', '2026-07-20'), 0);
  });

  test('fecha límite ayer → 1 día vencido', () => {
    assert.equal(diasVencido('2026-07-19', '2026-07-20'), 1);
  });

  test('fecha límite en el futuro → 0 (nunca negativo)', () => {
    assert.equal(diasVencido('2026-07-25', '2026-07-20'), 0);
  });

  test('30 días exactos de atraso', () => {
    assert.equal(diasVencido('2026-06-20', '2026-07-20'), 30);
  });

  test('acepta timestamp completo en fechaLimite (recorta a la parte de fecha)', () => {
    assert.equal(diasVencido('2026-07-19T14:32:00.000Z', '2026-07-20'), 1);
  });

  test('cruce de mes se calcula por días calendario reales, no por resta de campos', () => {
    // 31-ene → 01-mar: 2026 no es bisiesto, así que son 29 días (28 de feb + 1).
    assert.equal(diasVencido('2026-01-31', '2026-03-01'), 29);
  });

  test('escenario del bug original: sin el fix, "hoy" en UTC habría adelantado un día', () => {
    // Factura vence el 20-jul. Evaluada con hoy = 20-jul (RD correcto): no vencida.
    assert.equal(diasVencido('2026-07-20', '2026-07-20'), 0);
    // El código viejo, a las 21:00 RD, habría usado hoy = 21-jul (UTC) y esto
    // habría dado 1 día vencido — suficiente para disparar mora antes de tiempo.
    assert.equal(diasVencido('2026-07-20', '2026-07-21'), 1);
  });

  test('sin segundo argumento usa hoyRD() real — no lanza y devuelve un número >= 0', () => {
    const r = diasVencido('2020-01-01');
    assert.equal(typeof r, 'number');
    assert.ok(r >= 0);
  });
});
