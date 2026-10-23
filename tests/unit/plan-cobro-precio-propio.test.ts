import { describe, it, expect } from 'vitest';
import {
  aplicarPreciosPropios, modoPrecio, porCuotaDe, tarifaDesdeEscrito, type LineaPlan,
} from '@/components/administracion-escolar/PlanCobroSelector';

/**
 * El precio propio de un alumno se guarda como su TARIFA y el servidor la
 * reparte con `montosPorCuota`. La pantalla tiene que enseñar lo mismo.
 *
 * Caso real (colegio 43, octubre 2026): «Programa personalizado» es un concepto
 * «otro» de diez cuotas con tarifa 5,000, o sea 10 × 500. La pantalla decía
 * «RD$5,000.00 por cuota» y, al cambiarle el precio a un alumno, multiplicaba
 * lo escrito por cuota mientras el servidor lo repartía: enseñaba 50,000 y
 * cargaba 5,000.
 */
function linea(tipo: string, tarifa: number, n: number, omitidas = 0): LineaPlan {
  const cada = tipo === 'mensualidad' ? tarifa : tarifa / n;
  const cuotas = Array.from({ length: n }, (_, i) => ({
    cuotaId: i + 1, numero: i + 1, etiqueta: `Cuota ${i + 1}`, mes: ((7 + i) % 12) + 1,
    fechaEmision: `2026-${String(8 + i).padStart(2, '0')}-24`, fechaVencimiento: `2026-${String(8 + i).padStart(2, '0')}-29`,
    montoCentavos: cada, omitida: i < omitidas, porcentajeMilesimas: 10000,
  }));
  return {
    conceptoId: 7, nombre: 'Programa personalizado', tipo, admiteBeca: false,
    montoCentavos: tarifa, origen: 'grado', productId: 1, cuotas,
    totalCentavos: cuotas.filter((c) => !c.omitida).reduce((s, c) => s + c.montoCentavos, 0),
    omitidas,
  };
}

describe('precio propio de un alumno', () => {
  it('en un concepto que reparte, lo enseñado es lo que el servidor carga', () => {
    const l = linea('otro', 500000, 10);
    expect(porCuotaDe(l)).toBe(50000);

    // Se escribe 5,000 por cuota: la tarifa que se guarda es el total, 50,000.
    const tarifa = tarifaDesdeEscrito(l, 500000);
    expect(tarifa).toBe(5000000);

    const [conPropio] = aplicarPreciosPropios([l], new Map([[7, tarifa]]));
    expect(conPropio.cuotas.every((c) => c.montoCentavos === 500000)).toBe(true);
    expect(conPropio.totalCentavos).toBe(5000000);
  });

  it('en una mensualidad lo escrito es lo de cada mes', () => {
    const l = linea('mensualidad', 1500000, 10);
    expect(modoPrecio(l)).toBe('cuota');
    expect(tarifaDesdeEscrito(l, 1200000)).toBe(1200000);
    const [conPropio] = aplicarPreciosPropios([l], new Map([[7, 1200000]]));
    expect(conPropio.totalCentavos).toBe(12000000);
  });

  it('las cuotas que se omiten cuentan en el reparto pero no se cobran', () => {
    const l = linea('otro', 500000, 10, 2);
    const tarifa = tarifaDesdeEscrito(l, 60000); // 600 por cuota × las 10 del calendario
    const [conPropio] = aplicarPreciosPropios([l], new Map([[7, tarifa]]));
    expect(conPropio.cuotas.filter((c) => !c.omitida).every((c) => c.montoCentavos === 60000)).toBe(true);
    expect(conPropio.totalCentavos).toBe(480000);
  });

  it('con cuotas de distinto peso se escribe el total del año', () => {
    const l = linea('otro', 350000, 2);
    l.cuotas[0].porcentajeMilesimas = 60000;
    l.cuotas[1].porcentajeMilesimas = 40000;
    expect(modoPrecio(l)).toBe('total');
    expect(tarifaDesdeEscrito(l, 400000)).toBe(400000);
    const [conPropio] = aplicarPreciosPropios([l], new Map([[7, 400000]]));
    expect(conPropio.cuotas.map((c) => c.montoCentavos)).toEqual([240000, 160000]);
  });
});
