import { describe, it, expect } from 'vitest';
import {
  aBanderas, desdeBanderas, defaultPorTipo, banderasPorTipo,
  OPCIONES_DONDE_SE_VENDE, type DondeSeVende,
} from '@/lib/productos/donde-se-vende';

/**
 * La regla que se rompió en producción: `visible_pos` nacía en true para todo, y
 * la grilla del POS de un colegio ofrecía «MENSUALIDAD RD$3,000». Estas pruebas
 * fijan el default por naturaleza del ítem, que es lo que ahora usan las cuatro
 * rutas que insertan en `products`.
 */
describe('¿dónde se vende? — default por naturaleza del ítem', () => {
  it('un servicio NO nace en la caja', () => {
    expect(defaultPorTipo('servicio')).toBe('facturacion');
    expect(banderasPorTipo('servicio').visiblePos).toBe(false);
    // …pero sí en Facturación: esconderlo de los dos lados lo dejaría invendible.
    expect(banderasPorTipo('servicio').visibleFacturacion).toBe(true);
  });

  it('un bien nace en los dos lados', () => {
    expect(defaultPorTipo('bien')).toBe('ambos');
    expect(banderasPorTipo('bien')).toEqual({ visiblePos: true, visibleFacturacion: true });
  });

  it('sin tipo, o con un tipo que no existe, se trata como servicio', () => {
    // El importador de facturas y cualquier ruta futura pueden llegar sin tipo.
    // Ante la duda no se ofrece en el mostrador: falta un botón (reversible)
    // antes que sobrar un comprobante fiscal (no reversible).
    for (const t of [null, undefined, '', 'combo', 'BIEN']) {
      expect(banderasPorTipo(t).visiblePos).toBe(false);
    }
  });
});

describe('las tres respuestas y las dos columnas', () => {
  it('cada respuesta apaga exactamente un lado (o ninguno)', () => {
    expect(aBanderas('ambos')).toEqual({ visiblePos: true, visibleFacturacion: true });
    expect(aBanderas('facturacion')).toEqual({ visiblePos: false, visibleFacturacion: true });
    expect(aBanderas('pos')).toEqual({ visiblePos: true, visibleFacturacion: false });
  });

  it('ida y vuelta sin pérdida para las tres opciones de la UI', () => {
    for (const { valor } of OPCIONES_DONDE_SE_VENDE) {
      expect(desdeBanderas(aBanderas(valor))).toBe(valor);
    }
  });

  it('las dos apagadas —dato viejo o escrito por API— se leen como «en los dos»', () => {
    // Un producto que no aparece en ningún lado es indistinguible de uno
    // borrado, y nadie sabría por qué. Se prefiere que aparezca de más.
    expect(desdeBanderas({ visiblePos: false, visibleFacturacion: false })).toBe('ambos');
  });

  it('columnas ausentes se leen como «en los dos», no como escondido', () => {
    expect(desdeBanderas({})).toBe('ambos');
    expect(desdeBanderas({ visiblePos: null, visibleFacturacion: null })).toBe('ambos');
  });

  it('la UI ofrece exactamente las tres respuestas que el modelo sabe guardar', () => {
    const valores = OPCIONES_DONDE_SE_VENDE.map((o) => o.valor).sort();
    const esperados: DondeSeVende[] = ['ambos', 'facturacion', 'pos'];
    expect(valores).toEqual(esperados.sort());
  });
});
