import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { crearSondeo } from '@/lib/sondeo/sondeo';

/**
 * El programador que reemplaza a los `setInterval` fijos del soporte: cada
 * espera se decide después de cada consulta, `null` pausa, y nunca hay dos
 * consultas a la vez.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Una consulta que tarda `ms` en contestar y cuenta cuántas veces se hizo. */
function consultaQueTarda(ms = 0) {
  const c = { veces: 0, enVuelo: 0, maxEnVuelo: 0 };
  const consultar = async (senal: AbortSignal) => {
    c.veces++;
    c.enVuelo++;
    c.maxEnVuelo = Math.max(c.maxEnVuelo, c.enVuelo);
    try {
      // Con 0 no se usa un temporizador: los falsos le suman 1 ms a cada
      // `setTimeout(…, 0)` anidado y el reloj de la prueba se iría corriendo.
      if (ms > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, ms);
          senal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('abortada')); });
        });
      } else {
        await Promise.resolve();
      }
    } finally {
      c.enVuelo--;
    }
  };
  return { c, consultar };
}

describe('crearSondeo', () => {
  it('pregunta al ritmo que dice intervalo(), releído tras cada consulta', async () => {
    const { c, consultar } = consultaQueTarda();
    let ms: number | null = 1_000;
    const s = crearSondeo({ consultar, intervalo: () => ms });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(c.veces, 1);
    await vi.advanceTimersByTimeAsync(3_000);
    assert.equal(c.veces, 4);
    ms = 5_000; // se aplica desde la próxima vuelta
    await vi.advanceTimersByTimeAsync(1_000);
    assert.equal(c.veces, 5);
    await vi.advanceTimersByTimeAsync(4_999);
    assert.equal(c.veces, 5);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(c.veces, 6);
    s.detener();
  });

  it('null pausa, y refrescar() lo despierta en el acto', async () => {
    const { c, consultar } = consultaQueTarda();
    let ms: number | null = null;
    const s = crearSondeo({ consultar, intervalo: () => ms });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    assert.equal(c.veces, 1, 'una hora en pausa: una sola consulta, la del arranque');
    ms = 2_000;
    s.refrescar();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(c.veces, 2);
    await vi.advanceTimersByTimeAsync(2_000);
    assert.equal(c.veces, 3);
    s.detener();
  });

  it('reprogramar() con null cancela lo que estaba programado', async () => {
    const { c, consultar } = consultaQueTarda();
    let ms: number | null = 1_000;
    const s = crearSondeo({ consultar, intervalo: () => ms });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(0);
    ms = null;
    s.reprogramar();
    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(c.veces, 1);
    s.detener();
  });

  it('reprogramar() adelanta un turno lento, y una ráfaga de llamadas no lo empuja hacia delante', async () => {
    const { c, consultar } = consultaQueTarda();
    let ms: number | null = 6_000;
    const s = crearSondeo({ consultar, intervalo: () => ms });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(c.veces, 1);
    // Algo se movió a los 2 s: el turno de 6 s pasa a 1.5 s desde ahora.
    await vi.advanceTimersByTimeAsync(2_000);
    ms = 1_500;
    s.reprogramar();
    // Una tecla cada 500 ms: cada una llama a reprogramar(), y aun así la
    // consulta sale a su hora.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(500);
      s.reprogramar();
    }
    assert.equal(c.veces, 2, 'salió a los 1.5 s del cambio pese a la ráfaga');
    s.detener();
  });

  it('nunca hay dos consultas a la vez, aunque la respuesta tarde más que el intervalo', async () => {
    const { c, consultar } = consultaQueTarda(5_000);
    const s = crearSondeo({ consultar, intervalo: () => 1_000 });
    s.refrescar();
    s.refrescar();
    await vi.advanceTimersByTimeAsync(30_000);
    assert.equal(c.maxEnVuelo, 1);
    s.detener();
  });

  it('un refrescar() que llega en mitad de una consulta la repite al terminar', async () => {
    const { c, consultar } = consultaQueTarda(1_000);
    const s = crearSondeo({ consultar, intervalo: () => null });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(500);
    s.refrescar(); // p. ej. recién aceptada la llamada: lo que viene en vuelo es de antes
    await vi.advanceTimersByTimeAsync(500);
    assert.equal(c.veces, 2, 'la segunda sale apenas termina la primera');
    await vi.advanceTimersByTimeAsync(10_000);
    assert.equal(c.veces, 2);
    s.detener();
  });

  it('corta una consulta colgada y sigue', async () => {
    const { c, consultar } = consultaQueTarda(60 * 60_000);
    const s = crearSondeo({ consultar, intervalo: () => 1_000, timeoutMs: 20_000 });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(20_000 + 1_000);
    assert.equal(c.veces, 2, 'abortada a los 20 s, la siguiente al segundo');
    s.detener();
  });

  it('detener() aborta la consulta en vuelo y no vuelve a preguntar', async () => {
    const { c, consultar } = consultaQueTarda(5_000);
    const s = crearSondeo({ consultar, intervalo: () => 1_000 });
    s.refrescar();
    await vi.advanceTimersByTimeAsync(100);
    s.detener();
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(c.veces, 1);
    assert.equal(c.enVuelo, 0);
  });
});
