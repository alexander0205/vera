/**
 * El monto propio es la mensualidad pactada, no un precio para todo lo que
 * admite beca: en Mi Casita «Sala de tarea» también admite beca y salía al
 * mismo monto que la colegiatura.
 */
import { describe, expect, it } from 'vitest';
import { becaAplica } from '@/lib/administracion-escolar/tarifas';

const COLEGIATURA = 26;
const SALA = 29;

describe('becaAplica', () => {
  it('el monto propio solo va a la generación de la matrícula', () => {
    const ctx = { becaTipo: 'monto', conceptoMensualidadId: COLEGIATURA };
    expect(becaAplica(ctx, COLEGIATURA, true)).toBe(true);
    expect(becaAplica(ctx, SALA, true)).toBe(false);
  });

  it('el porcentaje descuenta en todo lo que admite beca', () => {
    const ctx = { becaTipo: 'porcentaje', conceptoMensualidadId: COLEGIATURA };
    expect(becaAplica(ctx, SALA, true)).toBe(true);
  });

  it('sin generación conocida se comporta como antes', () => {
    expect(becaAplica({ becaTipo: 'monto', conceptoMensualidadId: null }, SALA, true)).toBe(true);
  });

  it('nunca toca un concepto que no admite beca', () => {
    expect(becaAplica({ becaTipo: 'monto', conceptoMensualidadId: COLEGIATURA }, COLEGIATURA, false)).toBe(false);
  });
});
