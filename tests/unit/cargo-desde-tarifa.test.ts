import { describe, it, expect } from 'vitest';
import {
  ERRORES_AL_COMPROBAR, ETIQUETA_CARGAR, conteoDeLaCarga, errorDeLaCarga,
  motivoParaNoCargar, seccionesDelObjetivo, todosLoTienen,
  type ObjetivoDeTarifa,
} from '@/lib/administracion-escolar/cargo-desde-tarifa';

/**
 * «Cargar a estudiantes» desde una fila de Tarifas.
 *
 * Poner el precio y cobrarlo eran dos pantallas distintas: se guardaba
 * «Evaluación Inicial, RD$500, Inicial» y para cobrarlo había que irse a
 * «Cargo a varios alumnos», buscar el concepto, teclear otra vez el monto y
 * acotar a mano el curso. Ahora la fila lo hace, y como el concepto y el curso
 * son los de la fila, lo único que se decide aquí es a cuáles de esos alumnos.
 *
 * El colegio de abajo es inventado y tiene la forma del real: un servicio con
 * dos grados y secciones, otro con un grado sin secciones.
 */

const GRADOS = [
  { id: 10, servicioId: 1 }, // Inicial · 1ro
  { id: 11, servicioId: 1 }, // Inicial · 2do
  { id: 20, servicioId: 2 }, // Primaria · 1ro
  { id: 30, servicioId: 3 }, // Sala de tareas · único grado, sin secciones
];
const SECCIONES = [
  { id: 100, gradoId: 10 },
  { id: 101, gradoId: 10 },
  { id: 110, gradoId: 11 },
  { id: 200, gradoId: 20 },
];

describe('seccionesDelObjetivo', () => {
  it('un servicio son todas las secciones de todos sus grados', () => {
    expect(seccionesDelObjetivo({ tipo: 'servicio', id: 1 }, GRADOS, SECCIONES))
      .toEqual([100, 101, 110]);
  });

  it('un grado son solo las suyas', () => {
    expect(seccionesDelObjetivo({ tipo: 'grado', id: 10 }, GRADOS, SECCIONES))
      .toEqual([100, 101]);
  });

  it('una sección es ella misma', () => {
    expect(seccionesDelObjetivo({ tipo: 'seccion', id: 110 }, GRADOS, SECCIONES))
      .toEqual([110]);
  });

  /*
   * Es el caso que no se puede mandar al servidor: la ruta de generar lee una
   * lista de secciones VACÍA como «todo el colegio» y le crearía la deuda al
   * colegio entero. Quien llama tiene que leerlo como «aquí no hay a quién».
   */
  it('un grupo sin secciones devuelve la lista vacía, no todo el colegio', () => {
    expect(seccionesDelObjetivo({ tipo: 'servicio', id: 3 }, GRADOS, SECCIONES)).toEqual([]);
    expect(seccionesDelObjetivo({ tipo: 'grado', id: 30 }, GRADOS, SECCIONES)).toEqual([]);
  });

  it('lo que ya no existe en la estructura no entra', () => {
    expect(seccionesDelObjetivo({ tipo: 'seccion', id: 999 }, GRADOS, SECCIONES)).toEqual([]);
    expect(seccionesDelObjetivo({ tipo: 'servicio', id: 999 }, GRADOS, SECCIONES)).toEqual([]);
  });
});

describe('motivoParaNoCargar', () => {
  const conPrecio = { montoCentavos: 50_000, cursoIds: [100, 101] };

  it('un cobro suelto con precio y con secciones se puede cargar', () => {
    expect(motivoParaNoCargar({ tipoDeConcepto: 'otro', ...conPrecio })).toBeNull();
  });

  /*
   * La mensualidad y la inscripción tienen precio por curso, becas y su propio
   * calendario: cobrarlas «a todos por igual» desde aquí se salta justo lo que
   * las tarifas configuran.
   */
  it('la mensualidad y la inscripción no se cobran desde aquí', () => {
    expect(motivoParaNoCargar({ tipoDeConcepto: 'mensualidad', ...conPrecio }))
      .toMatch(/plan del año/);
    expect(motivoParaNoCargar({ tipoDeConcepto: 'inscripcion', ...conPrecio }))
      .toMatch(/plan del año/);
  });

  it('sin precio no hay cargo: el monto es obligatorio y no hay de dónde sacarlo', () => {
    expect(motivoParaNoCargar({ tipoDeConcepto: 'otro', montoCentavos: null, cursoIds: [100] }))
      .toMatch(/Ponle precio/);
    expect(motivoParaNoCargar({ tipoDeConcepto: 'otro', montoCentavos: 0, cursoIds: [100] }))
      .toMatch(/Ponle precio/);
  });

  it('una fila sin secciones no pregunta: mandarla sería cobrarle al colegio entero', () => {
    expect(motivoParaNoCargar({ tipoDeConcepto: 'otro', montoCentavos: 50_000, cursoIds: [] }))
      .toMatch(/secciones/);
  });
});

describe('conteoDeLaCarga', () => {
  it('dice los dos números: a quién le falta y quién ya lo tiene', () => {
    expect(conteoDeLaCarga({ aCobrar: 12, yaLoTienen: 3 }))
      .toBe('12 alumnos no lo tienen todavía · 3 ya lo tienen');
  });

  it('sin nadie que lo tenga no se dice la segunda mitad', () => {
    expect(conteoDeLaCarga({ aCobrar: 12, yaLoTienen: 0 })).toBe('12 alumnos no lo tienen todavía');
  });

  it('con uno habla en singular', () => {
    expect(conteoDeLaCarga({ aCobrar: 1, yaLoTienen: 1 }))
      .toBe('1 alumno no lo tiene todavía · 1 ya lo tiene');
  });

  it('todos lo tienen solo cuando no queda nadie a quien cobrarle', () => {
    expect(todosLoTienen({ aCobrar: 0, yaLoTienen: 14 })).toBe(true);
    expect(todosLoTienen({ aCobrar: 2, yaLoTienen: 14 })).toBe(false);
    // Un curso vacío no es «todos lo tienen»: no hay nadie.
    expect(todosLoTienen({ aCobrar: 0, yaLoTienen: 0 })).toBe(false);
  });
});

describe('errorDeLaCarga', () => {
  it('mirar solo lee: nunca manda a volver a mirar por miedo a haber cobrado', () => {
    expect(errorDeLaCarga('mirar', 0).volverAMirar).toBe(false);
    expect(errorDeLaCarga('mirar', 403).texto).toMatch(/permiso/);
  });

  /*
   * Lo que separa un error de un cobro doble: con un 4xx se sabe que no se
   * escribió nada; sin respuesta o con un 5xx no se sabe, y entonces lo único
   * que se puede ofrecer es volver a mirar la lista.
   */
  it('un cobrar sin respuesta no se repite a ciegas', () => {
    expect(errorDeLaCarga('cobrar', 0).volverAMirar).toBe(true);
    expect(errorDeLaCarga('cobrar', 500).volverAMirar).toBe(true);
    expect(errorDeLaCarga('cobrar', 0).texto).toMatch(/no sabemos si los cargos se crearon/);
  });

  it('un cobrar con 4xx dice que no se creó nada', () => {
    expect(errorDeLaCarga('cobrar', 403).volverAMirar).toBe(false);
    expect(errorDeLaCarga('cobrar', 403).texto).toMatch(/No se creó nada/);
    expect(errorDeLaCarga('cobrar', 402, 'Tu plan venció.').texto).toContain('Tu plan venció.');
  });

  it('sin saber quién lo tiene ya, la lista no se enseña', () => {
    expect(ERRORES_AL_COMPROBAR['sin-respuesta']).toMatch(/comprobar/);
    expect(ERRORES_AL_COMPROBAR.demasiados).toMatch(/Cargo a varios alumnos/);
  });
});

describe('la etiqueta', () => {
  it('es una sola y se dice igual en todas las filas', () => {
    expect(ETIQUETA_CARGAR).toBe('Cargar a estudiantes');
  });
});

// El tipo se usa en la pantalla; aquí solo se comprueba que no se cuele otro.
const objetivos: ObjetivoDeTarifa[] = [
  { tipo: 'servicio', id: 1 }, { tipo: 'grado', id: 10 }, { tipo: 'seccion', id: 100 },
];
describe('ObjetivoDeTarifa', () => {
  it('son las tres filas del árbol de tarifas', () => {
    expect(objetivos.map((o) => o.tipo)).toEqual(['servicio', 'grado', 'seccion']);
  });
});
