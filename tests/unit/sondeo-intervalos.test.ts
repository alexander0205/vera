import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  CONVERSACION_VIVA_MS,
  esConversacionViva,
  intervaloChat,
  intervaloLlamadas,
  type EstadoChat,
  type EstadoLlamadas,
} from '@/lib/sondeo/intervalos';

/**
 * El ritmo de los sondeos del soporte. Hasta ahora eran 3 s (llamadas) y 10 s
 * (chat cerrado) fijos en cada pestaña abierta, con alguien delante o no; el
 * 2026-09-17 fueron el 74 % de todas las peticiones a producción.
 */

const llamadas = (e: Partial<EstadoLlamadas>): number | null =>
  intervaloLlamadas({ presente: true, conversacionViva: false, llamadaEnCurso: false, sinSesion: false, ...e });

describe('intervaloLlamadas', () => {
  it('una invitación (dura 60 s) se ve muy por debajo de su caducidad con alguien delante', () => {
    for (const conversacionViva of [true, false]) {
      const ms = llamadas({ presente: true, conversacionViva });
      assert.ok(ms != null && ms <= 15_000, `conversacionViva=${conversacionViva}: ${ms}`);
    }
  });

  it('en plena llamada sigue a 3 s aunque la pestaña esté escondida', () => {
    assert.equal(llamadas({ llamadaEnCurso: true, presente: false }), 3_000);
    assert.equal(llamadas({ llamadaEnCurso: true, presente: true }), 3_000);
  });

  it('con una conversación viva se sigue sin nadie delante, más lento, para que suene el tono', () => {
    assert.equal(llamadas({ conversacionViva: true, presente: true }), 5_000);
    assert.equal(llamadas({ conversacionViva: true, presente: false }), 20_000);
  });

  it('sin conversación y sin nadie delante no se pregunta: es lo que deja dormir a Neon', () => {
    assert.equal(llamadas({ presente: false }), null);
  });

  it('tras un 4xx no se pregunta más, ni siquiera con una llamada en curso', () => {
    assert.equal(llamadas({ sinSesion: true }), null);
    assert.equal(llamadas({ sinSesion: true, llamadaEnCurso: true, conversacionViva: true }), null);
  });
});

const chat = (e: Partial<EstadoChat>): number | null =>
  intervaloChat({
    abierto: true, visible: true, presente: true, conversacionViva: true, msDesdeUltimoCambio: 0, ...e,
  });

describe('intervaloChat', () => {
  it('cerrado no pregunta: la llamada la vigila el provider', () => {
    assert.equal(chat({ abierto: false }), null);
  });

  it('con la pestaña escondida no pregunta, aunque la conversación esté viva', () => {
    assert.equal(chat({ visible: false, presente: false }), null);
  });

  it('visible pero sin nadie delante: sigue solo si la conversación está viva', () => {
    assert.notEqual(chat({ presente: false, conversacionViva: true }), null);
    assert.equal(chat({ presente: false, conversacionViva: false }), null);
  });

  it('1.5 s con movimiento y se va frenando si no pasa nada', () => {
    assert.equal(chat({ msDesdeUltimoCambio: 0 }), 1_500);
    assert.equal(chat({ msDesdeUltimoCambio: 29_999 }), 1_500);
    assert.equal(chat({ msDesdeUltimoCambio: 30_000 }), 3_000);
    assert.equal(chat({ msDesdeUltimoCambio: 2 * 60_000 }), 6_000);
    assert.equal(chat({ msDesdeUltimoCambio: 8 * 3_600_000 }), 6_000);
  });
});

describe('esConversacionViva', () => {
  const ahora = Date.UTC(2026, 8, 18, 14, 0, 0);

  it('un ticket abierto o en espera con mensajes recientes está vivo', () => {
    assert.equal(esConversacionViva('abierto', ahora - 60_000, ahora), true);
    assert.equal(esConversacionViva('esperando', ahora - 60_000, ahora), true);
  });

  it('cerrado, sin ticket o dormido más de 30 min, no', () => {
    assert.equal(esConversacionViva('cerrado', ahora - 60_000, ahora), false);
    assert.equal(esConversacionViva(null, null, ahora), false);
    assert.equal(esConversacionViva('abierto', ahora - CONVERSACION_VIVA_MS, ahora), false);
  });
});
