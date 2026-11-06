import { describe, expect, it } from 'vitest';
import type { Producto } from '@/app/(dashboard)/dashboard/facturas/nueva/utils/types';
import {
  claveOpcionProducto,
  sinOpcionesRepetidas,
} from '@/app/(dashboard)/dashboard/facturas/nueva/utils/opcionesProducto';

const base = {
  descripcion: null, precioDOP: 100, tasaItbis: 'exento', tipo: 'servicio', referencia: null,
  stockActual: 0, stockMinimo: 0, controlaInventario: false, permiteVentaSinStock: true,
} as const;

const producto = (id: number): Producto => ({ ...base, id, nombre: `Producto ${id}` });
const cuota = (id: number, clave: string, cargoId = 0): Producto => ({
  ...base, id, nombre: `Cuota ${clave}`,
  cuotaEscolar: { cargoId, estudianteId: 1, clave, mes: 1, anio: 2026, saldoCentavos: 0, productoId: null, contexto: '' },
});

describe('claves de las opciones del buscador de productos', () => {
  it('un producto y una cuota con el mismo id no comparten clave', () => {
    const lista = [producto(5), cuota(5, 'a:1')];
    const claves = lista.map(claveOpcionProducto);
    expect(new Set(claves).size).toBe(2);
    expect(claves[0]).toBe('prod:5');
    expect(claves[1]).toBe('cuota:a:1');
  });

  it('dos cuotas con el mismo id inventado se distinguen por su clave', () => {
    const lista = [cuota(-7, 'x:1'), cuota(-7, 'x:2')];
    expect(sinOpcionesRepetidas(lista)).toHaveLength(2);
  });

  it('quita lo repetido de verdad y conserva el orden', () => {
    const lista = [cuota(-1, 'k'), producto(2), producto(2), cuota(-1, 'k'), producto(3)];
    const r = sinOpcionesRepetidas(lista);
    expect(r.map(claveOpcionProducto)).toEqual(['cuota:k', 'prod:2', 'prod:3']);
  });
});
