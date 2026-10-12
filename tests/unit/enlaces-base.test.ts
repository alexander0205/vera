import { describe, test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { baseDeEnlaces, esHostLocal, BASE_PUBLICA } from '@/lib/config/enlaces';
import { origenPublico } from '@/lib/http/origen-publico';
import type { NextRequest } from 'next/server';

/**
 * De dónde cuelga el enlace de pago.
 *
 * Esto se prueba porque su forma de fallar es silenciosa y cara: el enlace se
 * genera bien, se guarda bien, y lo que está mal es solo el trozo de delante —
 * así que nadie se entera hasta que un padre dice que no le abre, y para
 * entonces ya salió por WhatsApp a trescientas familias.
 *
 * Los dos fallos que ya ocurrieron:
 *
 *  · `NEXT_PUBLIC_APP_URL` sin definir dejaba `/pagar/<token>`, una ruta
 *    relativa, que pegada en un WhatsApp no lleva a ninguna parte.
 *  · En la máquina de desarrollo esa variable es una IP de casa, y era la que
 *    el colegio copiaba de la pantalla.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.PLANTILLAS_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

/** `NODE_ENV` es de solo lectura en los tipos, pero no en tiempo de ejecución. */
function conEntorno(v: string) {
  Object.defineProperty(process.env, 'NODE_ENV', { value: v, configurable: true });
}

describe('la base de los enlaces', () => {
  test('sin nada definido, la pública — nunca vacía', () => {
    assert.equal(baseDeEnlaces(), BASE_PUBLICA);
  });

  test('jamás devuelve algo relativo', () => {
    for (const v of [undefined, '', '   ', '/pagar', 'facturacion.zero.com.do']) {
      if (v === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = v;
      assert.match(baseDeEnlaces(), /^https?:\/\//, `falló con ${JSON.stringify(v)}`);
    }
  });

  test('lo dicho a propósito gana', () => {
    process.env.PLANTILLAS_BASE_URL = 'https://colegio.zero.com.do';
    process.env.NEXT_PUBLIC_APP_URL = 'https://otra.zero.com.do';
    assert.equal(baseDeEnlaces(), 'https://colegio.zero.com.do');
  });

  test('la barra final no se duplica', () => {
    process.env.PLANTILLAS_BASE_URL = 'https://colegio.zero.com.do/';
    assert.equal(baseDeEnlaces(), 'https://colegio.zero.com.do');
  });

  /**
   * El que de verdad importa: `.env` de una máquina de desarrollo lleva una IP
   * de casa, y si ese archivo llega a producción todos los padres reciben un
   * enlace a la red local de alguien.
   */
  test('en producción no se acepta una dirección de casa', () => {
    conEntorno('production');
    for (const casera of [
      'http://10.0.0.63:3004',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.1.40:3000',
      'http://172.16.0.5:3000',
    ]) {
      process.env.NEXT_PUBLIC_APP_URL = casera;
      assert.equal(baseDeEnlaces(), BASE_PUBLICA, `dejó pasar ${casera}`);
    }
  });

  test('en desarrollo sí, que es donde se prueba', () => {
    conEntorno('development');
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3002';
    assert.equal(baseDeEnlaces(), 'http://localhost:3002');
  });

  test('en producción, la del despliegue de Vercel antes que la pública', () => {
    conEntorno('production');
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'facturacion-v2.zero.com.do';
    assert.equal(baseDeEnlaces(), 'https://facturacion-v2.zero.com.do');
  });
});

/**
 * Lo que se le devuelve a alguien que está mirando la pantalla sale del origen
 * de SU petición. Es la única fuente que no puede quedar desincronizada: si
 * entró por el puerto 3002, el enlace es del 3002.
 */
/**
 * `esHostLocal` decide si un host es de casa. De ella cuelgan dos cosas: que en
 * producción no se acepte una base casera, y que en desarrollo con el teléfono
 * se use http en vez de https contra la IP de la Mac, donde no hay TLS.
 */
describe('qué es un host de casa', () => {
  test('lo son', () => {
    for (const h of ['localhost:3002', '127.0.0.1', '10.0.0.63:3004', '192.168.1.40',
                     '172.16.0.5', '172.31.255.1', 'mac-de-alex.local', '::1', '0.0.0.0']) {
      assert.equal(esHostLocal(h), true, `${h} debería ser local`);
    }
  });

  test('no lo son', () => {
    for (const h of ['facturacion.zero.com.do', 'facturacion-v2.zero.com.do',
                     // 172.32 queda FUERA del rango privado, que acaba en 172.31.
                     '172.32.0.1', '11.0.0.1', '9.9.9.9']) {
      assert.equal(esHostLocal(h), false, `${h} no debería ser local`);
    }
  });
});

/**
 * Lo que se le devuelve a alguien que está mirando la pantalla sale del origen
 * de SU petición. Es la única fuente que no puede quedar desincronizada: si
 * entró por el puerto 3002, el enlace es del 3002.
 *
 * Se prueba `origenPublico`, que ya existía y usan seis rutas más, en vez de
 * una copia paralela.
 */
describe('la base sacada de la petición', () => {
  const pedir = (h: Record<string, string>) =>
    origenPublico({ headers: new Headers(h) } as unknown as NextRequest);

  test('usa el host y el protocolo de la petición', () => {
    assert.equal(pedir({ host: 'facturacion.zero.com.do', 'x-forwarded-proto': 'https' }),
      'https://facturacion.zero.com.do');
  });

  test('en local se queda en el puerto por el que entró, y sin TLS', () => {
    assert.equal(pedir({ host: 'localhost:3002' }), 'http://localhost:3002');
    assert.equal(pedir({ host: '10.0.0.63:3004' }), 'http://10.0.0.63:3004');
  });

  test('detrás de un proxy manda x-forwarded-host', () => {
    assert.equal(
      pedir({ host: 'interno:3000', 'x-forwarded-host': 'facturacion.zero.com.do', 'x-forwarded-proto': 'https' }),
      'https://facturacion.zero.com.do',
    );
  });

  /** Sin host caía a `''`, y eso convertía el enlace en una ruta relativa. */
  test('sin host cae a la del despliegue, nunca a cadena vacía', () => {
    const r = pedir({});
    assert.equal(r, baseDeEnlaces());
    assert.match(r, /^https?:\/\//);
  });
});
