import { describe, expect, it } from 'vitest';
import { buildPayload } from '@/app/(dashboard)/dashboard/facturas/nueva/utils/buildPayload';

function payload(pagoLineas: Array<{ metodo: string; valor: string; cuenta?: string; notaCreditoId?: number | null }>) {
  return buildPayload({
    modo: 'emitir', tipoEcf: '32', fechaEmision: '2026-11-06',
    clienteSeleccionado: null, rncManual: '', rncManualNombre: '', emailManual: '',
    tipoPago: 1, fechaLimitePago: '', ncfModificado: '', codigoModificacion: '',
    fechaNcfModificado: '', razonModificacion: '', origenDocumentoId: null, tipoIngresos: '',
    items: [{
      id: 1, nombreItem: 'Servicio', referencia: '', descripcionItem: '', cantidadItem: 1,
      precioUnitarioItem: 1000, descuentoPct: 0, tasaItbis: '0', indicadorBienoServicio: '2',
    }],
    retenciones: [], notas: '', terminosCondiciones: '', pieFactura: '', comentario: '',
    pagoRecibido: true, pagoFecha: '2026-11-06',
    pagoLineas: pagoLineas.map(l => ({ cuenta: '', ...l })),
    almacenId: null, listaPreciosId: null, vendedorId: null,
  } as never);
}

describe('buildPayload — pago con nota de crédito', () => {
  it('una sola línea nota_credito viaja en pagos con su notaCreditoId', () => {
    const p = payload([{ metodo: 'nota_credito', valor: '400', notaCreditoId: 77 }]);
    expect(p.pagos).toEqual([expect.objectContaining({ metodo: 'nota_credito', valor: 400, notaCreditoId: 77 })]);
    expect(p.pagoMetodo).toBeUndefined();
  });
  it('NC más efectivo conserva la NC en su línea', () => {
    const p = payload([
      { metodo: 'nota_credito', valor: '300', notaCreditoId: 77 },
      { metodo: 'efectivo', valor: '700' },
    ]);
    expect(p.pagos).toHaveLength(2);
    expect(p.pagos?.[0]).toMatchObject({ metodo: 'nota_credito', notaCreditoId: 77 });
  });
  it('una sola línea de efectivo sigue siendo pago simple', () => {
    const p = payload([{ metodo: 'efectivo', valor: '1000' }]);
    expect(p.pagos).toBeUndefined();
    expect(p.pagoMetodo).toBe('efectivo');
  });
});
