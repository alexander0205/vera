/**
 * Duplicar un concepto: qué se copia, qué no, y cómo se llama la copia.
 *
 * No requieren DB ni browser: corren con `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import {
  LARGO_NOMBRE, cuotasDeLaCopia, nombreSugerido, valoresDeLaCopia,
} from '@/lib/administracion-escolar/duplicar-concepto';
import type { adminEscolarConceptosPago, adminEscolarConceptoCuotas } from '@/lib/db/schema';

type Concepto = typeof adminEscolarConceptosPago.$inferSelect;
type Cuota = typeof adminEscolarConceptoCuotas.$inferSelect;

const ahora = new Date('2026-11-02T12:00:00Z');

const origen: Concepto = {
  id: 7, teamId: 45, nombre: 'Evaluación inicial', tipo: 'otro', frecuencia: 'unico',
  aplicaPorDefecto: true, opcional: true, precioPorCuota: false, categoria: 'Evaluaciones',
  admiteBeca: false, cobraMora: true, diaEmision: 28, diasParaPago: 5,
  avisosActivos: true, avisoDiaEmision: true, avisoAntesMoraDias: 2, avisoDiaVencimiento: true,
  moraDiasGracia: 3, avisoCorreo: true, avisoWhatsapp: true, avisoSms: false,
  descuentoAdelantoPct: 10, productId: 99, activo: false, orden: 4,
  createdAt: ahora, updatedAt: ahora,
};

const cuota = (over: Partial<Cuota>): Cuota => ({
  id: 1, teamId: 45, conceptoId: 7, periodoId: 11, numero: 1, etiqueta: 'Evaluación inicial',
  mes: 9, fechaEmision: '2026-09-01', porcentajeMilesimas: 100000, activo: true,
  createdAt: ahora, updatedAt: ahora, ...over,
});

describe('valoresDeLaCopia', () => {
  test('copia toda la configuración con el nombre y el orden nuevos', () => {
    const v = valoresDeLaCopia(origen, 'Evaluación final', 12);
    assert.equal(v.nombre, 'Evaluación final');
    assert.equal(v.orden, 12);
    for (const campo of ['tipo', 'frecuencia', 'opcional', 'categoria', 'cobraMora', 'diaEmision',
      'diasParaPago', 'avisosActivos', 'avisoAntesMoraDias', 'moraDiasGracia', 'avisoWhatsapp',
      'descuentoAdelantoPct', 'aplicaPorDefecto', 'precioPorCuota', 'teamId'] as const) {
      assert.deepEqual(v[campo], origen[campo], campo);
    }
  });

  test('sin producto de facturación, activa y sin id ni fechas del original', () => {
    const v = valoresDeLaCopia(origen, 'Evaluación final', 12) as Record<string, unknown>;
    assert.equal(v.productId, null);
    assert.equal(v.activo, true);
    assert.ok(!('id' in v) && !('createdAt' in v) && !('updatedAt' in v));
  });
});

describe('cuotasDeLaCopia', () => {
  test('copia el calendario de todos los años, colgado del concepto nuevo', () => {
    const filas = cuotasDeLaCopia({ ...origen, frecuencia: 'mensual' }, [
      cuota({ id: 1, numero: 1, etiqueta: 'Septiembre', periodoId: 11 }),
      cuota({ id: 2, numero: 2, etiqueta: 'Octubre', mes: 10, fechaEmision: '2026-10-01', porcentajeMilesimas: 50000, periodoId: 11 }),
      cuota({ id: 3, numero: 1, etiqueta: 'Septiembre', periodoId: 12, activo: false }),
    ], 30, 'Transporte');
    assert.equal(filas.length, 3);
    assert.ok(filas.every((f) => f.conceptoId === 30));
    assert.deepEqual(filas.map((f) => [f.periodoId, f.numero, f.etiqueta]),
      [[11, 1, 'Septiembre'], [11, 2, 'Octubre'], [12, 1, 'Septiembre']]);
    assert.equal(filas[1].porcentajeMilesimas, 50000);
    assert.equal(filas[2].activo, false);
    assert.ok(!('id' in filas[0]));
  });

  test('la cuota del pago único toma el nombre de la copia', () => {
    const [f] = cuotasDeLaCopia(origen, [cuota({})], 30, 'Evaluación final');
    assert.equal(f.etiqueta, 'Evaluación final');
  });

  test('un nombre largo cabe en la etiqueta de la cuota', () => {
    const [f] = cuotasDeLaCopia(origen, [cuota({})], 30, 'x'.repeat(LARGO_NOMBRE));
    assert.equal(f.etiqueta, 'x'.repeat(60));
  });

  test('una etiqueta escrita a mano se respeta', () => {
    const [f] = cuotasDeLaCopia(origen, [cuota({ etiqueta: 'Pago de evaluación' })], 30, 'Evaluación final');
    assert.equal(f.etiqueta, 'Pago de evaluación');
  });
});

describe('nombreSugerido', () => {
  test('«X (copia)», y numerada si ya existe', () => {
    assert.equal(nombreSugerido('Inscripción', ['Inscripción']), 'Inscripción (copia)');
    assert.equal(nombreSugerido('Inscripción', ['Inscripción', 'inscripción  (COPIA)']), 'Inscripción (copia 2)');
  });

  test('no pasa del largo de la columna', () => {
    const largo = 'x'.repeat(LARGO_NOMBRE);
    const s = nombreSugerido(largo, [largo]);
    assert.ok(s.length <= LARGO_NOMBRE);
    assert.ok(s.endsWith(' (copia)'));
  });
});
