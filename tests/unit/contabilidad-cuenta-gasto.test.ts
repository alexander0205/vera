import { describe, it, expect } from 'vitest';
import { elegirCuentaGasto, type CuentaCatalogo } from '@/lib/contabilidad/cuenta-gasto';

const cuenta = (id: number, codigo: string): CuentaCatalogo => ({ id, codigo, nombre: `Cuenta ${codigo}` });
const catalogo = (...cs: CuentaCatalogo[]) => ({
  imputables: new Map(cs.map((c) => [c.id, c])),
  porCodigo:  new Map(cs.map((c) => [c.codigo, c])),
});

// El catálogo base de una empresa cualquiera: la de materiales, la general y una
// subcuenta que el contador creó aparte.
const MATERIALES = cuenta(1, '6114');
const GENERAL    = cuenta(2, '6101');
const UTILES     = cuenta(3, '6114.02');
const base       = catalogo(MATERIALES, GENERAL, UTILES);

describe('a qué cuenta va una línea de gasto', () => {
  it('sin configurar nada, la del código de la categoría', () => {
    const r = elegirCuentaGasto({ categoria: 'materiales', ...base });
    expect(r).toEqual({ cuenta: MATERIALES, origen: 'catalogo' });
  });

  it('la que la empresa configuró para la categoría manda sobre esa', () => {
    const r = elegirCuentaGasto({ categoria: 'materiales', configuradas: new Map([['materiales', UTILES.id]]), ...base });
    expect(r).toEqual({ cuenta: UTILES, origen: 'configurada' });
  });

  it('la elegida al registrar el comprobante manda sobre todo', () => {
    const r = elegirCuentaGasto({
      categoria: 'materiales', cuentaLineaId: GENERAL.id,
      configuradas: new Map([['materiales', UTILES.id]]), ...base,
    });
    expect(r).toEqual({ cuenta: GENERAL, origen: 'linea' });
  });

  it('la configuración de otra categoría no se mete en esta', () => {
    const r = elegirCuentaGasto({ categoria: 'materiales', configuradas: new Map([['honorarios', UTILES.id]]), ...base });
    expect(r).toEqual({ cuenta: MATERIALES, origen: 'catalogo' });
  });

  it('una cuenta desactivada o de agrupación se salta: el registro no se rompe', () => {
    // 99 no está entre las imputables (la desactivaron o es cuenta padre).
    expect(elegirCuentaGasto({ categoria: 'materiales', cuentaLineaId: 99, ...base }))
      .toEqual({ cuenta: MATERIALES, origen: 'catalogo' });
    expect(elegirCuentaGasto({ categoria: 'materiales', configuradas: new Map([['materiales', 99]]), ...base }))
      .toEqual({ cuenta: MATERIALES, origen: 'catalogo' });
  });

  it('si la empresa no tiene la cuenta de la categoría, la general de su configuración', () => {
    const sinMateriales = catalogo(GENERAL, UTILES);
    expect(elegirCuentaGasto({ categoria: 'materiales', general: UTILES.id, ...sinMateriales }))
      .toEqual({ cuenta: UTILES, origen: 'general' });
  });

  it('y sin configurar ninguna, la 6101 del catálogo base', () => {
    const sinMateriales = catalogo(GENERAL, UTILES);
    expect(elegirCuentaGasto({ categoria: 'materiales', ...sinMateriales }))
      .toEqual({ cuenta: GENERAL, origen: 'general' });
  });

  it('una categoría que no existe cae en la general, no en cualquier cuenta', () => {
    expect(elegirCuentaGasto({ categoria: 'inventada', ...base })).toEqual({ cuenta: GENERAL, origen: 'general' });
    expect(elegirCuentaGasto({ categoria: null, ...base })).toEqual({ cuenta: GENERAL, origen: 'general' });
  });

  it('sin una sola cuenta usable no se inventa ninguna', () => {
    expect(elegirCuentaGasto({ categoria: 'materiales', ...catalogo() })).toBeNull();
  });
});
