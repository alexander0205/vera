import { describe, expect, it } from 'vitest';
import { estadoMes } from '@/lib/administracion-escolar/estado-mes-ficha';

describe('estado del mes en la ficha escolar', () => {
  it('muestra sin facturar aunque la fecha del cargo ya pasó', () => {
    expect(estadoMes([{
      estado: 'vencido', fechaVencimiento: '2026-09-05', ecfDocumentId: null,
    }], '2026-10-21')).toBe('sin-facturar');
  });

  it('marca vencido solo si existe factura con saldo y vencimiento pasado', () => {
    expect(estadoMes([
      { estado: 'pendiente', fechaVencimiento: '2026-09-05', ecfDocumentId: null },
      { estado: 'pendiente', fechaVencimiento: '2026-10-20', ecfDocumentId: 42 },
    ], '2026-10-21')).toBe('vencido');
    expect(estadoMes([{
      estado: 'pendiente', fechaVencimiento: '2026-10-21', ecfDocumentId: 42,
    }], '2026-10-21')).toBe('pendiente');
  });
});
