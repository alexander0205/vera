import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';

/**
 * «¿Hay alguien delante?» decide si los sondeos del soporte y de la caja
 * preguntan o se quedan quietos. Sin DOM en estas pruebas: basta un
 * `document` con `visibilityState` y un `window` que reciba eventos.
 */

type Presencia = typeof import('@/lib/sondeo/presencia');

class DocumentoFalso extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  esconder() { this.visibilityState = 'hidden'; this.dispatchEvent(new Event('visibilitychange')); }
  mostrar() { this.visibilityState = 'visible'; this.dispatchEvent(new Event('visibilitychange')); }
}

let doc: DocumentoFalso;
let win: EventTarget;
let presencia: Presencia;

beforeEach(async () => {
  vi.useFakeTimers();
  doc = new DocumentoFalso();
  win = new EventTarget();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  // El módulo guarda su estado a nivel de módulo: uno nuevo por prueba.
  vi.resetModules();
  presencia = await import('@/lib/sondeo/presencia');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('presencia', () => {
  it('pasa a ausente a los 10 min sin actividad, y vuelve con el primer movimiento', async () => {
    const avisos: boolean[] = [];
    const quitar = presencia.suscribirPresencia(() => avisos.push(presencia.estaPresente()));
    assert.equal(presencia.estaPresente(), true);

    await vi.advanceTimersByTimeAsync(presencia.INACTIVIDAD_MS - 1_000);
    assert.equal(presencia.estaPresente(), true);
    await vi.advanceTimersByTimeAsync(2_000);
    assert.equal(presencia.estaPresente(), false);

    win.dispatchEvent(new Event('pointermove'));
    assert.equal(presencia.estaPresente(), true);
    assert.deepEqual(avisos, [false, true]);
    quitar();
  });

  it('la actividad aplaza la inactividad aunque no rearme el temporizador en cada evento', async () => {
    const quitar = presencia.suscribirPresencia(() => {});
    // Alguien trabajando: una tecla por minuto durante media hora.
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
      win.dispatchEvent(new Event('keydown'));
    }
    assert.equal(presencia.estaPresente(), true);
    // Y a los 10 min de la última, ausente.
    await vi.advanceTimersByTimeAsync(presencia.INACTIVIDAD_MS + 1_000);
    assert.equal(presencia.estaPresente(), false);
    quitar();
  });

  it('esconder la pestaña es ausencia inmediata; mostrarla, presencia inmediata', () => {
    const avisos: boolean[] = [];
    const quitar = presencia.suscribirPresencia(() => avisos.push(presencia.estaPresente()));
    doc.esconder();
    assert.equal(presencia.estaPresente(), false);
    assert.equal(presencia.pestanaVisible(), false);
    doc.mostrar();
    assert.equal(presencia.estaPresente(), true);
    assert.deepEqual(avisos, [false, true]);
    quitar();
  });

  it('volver a la pestaña tras horas fuera cuenta como actividad', async () => {
    const quitar = presencia.suscribirPresencia(() => {});
    doc.esconder();
    await vi.advanceTimersByTimeAsync(8 * 3_600_000);
    doc.mostrar();
    assert.equal(presencia.estaPresente(), true);
    quitar();
  });

  it('sin suscriptores no escucha nada', async () => {
    const avisos: boolean[] = [];
    const quitar = presencia.suscribirPresencia(() => avisos.push(presencia.estaPresente()));
    quitar();
    doc.esconder();
    doc.mostrar();
    await vi.advanceTimersByTimeAsync(presencia.INACTIVIDAD_MS * 3);
    assert.deepEqual(avisos, []);
  });
});
