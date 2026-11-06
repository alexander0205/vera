import { describe, expect, it } from 'vitest';
import { estadoZeroDesdeEcfApi } from '@/lib/ecf-api/estado-dgii';

describe('estadoZeroDesdeEcfApi', () => {
  it('ACEPTADO y ACEPTADO_CONDICIONAL pasan tal cual', () => {
    expect(estadoZeroDesdeEcfApi('ACEPTADO', 'EN_PROCESO')).toBe('ACEPTADO');
    expect(estadoZeroDesdeEcfApi('ACEPTADO_CONDICIONAL', 'EN_PROCESO')).toBe('ACEPTADO_CONDICIONAL');
  });

  it('acepta mayúsculas/minúsculas y espacios del texto de la DGII', () => {
    expect(estadoZeroDesdeEcfApi('Aceptado', 'EN_PROCESO')).toBe('ACEPTADO');
    expect(estadoZeroDesdeEcfApi('Aceptado Condicional', 'EN_PROCESO')).toBe('ACEPTADO_CONDICIONAL');
    expect(estadoZeroDesdeEcfApi(' rechazado ', 'EN_PROCESO')).toBe('RECHAZADO');
  });

  it('ENVIADO y PENDIENTE siguen en proceso; ERROR cuenta como rechazado', () => {
    expect(estadoZeroDesdeEcfApi('ENVIADO', 'EN_PROCESO')).toBe('EN_PROCESO');
    expect(estadoZeroDesdeEcfApi('PENDIENTE', 'EN_PROCESO')).toBe('EN_PROCESO');
    expect(estadoZeroDesdeEcfApi('ERROR', 'EN_PROCESO')).toBe('RECHAZADO');
  });

  it('un estado desconocido o vacío deja el actual', () => {
    expect(estadoZeroDesdeEcfApi('LOQUESEA', 'EN_PROCESO')).toBe('EN_PROCESO');
    expect(estadoZeroDesdeEcfApi(undefined, 'ACEPTADO')).toBe('ACEPTADO');
    expect(estadoZeroDesdeEcfApi(null, 'RECHAZADO')).toBe('RECHAZADO');
  });
});
