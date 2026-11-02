/**
 * El autoguardado de «Matricular desde SIGERD»: lo decidido va y vuelve igual,
 * y al volver se queda solo con lo que sigue en pantalla.
 */
import { describe, expect, it } from 'vitest';
import { aBorrador, deBorrador, estaVacio, type EstadoLote } from '@/lib/administracion-escolar/borrador-lote';

const estado = (): EstadoLote => ({
  fecha: '2026-08-01',
  fuera: new Set([12]),
  cambiadosSeccion: new Map([[5, new Set([45, 49])], [6, new Set()]]),
  ajustes: new Map([[10, { conceptos: [45, 49], precios: [{ conceptoId: 49, montoCentavos: 1200000 }] }]]),
  ubicados: new Map([[12, 6]]),
});
const vigentes = { alumnos: new Set([10, 12]), secciones: new Set([5, 6]) };

describe('borrador del lote', () => {
  it('va y vuelve igual (sin secciones vacías)', () => {
    const b = JSON.parse(JSON.stringify(aBorrador(estado())));
    expect(b.cambiadosSeccion).toEqual({ 5: [45, 49] });
    const e = deBorrador(b, vigentes)!;
    expect(e.fecha).toBe('2026-08-01');
    expect([...e.fuera]).toEqual([12]);
    expect([...e.cambiadosSeccion.get(5)!]).toEqual([45, 49]);
    expect(e.ajustes.get(10)).toEqual({ conceptos: [45, 49], precios: [{ conceptoId: 49, montoCentavos: 1200000 }] });
    expect([...e.ubicados]).toEqual([[12, 6]]);
  });

  it('el curso elegido a un alumno de Zero: se descarta si el alumno o la sección ya no están', () => {
    const b = aBorrador({ ...estado(), ubicados: new Map([[12, 6], [10, 99]]) });
    expect([...deBorrador(b, vigentes)!.ubicados]).toEqual([[12, 6]]);
    // Un borrador de antes, sin ubicados, se entiende igual.
    expect(deBorrador({ version: 1, fuera: [] }, vigentes)!.ubicados.size).toBe(0);
  });

  it('descarta alumnos y secciones que ya no están', () => {
    const b = aBorrador(estado());
    const e = deBorrador(b, { alumnos: new Set([99]), secciones: new Set([6]) })!;
    expect(e.ajustes.size).toBe(0);
    expect(e.fuera.size).toBe(0);
    expect(e.cambiadosSeccion.has(5)).toBe(false);
    expect(e.ubicados.size).toBe(0);
    expect(estaVacio({ ...e, fecha: null })).toBe(true);
  });

  it('no se fía de lo guardado: ignora versiones raras y datos sucios', () => {
    expect(deBorrador({ version: 2 }, vigentes)).toBeNull();
    expect(deBorrador('x', vigentes)).toBeNull();
    const e = deBorrador({
      version: 1, fecha: 'ayer', fuera: ['12', 'x'],
      ajustes: { 10: { conceptos: [45, 'n'], precios: [{ conceptoId: 49, montoCentavos: -5 }] } },
    }, vigentes)!;
    expect(e.fecha).toBeNull();
    expect([...e.fuera]).toEqual([12]);
    expect(e.ajustes.get(10)).toEqual({ conceptos: [45], precios: [] });
  });
});
