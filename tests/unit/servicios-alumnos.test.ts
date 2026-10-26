import { describe, it, expect } from 'vitest';
import {
  cambioParaPaquete, cambiosDesdeHoja, conceptosTrasCambio, marcaDeHoja, validarCambios,
} from '@/lib/administracion-escolar/servicios-alumnos';

const AVANCE = 1, MENSUALIDAD = 2, ALMUERZO = 3, EXTENDIDO = 4, REGISTRO = 5;

describe('conceptos de una matrícula tras un cambio por lote', () => {
  it('agrega al final sin repetir y quita lo pedido', () => {
    expect(conceptosTrasCambio([MENSUALIDAD, AVANCE], { agregar: [ALMUERZO, AVANCE], quitar: [] })).toEqual([MENSUALIDAD, AVANCE, ALMUERZO]);
    expect(conceptosTrasCambio([MENSUALIDAD, AVANCE, ALMUERZO], { agregar: [], quitar: [ALMUERZO] })).toEqual([MENSUALIDAD, AVANCE]);
  });

  it('si llegan agregar y quitar del mismo, gana quitar', () => {
    expect(conceptosTrasCambio([MENSUALIDAD], { agregar: [ALMUERZO], quitar: [ALMUERZO] })).toEqual([MENSUALIDAD]);
  });
});

describe('aplicar un paquete', () => {
  it('registro SIGERD: se quitan avance y mensualidad y queda solo su servicio', () => {
    expect(cambioParaPaquete([AVANCE, MENSUALIDAD], [REGISTRO], [AVANCE, MENSUALIDAD, REGISTRO]))
      .toEqual({ agregar: [REGISTRO], quitar: [AVANCE, MENSUALIDAD] });
  });

  it('lo que no tiene precio en su sección no se agrega', () => {
    expect(cambioParaPaquete([AVANCE, MENSUALIDAD], [AVANCE, MENSUALIDAD, EXTENDIDO], [AVANCE, MENSUALIDAD]))
      .toEqual({ agregar: [], quitar: [] });
  });
});

describe('validar lo que manda la pantalla', () => {
  it('limpia ids y descarta cambios vacíos', () => {
    const r = validarCambios([
      { matriculaId: 7, agregar: [3, '3', 'x'], quitar: [] },
      { matriculaId: 8, agregar: [], quitar: [] },
    ]);
    expect(r).toEqual({ ok: true, cambios: [{ matriculaId: 7, agregar: [3], quitar: [] }] });
  });

  it('rechaza sin cambios o con demasiados', () => {
    expect(validarCambios([]).ok).toBe(false);
    expect(validarCambios(Array.from({ length: 3 }, (_, i) => ({ matriculaId: i + 1, agregar: [1], quitar: [] })), 2).ok).toBe(false);
  });
});

describe('la hoja de carga', () => {
  const alumnos = [
    { matriculaId: 10, nombre: 'Ana Pérez', conceptosIds: [AVANCE, MENSUALIDAD], conTarifa: [AVANCE, MENSUALIDAD, ALMUERZO] },
    { matriculaId: 11, nombre: 'Luis Gómez', conceptosIds: [AVANCE, MENSUALIDAD, ALMUERZO], conTarifa: [AVANCE, MENSUALIDAD, ALMUERZO] },
  ];
  const conceptos = [
    { id: AVANCE, nombre: 'Avance de Anualidad' }, { id: MENSUALIDAD, nombre: 'Mensualidad' },
    { id: ALMUERZO, nombre: 'Almuerzo' }, { id: EXTENDIDO, nombre: 'Horario Extendido' },
  ];
  const encabezados = ['ID matrícula', 'Código', 'Alumno', 'Grado', 'Sección', 'Avance de Anualidad', 'Mensualidad', 'Almuerzo', 'Horario Extendido'];

  it('X agrega, vacío quita, y se reconoce por el ID de matrícula', () => {
    const r = cambiosDesdeHoja({ encabezados, filas: [
      [10, '', 'Ana Pérez', 'Primero', 'A', 'X', 'x', 'sí', ''],
      [11, '', 'Luis Gómez', 'Primero', 'A', 'X', 'X', '', ''],
    ] }, alumnos, conceptos);
    expect(r.cambios).toEqual([
      { matriculaId: 10, agregar: [ALMUERZO], quitar: [] },
      { matriculaId: 11, agregar: [], quitar: [ALMUERZO] },
    ]);
  });

  it('sin ID se busca por nombre; lo que no tiene precio se avisa y no se agrega', () => {
    const r = cambiosDesdeHoja({ encabezados, filas: [
      ['', '', 'ana pérez', 'Primero', 'A', 'X', 'X', '', 'X'],
      ['', '', 'Nadie', 'Primero', 'A', 'X', '', '', ''],
    ] }, alumnos, conceptos);
    expect(r.cambios).toEqual([]);
    expect(r.avisos.some((a) => a.includes('Horario Extendido'))).toBe(true);
    expect(r.avisos.some((a) => a.includes('Nadie'))).toBe(true);
  });

  it('marca de hoja', () => {
    expect(['X', 'x', 'Sí', 'si', '1', '✓'].every(marcaDeHoja)).toBe(true);
    expect(['', 'no', '—', '0', null].some(marcaDeHoja)).toBe(false);
  });
});
