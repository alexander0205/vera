import { describe, it, expect } from 'vitest';
import { etiquetaFacturaOrigen } from '@/lib/facturas/etiqueta-origen';

describe('etiquetaFacturaOrigen', () => {
  it('prefiere el e-NCF real al código interno', () => {
    expect(etiquetaFacturaOrigen({ codigo: 'FA-2026-0001', encf: 'E310000000001' })).toBe('E310000000001');
  });
  it('sin e-NCF real usa el código interno', () => {
    expect(etiquetaFacturaOrigen({ codigo: 'FA-2026-0001', encf: 'BOR-AB12CD34' })).toBe('FA-2026-0001');
    expect(etiquetaFacturaOrigen({ codigo: 'FA-2026-0001', encf: '' })).toBe('FA-2026-0001');
    expect(etiquetaFacturaOrigen({ codigo: 'FA-2026-0001', encf: null })).toBe('FA-2026-0001');
  });
  it('sin código cae al marcador', () => {
    expect(etiquetaFacturaOrigen({ codigo: null, encf: 'BOR-AB12CD34' })).toBe('BOR-AB12CD34');
  });
});
