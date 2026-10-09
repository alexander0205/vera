import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { normalizarTelefono, esTelefonoRd } from '@/lib/sms/telefono';

describe('normalizarTelefono — formas que sí se aceptan', () => {
  const validos: Array<[string, string]> = [
    ['8095551234',        '+18095551234'],
    ['809-555-1234',      '+18095551234'],
    ['(809) 555-1234',    '+18095551234'],
    ['(809)555-1234',     '+18095551234'],
    ['809 555 1234',      '+18095551234'],
    ['  8295551234  ',    '+18295551234'],
    ['849.555.1234',      '+18495551234'],
    ['+18095551234',      '+18095551234'],
    ['+1 809 555 1234',   '+18095551234'],
    ['+1 (809) 555-1234', '+18095551234'],
    ['18095551234',       '+18095551234'],
    ['1-809-555-1234',    '+18095551234'],
    ['1 (809) 555 1234',  '+18095551234'],
    // Prefijos de marcación internacional escritos a mano.
    ['0018095551234',     '+18095551234'],
    ['0118095551234',     '+18095551234'],
    // Código de país escrito explícitamente: lo respetamos aunque no sea RD.
    ['+50912345678',      '+50912345678'],
    ['+1 212 555 1234',   '+12125551234'],
  ];

  for (const [entrada, esperado] of validos) {
    test(`${JSON.stringify(entrada)} → ${esperado}`, () => {
      assert.equal(normalizarTelefono(entrada), esperado);
    });
  }
});

describe('normalizarTelefono — lo que se rechaza a propósito', () => {
  const invalidos: Array<[string | null | undefined, string]> = [
    [null,                  'null'],
    [undefined,             'undefined'],
    ['',                    'vacío'],
    ['   ',                 'solo espacios'],
    ['no tiene',            'texto libre'],
    ['N/A',                 'texto libre'],
    ['809-555-1234 ext 12', 'extensión: los dígitos se pegarían al número'],
    ['5551234',             '7 dígitos: no sabemos el área'],
    ['555-1234',            '7 dígitos con guion'],
    ['80955512',            '8 dígitos: incompleto'],
    ['80955512345',         '11 dígitos que no empiezan en 1'],
    ['2125551234',          'área NANP no dominicana sin país explícito'],
    ['4121234567',          'número extranjero sin código de país'],
    ['809-555-1234 / 829-555-9999', 'dos números en la misma casilla'],
    ['8095551234 8295559999',       'dos números pegados'],
    ['8090001234',          'central que empieza en 0'],
    ['8091111111',          'central que empieza en 1 (relleno)'],
    ['0000000000',          'todo ceros'],
    ['1234567890',          'área que empieza en 1'],
    ['+0123456789',         'código de país que empieza en 0'],
    ['+1234567',            'internacional demasiado corto'],
    ['+1234567890123456',   'internacional más largo que E.164'],
    ['+18095551',           '+1 incompleto'],
    ['+180955512345',       '+1 con un dígito de más'],
  ];

  for (const [entrada, porque] of invalidos) {
    test(`${JSON.stringify(entrada)} → null (${porque})`, () => {
      assert.equal(normalizarTelefono(entrada), null);
    });
  }
});

describe('esTelefonoRd', () => {
  test('reconoce las tres áreas dominicanas', () => {
    assert.equal(esTelefonoRd('+18095551234'), true);
    assert.equal(esTelefonoRd('+18295551234'), true);
    assert.equal(esTelefonoRd('+18495551234'), true);
  });

  test('un +1 de EE.UU. no es dominicano', () => {
    assert.equal(esTelefonoRd('+12125551234'), false);
  });

  test('un número de otro país no es dominicano', () => {
    assert.equal(esTelefonoRd('+50912345678'), false);
  });
});
