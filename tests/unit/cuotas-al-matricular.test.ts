import { describe, it, expect } from 'vitest';
import { cuotasAlMatricular, sumaCentavos } from '@/lib/administracion-escolar/cuotas-al-matricular';

/**
 * Regresión del PR #74: la revisión del lote y el «Se le carga ahora» del
 * formulario cortaban en fin de mes, y la creación en la fecha de inscripción.
 * Matriculando el 2 de septiembre con la mensualidad emitiéndose el 11, la
 * pantalla anunciaba la de septiembre como cargo de hoy y la matrícula nacía
 * sin ella.
 *
 * Los planes se arman como `armarPlanDeCobro`: una cuota emitida antes de la
 * inscripción va `omitida`, y un concepto sin calendario se emite el mismo día
 * de la inscripción.
 */
const INSCRIPCION = 1;
const MENSUALIDAD = 26;

function plan(inscripcion: string) {
  const cuota = (cuotaId: number, fechaEmision: string, montoCentavos: number) => ({
    cuotaId, fechaEmision, montoCentavos, omitida: fechaEmision < inscripcion,
  });
  return [
    { conceptoId: INSCRIPCION, cuotas: [cuota(0, inscripcion, 350000)] },
    {
      conceptoId: MENSUALIDAD,
      cuotas: [
        cuota(85, '2026-08-11', 300000),
        cuota(86, '2026-09-11', 300000),
        cuota(87, '2026-10-11', 300000),
      ],
    },
  ];
}

const ids = (lista: { cuota: { cuotaId: number } }[]) => lista.map(({ cuota }) => cuota.cuotaId);

describe('cuotasAlMatricular', () => {
  it('la mensualidad que se emite más tarde en el mismo mes NO se carga al matricular', () => {
    const { ahora, despues } = cuotasAlMatricular(plan('2026-09-02'), [INSCRIPCION, MENSUALIDAD], '2026-09-02');

    // Solo la inscripción: septiembre sale el 11 y la crea el devengo ese día.
    expect(ids(ahora)).toEqual([0]);
    expect(sumaCentavos(ahora)).toBe(350000);
    expect(ids(despues)).toEqual([86, 87]);
  });

  it('la cuota que se emite el mismo día de la inscripción sí se carga', () => {
    const { ahora, despues } = cuotasAlMatricular(plan('2026-09-11'), [INSCRIPCION, MENSUALIDAD], '2026-09-11');

    expect(ids(ahora)).toEqual([0, 86]);
    expect(ids(despues)).toEqual([87]);
  });

  it('una cuota omitida no cuenta ni ahora ni después', () => {
    const { ahora, despues } = cuotasAlMatricular(plan('2026-09-15'), [MENSUALIDAD], '2026-09-15');

    // Agosto y septiembre salieron antes de que entrara.
    expect(ids(ahora)).toEqual([]);
    expect(ids(despues)).toEqual([87]);
  });

  it('un concepto desmarcado no entra, y acepta el Set de marcados del formulario', () => {
    const { ahora, despues } = cuotasAlMatricular(plan('2026-09-02'), new Set([MENSUALIDAD]), '2026-09-02');

    expect(ids(ahora)).toEqual([]);
    expect(ids(despues)).toEqual([86, 87]);
  });

  it('sin conceptos marcados no hay nada que cargar', () => {
    expect(cuotasAlMatricular(plan('2026-09-02'), [], '2026-09-02')).toEqual({ ahora: [], despues: [] });
    expect(sumaCentavos([])).toBe(0);
  });
});
