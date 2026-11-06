import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { MAX_POR_DIA, MAX_POR_MINUTO, puedeLlamarAlModelo, type Limitador } from '@/lib/academia/limite';

/** Un limitador de mentira que cuenta como el de la base: por clave y con tope. */
function falso(): { limitar: Limitador; llamadas: string[] } {
  const cuentas = new Map<string, number>();
  const llamadas: string[] = [];
  return {
    llamadas,
    limitar: async (clave, max) => {
      llamadas.push(clave);
      const n = (cuentas.get(clave) ?? 0) + 1;
      cuentas.set(clave, n);
      return { allowed: n <= max };
    },
  };
}

describe('puedeLlamarAlModelo', () => {
  it('deja pasar mientras no se pase del tope por minuto', async () => {
    const { limitar } = falso();
    for (let i = 0; i < MAX_POR_MINUTO; i++) assert.equal(await puedeLlamarAlModelo(1, limitar), true);
    assert.equal(await puedeLlamarAlModelo(1, limitar), false);
  });
  it('el tope es por persona', async () => {
    const { limitar } = falso();
    for (let i = 0; i < MAX_POR_MINUTO + 1; i++) await puedeLlamarAlModelo(1, limitar);
    assert.equal(await puedeLlamarAlModelo(2, limitar), true);
  });
  it('hay un tope diario aparte del de cada minuto', async () => {
    const cuentas = new Map<string, number>();
    const limitar: Limitador = async (clave, max) => {
      if (clave.includes('-min:')) return { allowed: true }; // el minuto siempre libre
      const n = (cuentas.get(clave) ?? 0) + 1;
      cuentas.set(clave, n);
      return { allowed: n <= max };
    };
    for (let i = 0; i < MAX_POR_DIA; i++) assert.equal(await puedeLlamarAlModelo(7, limitar), true);
    assert.equal(await puedeLlamarAlModelo(7, limitar), false);
  });
  it('usa claves distintas para el minuto y el día', async () => {
    const { limitar, llamadas } = falso();
    await puedeLlamarAlModelo(9, limitar);
    assert.deepEqual(llamadas, ['academia-preguntar-min:9', 'academia-preguntar-dia:9', 'academia-preguntar-global-dia']);
  });
  it('si el contador falla, NO se llama al modelo (falla cerrado)', async () => {
    assert.equal(await puedeLlamarAlModelo(1, async () => { throw new Error('base caída'); }), false);
  });
});
