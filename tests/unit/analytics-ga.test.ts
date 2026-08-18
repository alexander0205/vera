import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

/**
 * Lo que puede salir hacia Google desde las páginas públicas.
 *
 * Zero tiene siete sitios donde la dirección de la página ES el secreto: las
 * cinco rutas con token —`/pagar`, `/pay`, `/d`, `/f/…/r`, `/foto`— y las dos
 * pantallas que lo llevan en la query, `/reset-password?token=` y
 * `/completar-registro?t=`. Una etiqueta de medición manda la URL completa por
 * defecto, así que sin esta capa el enlace de pago de un padre y la llave para
 * cambiar una contraseña acabarían escritos en un informe de Google Analytics
 * que además se puede compartir con quien sea.
 *
 * Se prueba la copia de `lib/config/analytics.ts` porque el módulo lee
 * `process.env.NEXT_PUBLIC_GA_ID` al importarse, y aquí interesa la lógica, no
 * el valor del entorno.
 */

const PARAMETROS_PERMITIDOS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid',
  'perfil', 'ref',
]);

const CAMINOS_PROHIBIDOS = [
  /^\/pagar(\/|$)/, /^\/pay(\/|$)/, /^\/d(\/|$)/, /^\/foto(\/|$)/, /^\/f(\/|$)/,
];

function caminoMedible(camino: string): boolean {
  return !CAMINOS_PROHIBIDOS.some(p => p.test(camino));
}

function rutaMedible(camino: string, busqueda: string): string {
  const entrada = new URLSearchParams(busqueda);
  const limpia = new URLSearchParams();
  for (const clave of [...PARAMETROS_PERMITIDOS].sort()) {
    const valor = entrada.get(clave);
    if (valor) limpia.set(clave, valor);
  }
  const cola = limpia.toString();
  return cola ? `${camino}?${cola}` : camino;
}

const FORMATO_GA4 = /^G-[A-Z0-9]{6,15}$/;

describe('los secretos no salen en la URL medida', () => {
  test('el token de recuperar contraseña se queda fuera', () => {
    assert.equal(rutaMedible('/reset-password', '?token=a1b2c3d4e5f6'), '/reset-password');
  });

  test('el token de completar registro se queda fuera', () => {
    assert.equal(rutaMedible('/completar-registro', '?t=secreto'), '/completar-registro');
  });

  /** Lo que más daño hace: el enlace que le llega al padre por WhatsApp. */
  test('las rutas con token no se miden en absoluto', () => {
    for (const r of ['/pagar/abc123', '/pay/abc123', '/d/abc123', '/foto/abc123', '/f/colegio-x/r/abc123']) {
      assert.equal(caminoMedible(r), false, r);
    }
  });

  test('las páginas públicas sí se miden', () => {
    for (const r of ['/', '/precios', '/contacto', '/privacidad', '/terminos', '/sign-up', '/sign-in']) {
      assert.equal(caminoMedible(r), true, r);
    }
  });

  /**
   * `/f` prohibido no puede llevarse por delante `/forgot-password`, que
   * empieza igual y sí hay que medir: es parte del embudo.
   */
  test('un camino que solo empieza igual sigue midiéndose', () => {
    assert.equal(caminoMedible('/forgot-password'), true);
    assert.equal(caminoMedible('/precios'), true);
    assert.equal(caminoMedible('/dashboard'), true);
  });

  /** Un parámetro nuevo que nadie declaró se cae solo. Ese es el punto. */
  test('lo que no está en la lista no pasa', () => {
    assert.equal(rutaMedible('/x', '?token=1&clave=2&email=a@b.com&id=99'), '/x');
  });
});

describe('lo que sí interesa medir', () => {
  test('las campañas pasan enteras', () => {
    assert.equal(
      rutaMedible('/precios', '?utm_source=facebook&utm_campaign=colegios'),
      '/precios?utm_campaign=colegios&utm_source=facebook',
    );
  });

  test('el perfil del contacto pasa', () => {
    assert.equal(rutaMedible('/contacto', '?perfil=colegio'), '/contacto?perfil=colegio');
  });

  /**
   * Mismo enlace, parámetros en otro orden: tienen que contar como UNA página.
   * Si no, el informe parte la misma campaña en dos filas.
   */
  test('el orden de los parámetros no parte la cuenta', () => {
    const a = rutaMedible('/precios', '?utm_source=x&utm_medium=y');
    const b = rutaMedible('/precios', '?utm_medium=y&utm_source=x');
    assert.equal(a, b);
  });

  test('un parámetro permitido conviviendo con un secreto: solo pasa el permitido', () => {
    assert.equal(
      rutaMedible('/completar-registro', '?t=secreto&utm_source=correo'),
      '/completar-registro?utm_source=correo',
    );
  });

  test('sin query, la ruta va limpia y sin interrogación', () => {
    assert.equal(rutaMedible('/precios', ''), '/precios');
  });
});

describe('el identificador de GA4', () => {
  test('acepta el formato bueno', () => {
    assert.equal(FORMATO_GA4.test('G-ABC1234567'), true);
    assert.equal(FORMATO_GA4.test('G-XYZ789012'), true);
  });

  /**
   * Una errata en el identificador no revienta: la etiqueta carga, no protesta
   * y meses después resulta que no se midió nada. Por eso se valida.
   */
  test('rechaza lo que no lo es', () => {
    for (const malo of ['', 'UA-123456-1', 'G-', 'GTM-ABC123', 'g-abc1234567', 'G-abc1234567', 'ABC1234567']) {
      assert.equal(FORMATO_GA4.test(malo), false, malo);
    }
  });
});
