import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { parametrosDeAviso, huecoDe, type DatosAviso } from '@/lib/whatsapp/plantillas';
import { aE164 } from '@/lib/whatsapp/telefono';

const BASE: DatosAviso = {
  colegio: 'Colegio Andrés Bello',
  concepto: 'Mensualidad de octubre',
  estudiante: 'Juan y Ana Pérez',
  monto: 'RD$4,500.00',
  telefonoColegio: '(809) 590-6713',
  fechaLimite: '3 de octubre',
  diasGracia: 5,
  fechaRecargo: '8 de octubre',
};

/**
 * Meta rellena las variables POR POSICIÓN. Un valor corrido de sitio no da
 * error: manda un mensaje que dice otra cosa —el concepto donde va el monto— y
 * eso le llega al padre.
 */
describe('parametrosDeAviso', () => {
  it('al-emitir lleva la fecha límite en el hueco del medio', () => {
    assert.deepEqual(parametrosDeAviso('al-emitir', BASE), [
      'Colegio Andrés Bello', 'Mensualidad de octubre', 'Juan y Ana Pérez',
      'RD$4,500.00', '3 de octubre', '(809) 590-6713',
    ]);
  });

  it('al-vencer-con-gracia lleva los días, no una fecha', () => {
    const r = parametrosDeAviso('al-vencer-con-gracia', BASE);
    assert.equal(r.length, 6);
    assert.equal(r[4], '5');
  });

  it('antes-mora lleva la fecha del recargo, no la del vencimiento', () => {
    assert.equal(parametrosDeAviso('antes-mora', BASE)[4], '8 de octubre');
  });

  it('las dos de vencimiento sin gracia no tienen hueco intermedio', () => {
    for (const a of ['al-vencer-con-recargo', 'al-vencer-sin-mora'] as const) {
      const r = parametrosDeAviso(a, BASE);
      assert.equal(r.length, 5, a);
      assert.equal(r[4], '(809) 590-6713', a);
    }
  });

  it('el teléfono siempre va al final', () => {
    for (const a of ['al-emitir', 'al-vencer-con-gracia', 'al-vencer-con-recargo',
                     'al-vencer-sin-mora', 'antes-mora'] as const) {
      assert.equal(parametrosDeAviso(a, BASE).at(-1), '(809) 590-6713', a);
    }
  });

  /** Meta rechaza el envío con 132000 si un valor va vacío o trae saltos. */
  it('nunca manda un valor vacío', () => {
    const pelado = parametrosDeAviso('al-emitir', {
      colegio: '', concepto: '  ', estudiante: '', monto: '',
      telefonoColegio: '', fechaLimite: null,
    });
    assert.equal(pelado.length, 6);
    for (const v of pelado) assert.ok(v.trim().length > 0, `vacío: ${JSON.stringify(pelado)}`);
  });

  it('aplasta los saltos de línea', () => {
    const r = parametrosDeAviso('al-vencer-sin-mora', {
      ...BASE, estudiante: 'Juan Pérez\ny\nAna Pérez',
    });
    assert.equal(r[2], 'Juan Pérez y Ana Pérez');
    for (const v of r) assert.ok(!v.includes('\n'));
  });

  it('el hueco que calcula huecoDe es el que se rellena', () => {
    assert.equal(huecoDe('al-vencer', true, 5), 'al-vencer-con-gracia');
    assert.equal(parametrosDeAviso(huecoDe('al-vencer', true, 5), BASE).length, 6);
    assert.equal(huecoDe('al-vencer', true, 0), 'al-vencer-con-recargo');
    assert.equal(parametrosDeAviso(huecoDe('al-vencer', true, 0), BASE).length, 5);
    assert.equal(huecoDe('al-vencer', false, 0), 'al-vencer-sin-mora');
    assert.equal(parametrosDeAviso(huecoDe('al-vencer', false, 0), BASE).length, 5);
  });
});

/**
 * El CRM trata `8293596602` y `18293596602` como contactos distintos: abre dos
 * conversaciones del mismo padre, el colegio contesta en una y el padre escribió
 * en la otra.
 */
describe('aE164', () => {
  it('le pone el 1 a los diez dígitos dominicanos', () => {
    assert.equal(aE164('8293596602'), '18293596602');
    assert.equal(aE164('(809) 590-6713'), '18095906713');
    assert.equal(aE164('829-641-2333'), '18296412333');
  });

  it('deja igual el que ya viene completo', () => {
    assert.equal(aE164('18293596602'), '18293596602');
    assert.equal(aE164('+1 (829) 359-6602'), '18293596602');
  });

  it('los tres formatos del mismo número dan lo mismo', () => {
    const r = ['8095906713', '(809) 590-6713', '809-590-6713', '+1 809 590 6713']
      .map(aE164);
    assert.equal(new Set(r).size, 1);
    assert.equal(r[0], '18095906713');
  });

  it('rechaza lo que no es un número al que escribirle', () => {
    for (const malo of ['', null, undefined, '123', '809590', 'ext. 44']) {
      assert.equal(aE164(malo), null, String(malo));
    }
  });
});

