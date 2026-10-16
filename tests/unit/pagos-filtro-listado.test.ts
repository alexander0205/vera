import { describe, it, expect } from 'vitest';
import {
  filtrarPagos, agruparPagos, leerFiltroPagos, filtroPagosAParams, describirFiltroPagos,
  type PagoFiltrable,
} from '@/lib/pagos/filtro-listado';

const pago = (o: Partial<PagoFiltrable>): PagoFiltrable => ({
  cliente: 'Juan Pérez', rncComprador: null, referencia: null, docCodigo: 'FAC-1', docEncf: null, docId: 1,
  metodo: 'efectivo', origen: 'facturacion', enviadoDgii: false, fechaPago: '2026-10-01', productos: [], ...o,
});

const fmt = (iso: string) => iso.split('-').reverse().join('/');

describe('filtro de Pagos recibidos', () => {
  const pagos = [
    pago({ docId: 1, docCodigo: 'FAC-1', metodo: 'efectivo', origen: 'pos', productos: [{ servicio: false }] }),
    pago({ docId: 2, docCodigo: 'FAC-2', cliente: null, metodo: 'Transferencia', enviadoDgii: true, docEncf: 'E310000000012', productos: [{ servicio: true }] }),
    pago({ docId: 1, docCodigo: 'FAC-1', metodo: 'tarjeta', referencia: 'AUT-77', fechaPago: '2026-10-02' }),
  ];

  it('busca en cliente (consumidor final incluido), referencia y NCF', () => {
    expect(filtrarPagos(pagos, { q: 'consumidor' })).toHaveLength(1);
    expect(filtrarPagos(pagos, { q: 'aut-77' })).toHaveLength(1);
    expect(filtrarPagos(pagos, { q: 'E3100' })).toHaveLength(1);
  });

  it('método sin distinguir mayúsculas, origen, tipo de venta y DGII', () => {
    expect(filtrarPagos(pagos, { metodo: 'transferencia' })).toHaveLength(1);
    expect(filtrarPagos(pagos, { origen: 'pos' })).toHaveLength(1);
    expect(filtrarPagos(pagos, { tipoVenta: 'servicio' })).toHaveLength(1);
    expect(filtrarPagos(pagos, { dgii: 'no' })).toHaveLength(2);
  });

  it('agrupa por factura conservando el orden de aparición', () => {
    const g = agruparPagos(pagos, 'factura', fmt);
    expect(g.map(x => [x.clave, x.pagos.length])).toEqual([['FAC-1', 2], ['FAC-2', 1]]);
    expect(agruparPagos(pagos, undefined, fmt)).toEqual([{ clave: null, pagos }]);
  });

  it('los filterValues de la pantalla y la URL del export dan el mismo filtro', () => {
    const deLaPantalla = leerFiltroPagos({ q: ' juan ', metodo: 'efectivo', origen: '', tipoVenta: '', dgii: 'enviado', agrupar: 'metodo', desde: '2026-10-01', hasta: '2026-10-31' });
    expect(leerFiltroPagos(filtroPagosAParams(deLaPantalla))).toEqual(deLaPantalla);
    expect(deLaPantalla).toEqual({ q: 'juan', metodo: 'efectivo', dgii: 'enviado', agrupar: 'metodo', desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('ignora valores que no entiende', () => {
    expect(leerFiltroPagos({ origen: 'web', dgii: 'si', agrupar: 'mes', desde: 'ayer' })).toEqual({});
  });

  it('describe el filtro para el encabezado del archivo', () => {
    expect(describirFiltroPagos({ desde: '2026-10-01', hasta: '2026-10-31', origen: 'pos' }, fmt))
      .toBe('Del 01/10/2026 al 31/10/2026 · Origen: Punto de venta');
  });
});
