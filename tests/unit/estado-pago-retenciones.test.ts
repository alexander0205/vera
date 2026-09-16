import { describe, it, expect } from 'vitest';
import { calcularEstadoPago, retencionesQueSaldan } from '@/lib/facturas/estado-pago-calc';

describe('estado de pago con retenciones', () => {
  it('un pago al exterior se salda con el neto: lo retenido va a la DGII', () => {
    const retenido = retencionesQueSaldan('47', 27_000);
    expect(retenido).toBe(27_000);
    expect(calcularEstadoPago({ estado: 'BORRADOR', tipoPago: 1, montoTotal: 100_000, totalPagado: 73_000, totalRetenciones: retenido })).toBe('PAGADA');
    expect(calcularEstadoPago({ estado: 'BORRADOR', tipoPago: 1, montoTotal: 100_000, totalPagado: 50_000, totalRetenciones: retenido })).toBe('PARCIAL');
    expect(calcularEstadoPago({ estado: 'BORRADOR', tipoPago: 1, montoTotal: 100_000, totalPagado: 0, totalRetenciones: retenido })).toBe('PENDIENTE');
  });

  it('compras a informales y gastos menores también descuentan lo retenido', () => {
    expect(retencionesQueSaldan('41', 3_300)).toBe(3_300);
    expect(retencionesQueSaldan('43', 500)).toBe(500);
  });

  it('las ventas siguen saldándose sobre el total', () => {
    for (const tipo of ['31', '32', '33', '44', '45', 'sin-ncf', null]) {
      expect(retencionesQueSaldan(tipo, 27_000)).toBe(0);
    }
    expect(calcularEstadoPago({ estado: 'ACEPTADO', tipoPago: 1, montoTotal: 100_000, totalPagado: 73_000, totalRetenciones: retencionesQueSaldan('31', 27_000) })).toBe('PARCIAL');
  });

  it('sin retenciones el cálculo no cambia', () => {
    expect(calcularEstadoPago({ estado: 'ACEPTADO', tipoPago: 2, montoTotal: 100_000, totalPagado: 100_000 })).toBe('PAGADA');
    expect(calcularEstadoPago({ estado: 'ANULADO', tipoPago: 1, montoTotal: 100_000, totalPagado: 0, totalRetenciones: 27_000 })).toBe('ANULADA');
  });
});
