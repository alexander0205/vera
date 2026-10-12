import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

/**
 * Quién cabe en la misma factura.
 *
 * La regla vieja era «un alumno por factura», y hacía cumplir lo correcto por
 * el motivo equivocado: lo que no puede pasar es cobrarle a alguien el hijo de
 * OTRO, no que un padre pague a sus dos hijos de una vez. Con la regla vieja,
 * un padre con dos hijos recibía dos facturas y hacía dos transferencias.
 *
 * La regla nueva es «un pagador»: se mezclan alumnos mientras todos apunten al
 * mismo `facturar_a_client_id`. Aquí se prueba la decisión, aislada de la
 * consulta, porque es la que impide cobrarle a quien no toca.
 */

type Alumno = { id: number; nombres: string; facturarAClientId: number | null };

/** La misma comprobación que hace `prefillDeCargos`. */
function cabenJuntos(alumnos: Alumno[]): { ok: true } | { ok: false; error: string } {
  if (alumnos.length <= 1) return { ok: true };

  const sinPagador = alumnos.filter((a) => a.facturarAClientId == null);
  if (sinPagador.length > 0) {
    return {
      ok: false,
      error: `Para facturar a varios hermanos juntos, todos necesitan responsable de pago. Le falta a ${sinPagador.map((a) => a.nombres).join(', ')}.`,
    };
  }
  if (new Set(alumnos.map((a) => a.facturarAClientId)).size > 1) {
    return { ok: false, error: 'Esos alumnos le facturan a responsables distintos: no caben en la misma factura.' };
  }
  return { ok: true };
}

const samil: Alumno = { id: 3168, nombres: 'Samil', facturarAClientId: 1022 };
const rawel: Alumno = { id: 3167, nombres: 'Rawel', facturarAClientId: 1022 };
const ajena: Alumno = { id: 3164, nombres: 'Alisa', facturarAClientId: 1689 };

describe('quién cabe en la misma factura', () => {
  test('dos hermanos con el mismo responsable, sí', () => {
    assert.deepEqual(cabenJuntos([samil, rawel]), { ok: true });
  });

  /** Lo que la regla existe para impedir. */
  test('alumnos de familias distintas, no', () => {
    const r = cabenJuntos([samil, ajena]);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /responsables distintos/);
  });

  /**
   * Sin responsable no hay a quién facturarle, y dejarlo pasar acabaría
   * colgándole el hermano al pagador del otro.
   */
  test('un hermano sin responsable de pago, no', () => {
    const r = cabenJuntos([samil, { ...rawel, facturarAClientId: null }]);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /Rawel/);
  });

  test('el error nombra a quién le falta, no dice «alguno»', () => {
    const r = cabenJuntos([
      { ...samil, facturarAClientId: null },
      { ...rawel, facturarAClientId: null },
    ]);
    const error = (r as { error: string }).error;
    assert.match(error, /Samil/);
    assert.match(error, /Rawel/);
  });

  /**
   * Un alumno solo pasa siempre, tenga responsable o no: es el caso de toda la
   * vida y no se le puede romper por una regla pensada para hermanos.
   */
  test('un alumno solo pasa aunque no tenga responsable', () => {
    assert.deepEqual(cabenJuntos([{ ...samil, facturarAClientId: null }]), { ok: true });
  });

  test('tres hermanos del mismo padre también', () => {
    assert.deepEqual(
      cabenJuntos([samil, rawel, { id: 999, nombres: 'Tercero', facturarAClientId: 1022 }]),
      { ok: true },
    );
  });
});

/**
 * Cada línea tiene que decir de qué hijo es.
 *
 * En una factura de dos hermanos con el mismo concepto, sin el beneficiario el
 * padre lee «Inscripción» dos veces seguidas al mismo precio y no sabe cuál es
 * de cuál — ni él ni el colegio cuando reclame.
 */
describe('el beneficiario de cada línea', () => {
  const beneficiarioDe = new Map<number, { id: number; nombre: string } | null>([
    [3168, { id: 11, nombre: 'Samil Yadiel Abreu' }],
    [3167, { id: 12, nombre: 'Rawel Jadiel Abreu' }],
  ]);

  const linea = (estudianteId: number) => {
    const b = beneficiarioDe.get(estudianteId) ?? null;
    return { dependienteId: b?.id ?? null, dependienteNombre: b?.nombre ?? '' };
  };

  test('cada cargo lleva el dependiente de SU alumno', () => {
    assert.equal(linea(3168).dependienteNombre, 'Samil Yadiel Abreu');
    assert.equal(linea(3167).dependienteNombre, 'Rawel Jadiel Abreu');
  });

  test('dos líneas del mismo concepto se distinguen por el beneficiario', () => {
    assert.notEqual(linea(3168).dependienteId, linea(3167).dependienteId);
  });

  test('un alumno sin dependiente no hereda el del hermano', () => {
    beneficiarioDe.set(3167, null);
    assert.equal(linea(3167).dependienteId, null);
    assert.equal(linea(3168).dependienteNombre, 'Samil Yadiel Abreu');
  });
});
