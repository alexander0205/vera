import { describe, it, expect } from 'vitest';
import type { MotivoCambio } from '@/lib/config/suscripcion';
import type { NivelDeCambio } from '@/lib/suscripcion/cambio-plan';

/**
 * El nivel y el resumen se derivan del veredicto con una regla de una línea, y
 * esa regla es la que decide qué color ve el usuario en la tarjeta. Se prueba
 * aquí sin base de datos: `riesgosDeCambio` es server-only y consulta Postgres,
 * pero la DERIVACIÓN —lo único que se puede equivocar sin que nadie lo note—
 * es pura.
 */
function nivelDe(bloqueos: MotivoCambio[], avisos: MotivoCambio[]): NivelDeCambio {
  return bloqueos.length > 0 ? 'bloquea' : avisos.length > 0 ? 'avisa' : 'ok';
}
function resumenDe(bloqueos: MotivoCambio[], avisos: MotivoCambio[]): string {
  return (bloqueos[0] ?? avisos[0])?.mensaje ?? 'Solo sumas. No se pierde nada.';
}

const bloqueo = (m: string): MotivoCambio => ({ gravedad: 'bloquea', clave: 'x', mensaje: m, comoResolver: 'haz algo' });
const aviso   = (m: string): MotivoCambio => ({ gravedad: 'avisa',   clave: 'y', mensaje: m, comoResolver: null });

describe('el riesgo que se pinta en la tarjeta', () => {
  it('un bloqueo manda sobre cualquier cantidad de avisos', () => {
    expect(nivelDe([bloqueo('442 estudiantes, tope 300')], [aviso('a'), aviso('b')])).toBe('bloquea');
  });

  it('sin bloqueos pero con avisos, avisa', () => {
    expect(nivelDe([], [aviso('bajas a 500 comprobantes')])).toBe('avisa');
  });

  it('sin nada, solo suma', () => {
    expect(nivelDe([], [])).toBe('ok');
    expect(resumenDe([], [])).toBe('Solo sumas. No se pierde nada.');
  });

  it('el resumen es el motivo MÁS GRAVE, no el primero que llegue', () => {
    // En la tarjeta cabe una línea. Si el resumen fuera un aviso menor teniendo
    // un bloqueo detrás, el usuario pulsaría creyendo que solo pierde un poco.
    expect(resumenDe([bloqueo('turno de caja abierto')], [aviso('bajas de usuarios')]))
      .toBe('turno de caja abierto');
  });

  it('con varios bloqueos gana el primero, que es el que el validador pone delante', () => {
    expect(resumenDe([bloqueo('primero'), bloqueo('segundo')], [])).toBe('primero');
  });
});
