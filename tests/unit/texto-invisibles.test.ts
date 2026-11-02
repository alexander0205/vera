/**
 * Caracteres invisibles (Unicode `Cf`) pegados de WhatsApp, PDFs o el portal.
 *
 * Caso real: una tutora con un U+200E delante de la cédula no se podía hacer
 * responsable de pago — «40212926592» fallaba como documento inválido y en
 * pantalla no se veía nada raro.
 *
 * No requieren DB ni browser: corren con `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { sinInvisibles, textoLimpio } from '@/lib/utils/format';
import { clienteSchema } from '@/lib/clientes/schema';

const LRM = '‎';

describe('textoLimpio', () => {
  test('quita U+200E, U+200B y U+FEFF y recorta', () => {
    assert.equal(textoLimpio(`${LRM}40212926592`), '40212926592');
    assert.equal(textoLimpio(' ​Radelys﻿ '), 'Radelys');
  });

  test('vacío, solo invisibles o ausente → null', () => {
    assert.equal(textoLimpio(''), null);
    assert.equal(textoLimpio(`${LRM}  `), null);
    assert.equal(textoLimpio(undefined), null);
    assert.equal(textoLimpio(null), null);
  });

  test('deja intactos los acentos y la ñ', () => {
    assert.equal(sinInvisibles('Fernández Peña'), 'Fernández Peña');
  });
});

describe('clienteSchema — datos de un tutor pegados con invisibles', () => {
  test('la cédula con U+200E pasa y se guarda limpia', () => {
    const r = clienteSchema.safeParse({
      razonSocial: `${LRM}Radelys Arissa Reyes Fernández`,
      rnc: `${LRM}40212926592`,
      whatsapp: `${LRM}8295517824`,
    });
    assert.ok(r.success);
    assert.equal(r.data.rnc, '40212926592');
    assert.equal(r.data.razonSocial, 'Radelys Arissa Reyes Fernández');
    assert.equal(r.data.whatsapp, '8295517824');
  });

  test('una cédula mala sigue siendo mala aunque traiga invisibles', () => {
    const r = clienteSchema.safeParse({ razonSocial: 'X', rnc: `${LRM}123` });
    assert.ok(!r.success);
    assert.ok(r.error.issues.some((i) => i.path[0] === 'rnc'));
  });

  test('el correo con espacios en los bordes pasa recortado', () => {
    const r = clienteSchema.safeParse({ razonSocial: 'X', email: ' a@b.com ' });
    assert.ok(r.success);
    assert.equal(r.data.email, 'a@b.com');
  });
});
