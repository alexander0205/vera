import { describe, expect, it } from 'vitest';
import { buildPayload } from '@/app/(dashboard)/dashboard/facturas/nueva/utils/buildPayload';

describe('buildPayload — gastos', () => {
  it('conserva comprobante recibido, categoría y fecha del gasto', () => {
    const payload = buildPayload({
      modo: 'borrador', tipoEcf: '43', fechaEmision: '2026-08-17',
      clienteSeleccionado: null, rncManual: '131123456', rncManualNombre: 'Ferretería Central', emailManual: '',
      tipoPago: 1, fechaLimitePago: '', ncfModificado: '', codigoModificacion: '',
      fechaNcfModificado: '', razonModificacion: '', origenDocumentoId: null, tipoIngresos: '',
      items: [{
        id: 1, nombreItem: 'Pintura blanca', referencia: '', descripcionItem: '', cantidadItem: 2,
        precioUnitarioItem: 500, descuentoPct: 0, tasaItbis: '0.18', indicadorBienoServicio: '1',
      }],
      retenciones: [], notas: '', terminosCondiciones: '', pieFactura: '', comentario: '',
      pagoRecibido: true, pagoFecha: '2026-08-17', pagoLineas: [{ metodo: 'efectivo', valor: '1180', cuenta: '' }],
      almacenId: null, listaPreciosId: null, vendedorId: null,
      categoriaGasto: 'Materiales y suministros', ncfProveedor: 'B0100000001', fechaGasto: '2026-08-15',
    });

    expect(payload).toMatchObject({
      tipoEcf: '43',
      rncComprador: '131123456',
      razonSocialComprador: 'Ferretería Central',
      categoriaGasto: 'Materiales y suministros',
      ncfProveedor: 'B0100000001',
      fechaGasto: '2026-08-15',
    });
  });
});
