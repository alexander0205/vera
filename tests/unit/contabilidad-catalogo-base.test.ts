import { describe, it, expect } from 'vitest';
import {
  CATALOGO_BASE, CODIGO, CODIGOS_ACTIVOS_FIJOS, codigoPadreEnCatalogo,
} from '@/lib/contabilidad/catalogo-base';

const porCodigo = new Map(CATALOGO_BASE.map((c) => [c.codigo, c]));

describe('catálogo base: jerarquía', () => {
  it('no repite códigos', () => {
    expect(new Set(CATALOGO_BASE.map((c) => c.codigo)).size).toBe(CATALOGO_BASE.length);
  });

  it('cada cuenta cuelga de un padre que existe, no es imputable y viene antes', () => {
    CATALOGO_BASE.forEach((c, i) => {
      const padre = codigoPadreEnCatalogo(c.codigo);
      if (padre === null) return;
      expect(porCodigo.get(padre)?.imputable, `${c.codigo} → ${padre}`).toBe(false);
      expect(CATALOGO_BASE.findIndex((x) => x.codigo === padre)).toBeLessThan(i);
    });
  });

  it('1102 Bancos es padre y 110201 es su hija imputable', () => {
    expect(porCodigo.get('1102')?.imputable).toBe(false);
    expect(codigoPadreEnCatalogo('110201')).toBe('1102');
    expect(porCodigo.get('110201')?.imputable).toBe(true);
    expect(CODIGO.bancoPrincipal).toBe('110201');
  });

  it('las cuentas que usa el motor siguen existiendo e imputables', () => {
    for (const cod of ['1101', '1201', '1202', '6103', '2101', '1103']) {
      expect(porCodigo.get(cod)?.imputable, cod).toBe(true);
    }
  });
});

describe('catálogo base: activos fijos por tipo', () => {
  it('trae terrenos, edificios, mobiliario, transporte y cómputo', () => {
    const nombres = CODIGOS_ACTIVOS_FIJOS.map((c) => porCodigo.get(c)?.nombre ?? '');
    for (const n of ['Terrenos', 'Edificios', 'Mobiliario', 'transporte', 'cómputo']) {
      expect(nombres.some((x) => x.includes(n)), n).toBe(true);
    }
  });

  it('cada tipo depreciable tiene su depreciación acumulada, de naturaleza acreedora', () => {
    const deprec = CODIGOS_ACTIVOS_FIJOS.map((c) => porCodigo.get(c)!).filter((c) => c.nombre.startsWith('Depreciación'));
    expect(deprec).toHaveLength(4);
    for (const d of deprec) {
      expect(d.naturaleza).toBe('acreedora');
      expect(d.tipo).toBe('activo');
    }
  });

  it('no cambia el código de las cuentas generales 1201 y 1202', () => {
    expect(porCodigo.get('1201')?.nombre).toBe('Activos fijos');
    expect(porCodigo.get('1202')?.nombre).toBe('Depreciación acumulada');
  });
});

describe('catálogo base: cuentas que agregaron las reuniones', () => {
  it.each([
    ['6119', 'gasto'], ['6120', 'gasto'], ['4105', 'ingreso'], ['2115', 'pasivo'],
  ])('%s existe, es imputable y de tipo %s', (codigo, tipo) => {
    expect(porCodigo.get(codigo)?.tipo).toBe(tipo);
    expect(porCodigo.get(codigo)?.imputable).toBe(true);
  });
});
