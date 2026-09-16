// tests/unit/cuentas-excel.test.ts
import { describe, it, expect } from 'vitest';
import {
  leerFilasCatalogo, ordenarPadresPrimero, textoCelda, leerTipo, leerSiNo,
  COLUMNAS_EXCEL, type FilaCatalogo,
} from '@/lib/contabilidad/cuentas-excel';

/**
 * Leer un catálogo de cuentas desde Excel.
 *
 * Lo que se prueba es lo que un archivo REAL trae y un archivo de ejemplo no:
 * códigos que Excel convirtió en número, un título encima de los encabezados,
 * filas en blanco al final, tildes que sí y que no, y una hija escrita antes
 * que su padre.
 */

const ENCABEZADO = [...COLUMNAS_EXCEL];

describe('textoCelda', () => {
  it('lee lo que ExcelJS devuelve según cómo se escribió la celda', () => {
    expect(textoCelda(1101)).toBe('1101');                                   // código tecleado
    expect(textoCelda('  Caja chica ')).toBe('Caja chica');
    expect(textoCelda({ richText: [{ text: 'Ban' }, { text: 'cos' }] })).toBe('Bancos');
    expect(textoCelda({ formula: 'A1', result: 'Activo' })).toBe('Activo');
    expect(textoCelda({ text: 'enlace', hyperlink: 'x' })).toBe('enlace');
    expect(textoCelda(null)).toBe('');
  });
});

describe('etiquetas', () => {
  it('acepta el tipo con o sin plural y sin tildes', () => {
    expect(leerTipo('Ingresos')).toBe('ingreso');
    expect(leerTipo('ACTIVO')).toBe('activo');
    expect(leerTipo('Capital')).toBe('patrimonio');
    expect(leerTipo('Activ')).toBeNull();
  });

  it('Sí/No con tilde, sin tilde, y lo que pone la gente de verdad', () => {
    expect(leerSiNo('Sí')).toBe(true);
    expect(leerSiNo('si')).toBe(true);
    expect(leerSiNo('x')).toBe(true);
    expect(leerSiNo('No')).toBe(false);
    expect(leerSiNo('Inactiva')).toBe(false);
    expect(leerSiNo('tal vez')).toBeNull();
  });
});

describe('leerFilasCatalogo', () => {
  it('lee el formato que genera la exportación', () => {
    const r = leerFilasCatalogo([
      ENCABEZADO,
      ['1', 'Activos', 'Activo', 'Deudora', '', 'No', 'Sí'],
      [1101, 'Caja general', 'Activo', 'Deudora', '1', 'Sí', 'Sí'],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([
      { fila: 2, codigo: '1', nombre: 'Activos', tipo: 'activo', naturaleza: 'deudora', padreCodigo: null, imputable: false, activa: true },
      { fila: 3, codigo: '1101', nombre: 'Caja general', tipo: 'activo', naturaleza: 'deudora', padreCodigo: '1', imputable: true, activa: true },
    ]);
  });

  it('encuentra los encabezados aunque haya un título encima', () => {
    const r = leerFilasCatalogo([
      ['Catálogo de Yisrael Technology'],
      [],
      ['codigo', 'NOMBRE', 'tipo'],
      ['6101', 'Sueldos', 'Gastos'],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ fila: 4, codigo: '6101', tipo: 'gasto' });
  });

  it('una columna que no viene NO es lo mismo que una celda vacía', () => {
    // Sin columna «padre»: la cuenta no se mueve de sitio al actualizar.
    const sinColumna = leerFilasCatalogo([['Código', 'Nombre'], ['1101', 'Caja']]);
    expect(sinColumna.filas[0].padreCodigo).toBeUndefined();

    // Con columna y celda vacía: la cuenta pasa a ser raíz.
    const vacia = leerFilasCatalogo([['Código', 'Nombre', 'Código cuenta padre'], ['1101', 'Caja', '']]);
    expect(vacia.filas[0].padreCodigo).toBeNull();
  });

  it('salta las filas en blanco que Excel deja al final', () => {
    const r = leerFilasCatalogo([ENCABEZADO, ['1101', 'Caja', 'Activo'], [], ['', '', ''], [null, null]]);
    expect(r.filas).toHaveLength(1);
    expect(r.errores).toEqual([]);
  });

  it('dice la fila exacta de cada error', () => {
    const r = leerFilasCatalogo([
      ENCABEZADO,
      ['1101', 'Caja', 'Activ'],                          // fila 2: tipo mal escrito
      ['', 'Sin código', 'Activo'],                       // fila 3
      ['1102', 'Banco', 'Activo', '', '', 'quizás'],      // fila 4: Sí/No inválido
      ['1101', 'Caja repetida', 'Activo'],                // fila 5: repite la 2
      ['1103', 'Uno mismo', 'Activo', '', '1103'],        // fila 6: se tiene de padre
    ]);
    // La 5 se reporta como duplicada aunque la 2 ya tuviera OTRO error. Si solo
    // se avisara del tipo, el usuario lo arreglaría, volvería a subir el archivo
    // y recién entonces se enteraría del duplicado: dos vueltas por una.
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3, 4, 5, 6]);
    expect(r.errores[0].mensaje).toContain('Activ');
  });

  it('un código repetido en el archivo es error, no «el último gana»', () => {
    const r = leerFilasCatalogo([ENCABEZADO, ['1101', 'Caja', 'Activo'], ['1101', 'Otra caja', 'Activo']]);
    expect(r.filas).toHaveLength(1);
    expect(r.errores).toEqual([expect.objectContaining({ fila: 3, codigo: '1101' })]);
    expect(r.errores[0].mensaje).toContain('fila 2');
  });

  it('sin «Código» y «Nombre» no hay por dónde empezar', () => {
    const r = leerFilasCatalogo([['Cuenta contable', 'Descripción larga'], ['x', 'y']]);
    // «Cuenta» no es «Cuenta contable»: la comparación es exacta, a propósito.
    expect(r.filas).toEqual([]);
    expect(r.errores[0].mensaje).toContain('encabezados');
  });
});

describe('ordenarPadresPrimero', () => {
  const f = (codigo: string, padreCodigo: string | null, fila: number): FilaCatalogo =>
    ({ fila, codigo, nombre: codigo, tipo: 'activo', padreCodigo });

  it('pone al padre antes que la hija aunque en el archivo venga después', () => {
    const { ordenadas, errores } = ordenarPadresPrimero([
      f('110101', '1101', 2),
      f('1101', '1', 3),
      f('1', null, 4),
    ]);
    expect(errores).toEqual([]);
    expect(ordenadas.map((x) => x.codigo)).toEqual(['1', '1101', '110101']);
  });

  it('un padre que está en el sistema y no en el archivo no bloquea', () => {
    const { ordenadas, errores } = ordenarPadresPrimero([f('1105', '11', 2)]);
    expect(errores).toEqual([]);
    expect(ordenadas).toHaveLength(1);
  });

  it('un círculo dentro del archivo se reporta en las dos filas', () => {
    const { ordenadas, errores } = ordenarPadresPrimero([
      f('A', 'B', 2),
      f('B', 'A', 3),
      f('C', 'A', 4),   // cuelga del círculo, pero ella misma no lo forma
    ]);
    expect(errores.map((e) => e.codigo).sort()).toEqual(['A', 'B']);
    expect(ordenadas.map((x) => x.codigo)).toEqual(['C']);
  });
});
