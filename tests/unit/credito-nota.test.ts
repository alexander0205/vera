import { describe, it, expect } from 'vitest';
import { calcularCreditoNotaCents } from '@/lib/facturas/credito-nota';

describe('calcularCreditoNotaCents', () => {
  it('sin factura de origen acredita el total de la nota', () => {
    expect(calcularCreditoNotaCents({ montoNcCents: 5000, pagadoOrigenCents: null })).toBe(5000);
  });
  it('con origen se capa a lo pagado', () => {
    expect(calcularCreditoNotaCents({ montoNcCents: 5000, pagadoOrigenCents: 3000 })).toBe(3000);
  });
  it('si lo pagado supera la nota, acredita la nota completa', () => {
    expect(calcularCreditoNotaCents({ montoNcCents: 5000, pagadoOrigenCents: 9000 })).toBe(5000);
  });
  it('origen sin pagos genera 0 pero no null (modelo nuevo)', () => {
    expect(calcularCreditoNotaCents({ montoNcCents: 5000, pagadoOrigenCents: 0 })).toBe(0);
  });
});
