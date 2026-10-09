import { describe, it, expect } from 'vitest';
import { cuotasVigentes, cuotasOmitidasVigentes } from '@/lib/administracion-escolar/devengar';
import type { LineaPlan } from '@/lib/administracion-escolar/plan-cobro';

/**
 * Regresión del caso #5: una mensualidad cuya cuota debía salir (su emisión ya
 * llegó) pero el plan la marca `omitida` —emitida antes de que el alumno
 * entrara— no se genera y antes desaparecía sin dejar rastro. El diagnóstico
 * del devengo tiene que verla.
 */
function linea(over: Partial<LineaPlan> = {}): LineaPlan {
  return {
    conceptoId: 3, nombre: 'CUOTA MENSUAL', tipo: 'mensualidad',
    admiteBeca: false, montoCentavos: 1000000, origen: 'grado', productId: null,
    totalCentavos: 1000000, omitidas: 0,
    reglas: {} as never,
    cuotas: [
      { cuotaId: 41, numero: 1, etiqueta: 'Agosto', mes: 8, fechaEmision: '2026-08-25', fechaVencimiento: '2026-08-30', montoCentavos: 1000000, omitida: true },
      { cuotaId: 42, numero: 2, etiqueta: 'Septiembre', mes: 9, fechaEmision: '2026-09-25', fechaVencimiento: '2026-09-30', montoCentavos: 1000000, omitida: false },
    ],
    ...over,
  };
}

describe('diagnóstico del devengo (#5)', () => {
  const plan = [linea()];
  const hasta = '2026-08-31';

  it('la cuota vigente y no omitida SÍ se devenga', () => {
    // Solo septiembre no está omitida, pero su emisión (25/09) es futura.
    expect(cuotasVigentes(plan, [3], hasta)).toHaveLength(0);
  });

  it('la cuota omitida cuya emisión ya llegó aparece en el diagnóstico', () => {
    const omitidas = cuotasOmitidasVigentes(plan, [3], hasta);
    expect(omitidas).toHaveLength(1);
    expect(omitidas[0]).toMatchObject({ conceptoId: 3, fechaEmision: '2026-08-25', mes: 8 });
  });

  it('un concepto fuera del filtro no entra en el diagnóstico', () => {
    expect(cuotasOmitidasVigentes(plan, [99], hasta)).toHaveLength(0);
  });

  it('una omitida con emisión futura todavía no cuenta como no-generada', () => {
    const futura = [linea({ cuotas: [
      { cuotaId: 50, numero: 1, etiqueta: 'Mayo', mes: 5, fechaEmision: '2027-05-25', fechaVencimiento: '2027-05-30', montoCentavos: 1000000, omitida: true },
    ] })];
    expect(cuotasOmitidasVigentes(futura, [3], hasta)).toHaveLength(0);
  });
});
