/**
 * Dividir una ficha de activo cuando se mueven solo unas unidades a otra aula:
 * costo, residual y depreciación acumulada se reparten en centavos exactos y
 * ninguna de las dos mitades queda inválida. Lo que se lleva la hija más lo que
 * conserva la madre da SIEMPRE el original, cuota por cuota.
 */
import { describe, it, expect } from 'vitest';
import { TrasladoError, dividirFicha, type FichaParaDividir } from '@/lib/escolar/inventario-aula';

const suma = (xs: readonly { montoCents: number }[]) => xs.reduce((s, x) => s + x.montoCents, 0);

/** Cuotas mensuales de un activo depreciado m meses: una cuota cada mes, con la última distinta. */
function cuotas(m: number, base: number, vida: number): { periodo: string; montoCents: number }[] {
  const regular = Math.round(base / vida);
  return Array.from({ length: m }, (_, i) => {
    const mes = ((i + 1) % 12) + 1;
    const anio = 2024 + Math.floor((i + 1) / 12);
    return { periodo: `${anio}-${String(mes).padStart(2, '0')}-01`, montoCents: i === vida - 1 ? base - regular * (vida - 1) : regular };
  });
}

function revisar(f: FichaParaDividir, mover: number) {
  const d = dividirFicha(f, mover);
  const acumulada = suma(f.depreciaciones);
  // Nada se pierde ni se inventa.
  expect(d.hija.costoCents + d.madre.costoCents).toBe(f.costoCents);
  expect(d.hija.valorResidualCents + d.madre.valorResidualCents).toBe(f.valorResidualCents);
  expect(d.hija.cantidad).toBe(mover);
  expect(d.madre.cantidad).toBe(f.cantidad - mover);
  expect(suma(d.hija.depreciaciones) + suma(d.madre.depreciaciones)).toBe(acumulada);
  d.hija.depreciaciones.forEach((c, i) => {
    expect(c.periodo).toBe(f.depreciaciones[i].periodo);
    expect(c.montoCents + d.madre.depreciaciones[i].montoCents).toBe(f.depreciaciones[i].montoCents);
    expect(c.montoCents).toBeGreaterThanOrEqual(0);
    expect(d.madre.depreciaciones[i].montoCents).toBeGreaterThanOrEqual(0);
  });
  // Cada mitad vale por sí sola: costo > 0, residual < costo, depreciación dentro de lo depreciable.
  for (const p of [d.hija, d.madre]) {
    expect(p.costoCents).toBeGreaterThan(0);
    expect(p.valorResidualCents).toBeGreaterThanOrEqual(0);
    expect(p.valorResidualCents).toBeLessThan(p.costoCents);
    expect(suma(p.depreciaciones)).toBeLessThanOrEqual(p.costoCents - p.valorResidualCents);
  }
  return d;
}

describe('dividirFicha', () => {
  it('reparte en proporción a las unidades: 30 butacas, se mueven 10', () => {
    const f: FichaParaDividir = { costoCents: 30_000_000, valorResidualCents: 3_000_000, cantidad: 30, depreciaciones: cuotas(6, 27_000_000, 60) };
    const d = revisar(f, 10);
    expect(d.hija.costoCents).toBe(10_000_000);
    expect(d.madre.costoCents).toBe(20_000_000);
    expect(d.hija.valorResidualCents).toBe(1_000_000);
    expect(suma(d.hija.depreciaciones)).toBe(Math.round(suma(f.depreciaciones) / 3));
  });

  it('con centavos que no dividen exacto, la suma sigue dando el original', () => {
    const f: FichaParaDividir = { costoCents: 1_000_003, valorResidualCents: 100_001, cantidad: 7, depreciaciones: cuotas(5, 900_002, 36) };
    for (let k = 1; k < 7; k++) revisar(f, k);
  });

  it('sin depreciación todavía solo reparte costo y residual', () => {
    const d = revisar({ costoCents: 500_000, valorResidualCents: 0, cantidad: 4, depreciaciones: [] }, 1);
    expect(d.hija.costoCents).toBe(125_000);
    expect(d.hija.depreciaciones).toEqual([]);
  });

  it('una ficha ya totalmente depreciada queda totalmente depreciada en las dos mitades', () => {
    const base = 1_000_001 - 100_001;
    const f: FichaParaDividir = { costoCents: 1_000_001, valorResidualCents: 100_001, cantidad: 3, depreciaciones: cuotas(10, base, 10) };
    expect(suma(f.depreciaciones)).toBe(base);
    for (const k of [1, 2]) {
      const d = revisar(f, k);
      expect(suma(d.hija.depreciaciones)).toBe(d.hija.costoCents - d.hija.valorResidualCents);
      expect(suma(d.madre.depreciaciones)).toBe(d.madre.costoCents - d.madre.valorResidualCents);
    }
  });

  it('montos grandes no pierden precisión (BigInt)', () => {
    const f: FichaParaDividir = { costoCents: 9_999_999_999, valorResidualCents: 1_234_567, cantidad: 9_999, depreciaciones: cuotas(24, 9_000_000_000, 120) };
    revisar(f, 4_321);
  });

  it('reparte bien en un barrido de casos', () => {
    for (let n = 2; n <= 9; n++) {
      for (const costo of [2, 3, 99, 1_000, 123_457, 7_777_777]) {
        for (const residual of [0, Math.floor(costo / 10), Math.floor(costo / 3)]) {
          if (residual >= costo - 1) continue;
          const base = costo - residual;
          for (const hechas of [0, 1, 7]) {
            const f: FichaParaDividir = { costoCents: costo, valorResidualCents: residual, cantidad: n, depreciaciones: cuotas(hechas, Math.floor(base * 0.6), 24) };
            for (let k = 1; k < n; k++) {
              try { revisar(f, k); } catch (e) {
                // Solo se admite el rechazo explícito de lo imposible (costo de 1 centavo por mitad), nunca una suma rota.
                expect(e).toBeInstanceOf(TrasladoError);
              }
            }
          }
        }
      }
    }
  });

  it('rechaza mover todo, nada, o más de lo que hay', () => {
    const f: FichaParaDividir = { costoCents: 1_000, valorResidualCents: 0, cantidad: 5, depreciaciones: [] };
    expect(() => dividirFicha(f, 0)).toThrow(TrasladoError);
    expect(() => dividirFicha(f, 5)).toThrow(TrasladoError);
    expect(() => dividirFicha(f, 9)).toThrow(TrasladoError);
    expect(() => dividirFicha(f, 1.5)).toThrow(TrasladoError);
  });

  it('un costo de un centavo no se puede dividir', () => {
    expect(() => dividirFicha({ costoCents: 1, valorResidualCents: 0, cantidad: 2, depreciaciones: [] }, 1)).toThrow(TrasladoError);
  });
});
