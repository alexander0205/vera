import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { analizarSms, contarPartes, esGsm7, aGsm7 } from '@/lib/sms/mensaje';

describe('esGsm7', () => {
  test('acepta los acentos que sí trae el alfabeto GSM-7', () => {
    assert.equal(esGsm7('Señor Perez, su hijo Jose tiene un saldo pendiente.'), true);
    assert.equal(esGsm7('é ñ ü à ì ò ù Ñ Ü É'), true);
    assert.equal(esGsm7('RD$1,500.00 - Colegio #1 (809) 555-1234'), true);
  });

  test('rechaza los que no: á í ó ú son UCS-2', () => {
    assert.equal(esGsm7('matrícula'), false);
    assert.equal(esGsm7('está'), false);
    assert.equal(esGsm7('período'), false);
    assert.equal(esGsm7('Andrés Bello — aviso'), false); // el guion largo también
  });
});

describe('analizarSms — GSM-7', () => {
  test('160 caracteres siguen siendo una sola parte', () => {
    const r = analizarSms('a'.repeat(160));
    assert.equal(r.codificacion, 'GSM-7');
    assert.equal(r.unidades, 160);
    assert.equal(r.partes, 1);
  });

  test('161 caracteres ya son dos partes (el límite baja a 153)', () => {
    assert.equal(contarPartes('a'.repeat(161)), 2);
    assert.equal(contarPartes('a'.repeat(306)), 2);
    assert.equal(contarPartes('a'.repeat(307)), 3);
  });

  test('los caracteres de la tabla de extensión cuentan doble', () => {
    const r = analizarSms('{}[]');
    assert.equal(r.codificacion, 'GSM-7');
    assert.equal(r.unidades, 8);
    assert.equal(r.partes, 1);
    // 80 llaves = 160 septetos = todavía una parte; una más se pasa.
    assert.equal(contarPartes('{'.repeat(80)), 1);
    assert.equal(contarPartes('{'.repeat(81)), 2);
  });

  test('un aviso de cobro típico cabe en una parte', () => {
    const aviso = 'Colegio Andres Bello: la mensualidad de Junio de Jose Perez '
      + 'vence el 05/06. Monto RD$4,500.00. Gracias.';
    const r = analizarSms(aviso);
    assert.equal(r.codificacion, 'GSM-7');
    assert.equal(r.partes, 1);
  });
});

describe('analizarSms — UCS-2', () => {
  test('un solo acento fuera de GSM-7 baja el límite a 70', () => {
    const r = analizarSms('á'.repeat(70));
    assert.equal(r.codificacion, 'UCS-2');
    assert.equal(r.unidades, 70);
    assert.equal(r.partes, 1);
    assert.equal(contarPartes('á'.repeat(71)), 2);
    assert.equal(contarPartes('á' + 'a'.repeat(133)), 2); // 134 chars: en GSM-7 era 1
  });

  test('un emoji cuenta como dos unidades UTF-16', () => {
    const r = analizarSms('🎓');
    assert.equal(r.codificacion, 'UCS-2');
    assert.equal(r.unidades, 2);
  });

  test('el mismo aviso cuesta el doble por una sola í', () => {
    // 101 caracteres. En GSM-7 es 1 parte; la "í" de matrícula lo pasa a UCS-2
    // y el límite baja de 160 a 70, así que sale en 2. Ese es todo el costo de
    // una tilde. (Ojo: "Pérez" o "Muñoz" NO tendrían este efecto — é y ñ sí
    // están en GSM-7.)
    const conTilde = 'Colegio Andres Bello: la matrícula de Junio de Jose Perez '
      + 'vence el 05/06. Monto RD$4,500.00. Gracias.';
    assert.equal(conTilde.length, 101);
    assert.equal(analizarSms(conTilde).codificacion, 'UCS-2');
    assert.equal(analizarSms(conTilde).partes, 2);
    assert.equal(analizarSms(aGsm7(conTilde)).codificacion, 'GSM-7');
    assert.equal(analizarSms(aGsm7(conTilde)).partes, 1);
  });
});

describe('aGsm7', () => {
  test('quita solo los acentos que GSM-7 no soporta', () => {
    assert.equal(aGsm7('matrícula'), 'matricula');
    assert.equal(aGsm7('período'), 'periodo');
    // ñ, é y ü sí existen en GSM-7: se quedan como están.
    assert.equal(aGsm7('Señor José Muñoz'), 'Señor José Muñoz');
  });

  test('normaliza comillas, guiones y espacios tipográficos', () => {
    assert.equal(aGsm7('“hola” – adiós…'), '"hola" - adios...');
    assert.equal(aGsm7('uno dos'), 'uno dos');
  });

  test('el resultado ya es GSM-7', () => {
    const original = 'Matrícula al día — José Ramírez “el mayor”';
    assert.equal(esGsm7(original), false);
    assert.equal(esGsm7(aGsm7(original)), true);
  });
});
