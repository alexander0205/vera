import { describe, it, expect } from 'vitest';
import {
  leerFiltroGastos, filtroGastosAParams, hayFiltro, mesDelRango, rangoDeMes, clavesDeCategoria,
} from '@/lib/compras/filtro-gastos';

describe('filtro de Gastos en la URL', () => {
  it('lee lo válido e ignora lo que no entiende', () => {
    const f = leerFiltroGastos({ desde: '2026-10-01', hasta: 'ayer', q: '  edesur ', estado: 'pagado', tipo: 'e99', categoria: 'Alquileres' });
    expect(f).toEqual({ desde: '2026-10-01', q: 'edesur', estado: 'pagado', categoria: 'Alquileres' });
  });

  it('traduce el ?mes= viejo a su rango, con el último día real del mes', () => {
    expect(leerFiltroGastos({ mes: '2026-02' })).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(leerFiltroGastos({ mes: '2028-02' }).hasta).toBe('2028-02-29');
  });

  it('las fechas explícitas mandan sobre el mes', () => {
    expect(leerFiltroGastos({ mes: '2026-02', desde: '2026-05-03' })).toEqual({ desde: '2026-05-03' });
  });

  it('ida y vuelta por URLSearchParams no pierde nada', () => {
    const f = { desde: '2026-09-01', hasta: '2026-09-30', q: 'claro', categoria: '-', estado: 'por_pagar' as const, tipo: 'proveedor' as const };
    expect(leerFiltroGastos(filtroGastosAParams(f))).toEqual(f);
  });

  it('sin nada no hay filtro', () => {
    expect(hayFiltro(leerFiltroGastos({}))).toBe(false);
    expect(filtroGastosAParams({}).toString()).toBe('');
  });

  it('reconoce cuando el rango es un mes exacto', () => {
    expect(mesDelRango(rangoDeMes('2026-09'))).toBe('2026-09');
    expect(mesDelRango({ desde: '2026-09-01', hasta: '2026-09-29' })).toBeNull();
    expect(mesDelRango({ desde: '2026-09-01' })).toBeNull();
  });

  it('una etiqueta del catálogo da su clave; un texto suelto, ninguna', () => {
    expect(clavesDeCategoria('Alquileres')).toEqual(['alquiler']);
    expect(clavesDeCategoria('Otro gasto')).toEqual([]);
  });
});
