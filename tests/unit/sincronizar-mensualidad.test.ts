import { describe, expect, it } from 'vitest';
import {
  planificarMensualidades, type CargoExistente, type CuotaObjetivo,
} from '@/lib/administracion-escolar/sincronizar-mensualidad';

const NUEVO = 23;
const VIEJO = 21;

function cuota(mes: number, anio = mes >= 8 ? 2026 : 2027, cuotaId = 50 + mes): CuotaObjetivo {
  return { cuotaId, mes, anio, montoCentavos: 800_000, fechaVencimiento: `${anio}-${String(mes).padStart(2, '0')}-10` };
}

function cargo(p: Partial<CargoExistente> & { id: number; mes: number }): CargoExistente {
  return {
    conceptoId: VIEJO, cuotaId: null, anio: p.mes >= 8 ? 2026 : 2027,
    montoCentavos: 600_000, saldoCentavos: 600_000, estado: 'pendiente',
    ecfDocumentId: null, facturaCodigo: null, tienePagos: false,
    ...p,
  };
}

describe('planificarMensualidades', () => {
  it('crea las cuotas atadas al calendario cuando no hay nada', () => {
    const plan = planificarMensualidades({ conceptoId: NUEVO, objetivo: [cuota(9), cuota(10)], existentes: [] });
    expect(plan.crear.map((c) => c.cuotaId)).toEqual([59, 60]);
    expect(plan.crear[0].fechaVencimiento).toBe('2026-09-10');
    expect(plan.anular).toEqual([]);
    expect(plan.bloqueados).toEqual([]);
  });

  it('caso Keiry: el mes facturado con la generación vieja no se duplica y se avisa', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(9), cuota(10)],
      existentes: [cargo({ id: 1, mes: 9, ecfDocumentId: 506, facturaCodigo: '000506' })],
    });
    expect(plan.crear.map((c) => c.mes)).toEqual([10]);
    expect(plan.anular).toEqual([]);
    expect(plan.bloqueados).toEqual([{
      mes: 9, anio: 2026, cargoId: 1, motivo: 'facturado',
      ecfDocumentId: 506, facturaCodigo: '000506', facturaAnulable: true,
    }]);
    // La cuota nueva de septiembre queda marcada: ni el devengo ni el
    // «Previsto» la vuelven a sacar.
    expect(plan.marcar.map((c) => c.cuotaId)).toEqual([59]);
  });

  it('no ofrece anular una factura que ya tiene cobros', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(9)],
      existentes: [cargo({ id: 1, mes: 9, ecfDocumentId: 506, facturaCodigo: '000506', facturaConPagos: true })],
    });
    expect(plan.bloqueados[0].facturaAnulable).toBe(false);
  });

  it('con la factura vieja ya anulada, el mes pasa a la mensualidad nueva', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(9)],
      existentes: [cargo({ id: 1, mes: 9, ecfDocumentId: 506, facturaAnulada: true, saldoCentavos: 0 })],
    });
    expect(plan.bloqueados).toEqual([]);
    expect(plan.marcar).toEqual([]);
    expect(plan.anular).toEqual([1]);
    expect(plan.crear.map((c) => c.cuotaId)).toEqual([59]);
  });

  it('anula el cargo de la generación vieja que nadie tocó y crea el nuevo', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(10)],
      existentes: [cargo({ id: 7, mes: 10 })],
    });
    expect(plan.anular).toEqual([7]);
    expect(plan.crear.map((c) => c.mes)).toEqual([10]);
  });

  it('un cargo viejo con pagos tampoco se reemplaza', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(10)],
      existentes: [cargo({ id: 7, mes: 10, saldoCentavos: 100_000, tienePagos: true })],
    });
    expect(plan.crear).toEqual([]);
    expect(plan.anular).toEqual([]);
    expect(plan.bloqueados[0].motivo).toBe('con-pagos');
  });

  it('ata a su cuota el cargo suelto del mismo concepto y le pone el precio nuevo', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(11)],
      existentes: [cargo({ id: 3, mes: 11, conceptoId: NUEVO })],
    });
    expect(plan.crear).toEqual([]);
    expect(plan.actualizar).toEqual([
      { id: 3, cuotaId: 61, fechaVencimiento: '2026-11-10', montoCentavos: 800_000 },
    ]);
  });

  it('no reprecia un cargo del mismo concepto ya facturado', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(11)],
      existentes: [cargo({ id: 3, mes: 11, conceptoId: NUEVO, cuotaId: 61, ecfDocumentId: 9 })],
    });
    expect(plan.actualizar).toEqual([]);
    expect(plan.crear).toEqual([]);
  });

  it('es idempotente: con todo al día no hace nada', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(9)],
      existentes: [cargo({ id: 4, mes: 9, conceptoId: NUEVO, cuotaId: 59, montoCentavos: 800_000, saldoCentavos: 800_000 })],
    });
    expect(plan).toEqual({ crear: [], anular: [], actualizar: [], bloqueados: [], marcar: [] });
  });

  it('ignora cargos anulados', () => {
    const plan = planificarMensualidades({
      conceptoId: NUEVO,
      objetivo: [cuota(9)],
      existentes: [cargo({ id: 5, mes: 9, estado: 'anulado', ecfDocumentId: 1 })],
    });
    expect(plan.crear.map((c) => c.mes)).toEqual([9]);
    expect(plan.bloqueados).toEqual([]);
  });
});
