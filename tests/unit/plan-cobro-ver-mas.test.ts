/**
 * «Ver más» en la matrícula: los conceptos que la sección no cobra y otros
 * grados sí. Se ofrecen con un precio de partida y, si se eligen, quedan como
 * tarifa propia del alumno (pedido de Alex en el standup del 29-oct-2026).
 */
import { describe, expect, it } from 'vitest';
import { tarifaDeReferencia } from '@/lib/administracion-escolar/plan-cobro';
import { obligatoriosPrimero } from '@/components/administracion-escolar/PlanCobroSelector';

describe('tarifaDeReferencia', () => {
  it('toma el precio que más se repite entre grados y secciones', () => {
    const t = tarifaDeReferencia([
      { objetivoTipo: 'grado', montoCentavos: 400000, productId: 9 },
      { objetivoTipo: 'grado', montoCentavos: 350000, productId: 9 },
      { objetivoTipo: 'seccion', montoCentavos: 400000, productId: 9 },
    ], null);
    expect(t?.montoCentavos).toBe(400000);
    expect(t?.origen).toBe('estudiante');
    // Calendario completo: la tarifa propia que se guarda no recorta cuotas.
    expect(t?.cuotas).toBeNull();
  });

  it('las tarifas de otros alumnos solo cuentan si no hay otra', () => {
    const precios = [
      { objetivoTipo: 'estudiante', montoCentavos: 100000, productId: 9 },
      { objetivoTipo: 'estudiante', montoCentavos: 100000, productId: 9 },
      { objetivoTipo: 'grado', montoCentavos: 300000, productId: 9 },
    ];
    expect(tarifaDeReferencia(precios, null)?.montoCentavos).toBe(300000);
    expect(tarifaDeReferencia(precios.slice(0, 2), null)?.montoCentavos).toBe(100000);
  });

  it('en empate, el más bajo; sin producto en la tarifa, el del concepto', () => {
    const t = tarifaDeReferencia([
      { objetivoTipo: 'grado', montoCentavos: 500000, productId: null },
      { objetivoTipo: 'grado', montoCentavos: 300000, productId: null },
    ], 42);
    expect(t?.montoCentavos).toBe(300000);
    expect(t?.productId).toBe(42);
  });

  it('sin ninguna tarifa en el año no se ofrece', () => {
    expect(tarifaDeReferencia([], 42)).toBeNull();
  });
});

describe('obligatoriosPrimero', () => {
  it('los obligatorios arriba, los opcionales debajo, cada grupo en su orden', () => {
    const lineas = [
      { id: 'Almuerzo', opcional: true },
      { id: 'Anualidad' },
      { id: 'Horario extendido', opcional: true },
      { id: 'Mensualidad', opcional: false },
    ];
    expect(obligatoriosPrimero(lineas).map((l) => l.id))
      .toEqual(['Anualidad', 'Mensualidad', 'Almuerzo', 'Horario extendido']);
  });
});
