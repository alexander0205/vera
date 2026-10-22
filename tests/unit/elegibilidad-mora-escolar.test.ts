import { describe, it, expect } from 'vitest';
import {
  elegibleParaMora,
  graciaParaMora,
  type ConceptoMora,
} from '@/lib/cobranza/elegibilidad-mora-escolar';

const c = (cobraMora: boolean, moraDiasGracia = 0): ConceptoMora => ({ cobraMora, moraDiasGracia });

describe('elegibleParaMora — qué factura entra al cobro de mora', () => {
  it('venta normal (sin cargos escolares) entra', () => {
    expect(elegibleParaMora([])).toBe(true);
  });

  it('factura escolar con TODOS los conceptos sin mora NO entra', () => {
    // Caso Mi Casita: Evaluación + Inscripción, ambos cobra_mora=false.
    expect(elegibleParaMora([c(false), c(false)])).toBe(false);
  });

  it('factura escolar con un concepto que cobra mora entra', () => {
    expect(elegibleParaMora([c(true)])).toBe(true);
  });

  it('factura mixta (un concepto con mora, otro sin) SÍ entra', () => {
    expect(elegibleParaMora([c(false), c(true)])).toBe(true);
  });
});

describe('graciaParaMora — días de gracia por concepto', () => {
  const GRACIA_TEAM = 0;

  it('sin cargos escolares usa la gracia del team', () => {
    expect(graciaParaMora([], 3)).toBe(3);
  });

  it('conceptos sin mora caen a la gracia del team (su gracia no cuenta)', () => {
    expect(graciaParaMora([c(false, 99)], 3)).toBe(3);
  });

  it('usa la gracia del concepto que cobra mora, no la del team', () => {
    // Caso Yisrael Kids: Colegiatura con 5 días de gracia, team en 0.
    expect(graciaParaMora([c(true, 5)], GRACIA_TEAM)).toBe(5);
  });

  it('respeta un 0 real del concepto (no cae al team)', () => {
    expect(graciaParaMora([c(true, 0)], 7)).toBe(0);
  });

  it('con varios conceptos que cobran mora usa la gracia MÁS LARGA', () => {
    expect(graciaParaMora([c(true, 2), c(true, 5)], GRACIA_TEAM)).toBe(5);
  });

  it('ignora la gracia de los conceptos que no cobran mora al tomar el máximo', () => {
    expect(graciaParaMora([c(false, 99), c(true, 3)], GRACIA_TEAM)).toBe(3);
  });
});
