import { describe, expect, it } from 'vitest';
import { AUTO_CONSULTA_MAX_LISTA, AUTO_CONSULTA_MIN_MS, idsParaConsultar } from '@/lib/ecf-api/auto-consulta';

const T0 = 1_000_000_000;

describe('idsParaConsultar', () => {
  it('sin consultas previas toca todos, hasta el máximo de 5', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7];
    expect(idsParaConsultar(ids, {}, T0)).toEqual([1, 2, 3, 4, 5]);
    expect(AUTO_CONSULTA_MAX_LISTA).toBe(5);
  });

  it('dentro de los 2 minutos no vuelve a consultar el mismo documento', () => {
    const ultimas = { '1': T0 };
    expect(idsParaConsultar([1], ultimas, T0 + AUTO_CONSULTA_MIN_MS - 1)).toEqual([]);
  });

  it('a los 2 minutos exactos ya toca otra vez', () => {
    const ultimas = { '1': T0 };
    expect(idsParaConsultar([1], ultimas, T0 + AUTO_CONSULTA_MIN_MS)).toEqual([1]);
  });

  it('los consultados hace poco no gastan cupo de los 5', () => {
    const ultimas = { '1': T0, '2': T0 };
    expect(idsParaConsultar([1, 2, 3, 4, 5, 6, 7], ultimas, T0 + 1000)).toEqual([3, 4, 5, 6, 7]);
  });

  it('un máximo de 1 sirve para el detalle', () => {
    expect(idsParaConsultar([9], {}, T0, 1)).toEqual([9]);
    expect(idsParaConsultar([9], { '9': T0 }, T0 + 5000, 1)).toEqual([]);
  });
});
