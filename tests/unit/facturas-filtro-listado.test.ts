import { describe, it, expect } from 'vitest';
import {
  leerFiltroFacturas, filtroFacturasAParams, filtroDesdeValores, describirFiltroFacturas, estadoPagoFactura,
  type FacturaParaEstado,
} from '@/lib/facturas/filtro-listado';

const fmt = (iso: string) => iso.split('-').reverse().join('/');

describe('filtro de Facturas de venta', () => {
  it('los filterValues de la tabla llevan TODO al export (búsqueda, Con NCs, maestros)', () => {
    const f = filtroDesdeValores({ q: 'colegio', estado: 'ACEPTADO', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-31', conNcs: '1', m_3: '12', m_4: '', m_5: '20' });
    expect(f).toEqual({ q: 'colegio', estado: 'ACEPTADO', desde: '2026-10-01', hasta: '2026-10-31', conNcs: true, maestroValorIds: [12, 20] });
    expect(filtroFacturasAParams(f).toString())
      .toBe('search=colegio&estado=ACEPTADO&desde=2026-10-01&hasta=2026-10-31&conNcs=1&maestroValorId=12&maestroValorId=20');
  });

  it('ida y vuelta por la URL no pierde nada', () => {
    const f = { q: 'x', conNcs: true, maestroValorIds: [7] };
    expect(leerFiltroFacturas(filtroFacturasAParams(f))).toEqual(f);
  });

  it('estado=todos y fechas mal formadas no filtran', () => {
    expect(leerFiltroFacturas(new URLSearchParams('estado=todos&desde=ayer'))).toEqual({});
  });

  it('describe el filtro con los nombres de los maestros', () => {
    expect(describirFiltroFacturas({ estado: 'ANULADO', conNcs: true, maestroValorIds: [12] }, fmt, new Map([[12, 'Sucursal: Norte']])))
      .toBe('Todas las fechas · Estado: Anulado · Con notas de crédito/débito · Sucursal: Norte');
  });
});

describe('estado de pago de la columna «Pago»', () => {
  const base: FacturaParaEstado = {
    estado: 'ACEPTADO', tipoEcf: '31', tipoPago: 1, montoTotal: 10000, pagado: 0, fechaLimitePago: null,
  };

  it('un contado sin pago registrado queda Pendiente (antes el CSV lo daba por pagado)', () => {
    expect(estadoPagoFactura(base, '2026-10-15')).toEqual({ etiqueta: 'Pendiente', saldo: 10000 });
  });

  it('crédito vencido', () => {
    expect(estadoPagoFactura({ ...base, tipoPago: 2, fechaLimitePago: '2026-10-10' }, '2026-10-15'))
      .toEqual({ etiqueta: 'Vencida', saldo: 10000, detalle: 'hace 5d' });
  });

  it('capital pagado pero con notas de débito vivas es Parcial', () => {
    expect(estadoPagoFactura({ ...base, pagado: 10000, ndPendiente: 500, moraPendiente: 250 }, '2026-10-15'))
      .toEqual({ etiqueta: 'Parcial', saldo: 750, detalle: 'notas de débito' });
  });

  it('anulada y gratuita no tienen saldo', () => {
    expect(estadoPagoFactura({ ...base, estado: 'ANULADO' }).saldo).toBe(0);
    expect(estadoPagoFactura({ ...base, tipoPago: 3 }).etiqueta).toBe('Gratuita');
  });
});
