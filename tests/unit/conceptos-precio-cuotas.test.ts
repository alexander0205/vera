import { describe, it, expect } from 'vitest';
import { cuotasDeLaTarifa, montosPorCuota, precioEsPorCuota } from '@/lib/administracion-escolar/repartir';
import { sugerirMontoDelCargo } from '@/lib/administracion-escolar/precio-cargo-individual';

/**
 * Colegio 43, octubre 2026: «Servicio de Almuerzo A» es un concepto «otro» de
 * 11 cuotas con tarifa 5,000. El colegio quería 5,000 cada mes; Zero repartía
 * y cobraba 455. Y Primero pagaba 11 cuotas cuando le tocan 10.
 */
const once = Array.from({ length: 11 }, () => 100000 / 11);

describe('precio por cuota o total del año', () => {
  it('sin decirlo, decide el tipo: la colegiatura por cuota y lo demás repartido', () => {
    expect(precioEsPorCuota({ tipo: 'mensualidad' })).toBe(true);
    expect(precioEsPorCuota({ tipo: 'otro' })).toBe(false);
    expect(precioEsPorCuota({ tipo: 'otro', precioPorCuota: null })).toBe(false);
  });

  it('lo que dice el concepto gana al tipo', () => {
    expect(precioEsPorCuota({ tipo: 'otro', precioPorCuota: true })).toBe(true);
    expect(precioEsPorCuota({ tipo: 'mensualidad', precioPorCuota: false })).toBe(false);
  });

  it('el almuerzo de 5,000 por cuota cobra 5,000 cada mes', () => {
    const m = montosPorCuota('otro', 500000, once, true);
    expect(m).toHaveLength(11);
    expect(m.every((x) => x === 500000)).toBe(true);
  });

  it('sin decir nada sigue repartiendo, como antes', () => {
    const m = montosPorCuota('otro', 500000, once);
    expect(m.reduce((a, b) => a + b, 0)).toBe(500000);
  });
});

describe('cuántas cuotas paga cada grado', () => {
  const cal = Array.from({ length: 11 }, (_, i) => ({ id: i + 1 }));

  it('sin número, todas las del calendario', () => {
    expect(cuotasDeLaTarifa(cal, null)).toHaveLength(11);
    expect(cuotasDeLaTarifa(cal, undefined)).toHaveLength(11);
  });

  it('10 de 11: se queda con las diez primeras (junio fuera)', () => {
    const r = cuotasDeLaTarifa(cal, 10);
    expect(r).toHaveLength(10);
    expect(r[9].id).toBe(10);
  });

  it('un número fuera de rango no recorta', () => {
    expect(cuotasDeLaTarifa(cal, 0)).toHaveLength(11);
    expect(cuotasDeLaTarifa(cal, 20)).toHaveLength(11);
  });

  it('el cargo suelto usa las mismas reglas: 10 cuotas y precio por cuota', () => {
    const cuotas = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1, etiqueta: `Cuota ${i + 1}`, mes: ((7 + i) % 12) + 1, porcentajeMilesimas: 100000 / 11, cargada: false,
    }));
    const porCuota = sugerirMontoDelCargo('otro', { montoCentavos: 500000, origen: 'grado', cuotas: 10 }, cuotas, null, null, true);
    expect(porCuota?.montoCentavos).toBe(500000);
    const repartido = sugerirMontoDelCargo('otro', { montoCentavos: 500000, origen: 'grado', cuotas: 10 }, cuotas, null, null, false);
    expect(repartido?.montoCentavos).toBe(50000);
    expect(repartido?.cuota?.de).toBe(10);
  });
});
