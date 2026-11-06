import { describe, it, expect } from 'vitest';
import { esClaveCuentasPorCobrar } from '@/lib/administracion-escolar/claves-swr';

describe('esClaveCuentasPorCobrar', () => {
  it('reconoce la consulta con y sin filtros', () => {
    expect(esClaveCuentasPorCobrar('/api/cuentas-por-cobrar?clientId=7&familia=1')).toBe(true);
    expect(esClaveCuentasPorCobrar('/api/cuentas-por-cobrar')).toBe(true);
  });
  it('no toca otras claves', () => {
    expect(esClaveCuentasPorCobrar('/api/cuentas-por-cobrar-extra')).toBe(false);
    expect(esClaveCuentasPorCobrar('/api/administracion-escolar/responsables/7/periodos')).toBe(false);
    expect(esClaveCuentasPorCobrar(null)).toBe(false);
    expect(esClaveCuentasPorCobrar(['/api/cuentas-por-cobrar'])).toBe(false);
  });
});
