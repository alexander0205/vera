import { describe, it, expect } from 'vitest';
import {
  ERRORES_AL_COMPROBAR, ETIQUETA_CARGAR, avisoDeCalendario, avisoDeLaCarga, conteoDeLaCarga,
  cuantosPaganDistinto, errorDeLaCarga, fraseDeLaCarga, fraseDeSinTarifa, necesitaMes,
  motivoParaNoCargar, seccionesDelObjetivo, tienePlanPropio, todosLoTienen,
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

  it('con precio y con secciones se puede cargar', () => {
    expect(motivoParaNoCargar(conPrecio)).toBeNull();
  });

  it('sin precio no hay cargo: el monto es obligatorio y no hay de dónde sacarlo', () => {
    expect(motivoParaNoCargar({ montoCentavos: null, cursoIds: [100] })).toMatch(/Ponle precio/);
    expect(motivoParaNoCargar({ montoCentavos: 0, cursoIds: [100] })).toMatch(/Ponle precio/);
  });

  it('una fila sin secciones no pregunta: mandarla sería cobrarle al colegio entero', () => {
    expect(motivoParaNoCargar({ montoCentavos: 50_000, cursoIds: [] })).toMatch(/secciones/);
  });

  /*
   * El tipo de cobro ya NO para el botón. Lo paraba —la colegiatura tiene
   * becas y plan propio—, pero apagarlo dejaba sin salida al colegio que
   * necesita ponerle la colegiatura a los seis que entraron tarde. Ahora se
   * avisa y se enseña uno por uno a quién se le pone.
   */
  it('la colegiatura y la inscripción ya no están prohibidas', () => {
    expect(motivoParaNoCargar(conPrecio)).toBeNull();
    expect(avisoDeLaCarga('mensualidad')).toMatch(/plan del año/);
    expect(avisoDeLaCarga('inscripcion')).toMatch(/una vez por año escolar/);
    expect(tienePlanPropio('mensualidad')).toBe(true);
    expect(tienePlanPropio('inscripcion')).toBe(true);
  });

  it('un cobro suelto no lleva aviso: no hay nada que avisar', () => {
    expect(avisoDeLaCarga('actividad')).toBeNull();
    expect(avisoDeLaCarga('otro')).toBeNull();
    expect(tienePlanPropio('actividad')).toBe(false);
  });
});

describe('necesitaMes', () => {
  /*
   * Sin mes, el servidor cuenta los repetidos por año escolar: a quien se le
   * cobró septiembre se le daría por cobrado octubre, y la colegiatura de
   * octubre no se podría poner.
   */
  it('la colegiatura va por mes', () => {
    expect(necesitaMes('mensualidad')).toBe(true);
  });

  it('lo demás va una vez por año escolar', () => {
    expect(necesitaMes('inscripcion')).toBe(false);
    expect(necesitaMes('actividad')).toBe(false);
    expect(necesitaMes('uniforme')).toBe(false);
    expect(necesitaMes('otro')).toBe(false);
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
    expect(ETIQUETA_CARGAR).toBe('Asignar a estudiantes');
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

describe('avisoDeCalendario', () => {
  /*
   * El choque que ninguna de las dos partes ve: el plan pregunta «¿ya hice la
   * cuota P1 de este alumno?» y mira `cuota_id`; esta pantalla pregunta «¿ya
   * tiene este concepto este año?» y no mira las cuotas. El cargo que se crea
   * aquí nace sin cuota, así que el plan no lo encuentra y crea el suyo.
   */
  it('avisa cuando el cobro tiene calendario, y dice quién lo pone', () => {
    expect(avisoDeCalendario(3)).toMatch(/3 cuotas/);
    expect(avisoDeCalendario(3)).toMatch(/plan del año/);
    expect(avisoDeCalendario(1)).toMatch(/una cuota/);
  });

  it('sin calendario no hay aviso', () => {
    expect(avisoDeCalendario(0)).toBeNull();
    expect(avisoDeCalendario(-1)).toBeNull();
  });
});

describe('fraseDeLaCarga', () => {
  const dinero = (c: number) => `RD$${(c / 100).toFixed(2)}`;
  const base = {
    cobro: 'Colegiatura', etiqueta: 'octubre de 2026', grupo: 'INICIAL',
    marcados: 46, enLaLista: 49, totalCentavos: 13_580_000, conPrecioPropio: 0, dinero,
  };

  /*
   * El total y no «a cada uno»: con becas y tarifas personales no hay un monto
   * por cabeza que multiplicar, y decir uno sería mentir en la línea que la
   * persona lee justo antes de cobrar.
   */
  it('dice el total, no un monto por alumno', () => {
    expect(fraseDeLaCarga(base).principal)
      .toBe('Les vas a cobrar «Colegiatura» de octubre de 2026 a 46 de los 49 alumnos de INICIAL. Total: RD$135800.00.');
  });

  it('cuando son todos no dice «de los»', () => {
    expect(fraseDeLaCarga({ ...base, marcados: 49 }).principal)
      .toMatch(/a los 49 alumnos de INICIAL/);
  });

  it('avisa de cuántos pagan distinto, que es lo que explica el total', () => {
    expect(fraseDeLaCarga({ ...base, conPrecioPropio: 3 }).nota)
      .toBe('3 pagan distinto: tienen beca o precio propio.');
    expect(fraseDeLaCarga({ ...base, conPrecioPropio: 1 }).nota)
      .toMatch(/^1 paga distinto/);
    expect(fraseDeLaCarga(base).nota).toBeNull();
  });

  it('sin nadie marcado no hay nada que decir', () => {
    expect(fraseDeLaCarga({ ...base, marcados: 0 }).principal).toBeNull();
  });

  it('sin tarifa, el alumno se queda fuera y se dice', () => {
    expect(fraseDeSinTarifa(2)).toMatch(/2 alumnos se quedan fuera/);
    expect(fraseDeSinTarifa(0)).toBeNull();
  });
});

describe('cuantosPaganDistinto', () => {
  /*
   * Se mide contra lo que paga la MAYORÍA. Comparándolo con la tarifa de la
   * fila, un cobro repartido en tres cuotas decía «3 pagan distinto» con los
   * tres pagando lo mismo: todos pagaban un tercio, y un tercio no es la
   * tarifa.
   */
  it('con todos pagando igual no hay nadie distinto', () => {
    expect(cuantosPaganDistinto([6668, 6668, 6668])).toBe(0);
  });

  it('cuenta a los que se salen de lo que paga el resto', () => {
    expect(cuantosPaganDistinto([280000, 280000, 280000, 300000, 500000])).toBe(2);
  });

  it('con uno solo, o con ninguno, no hay con qué comparar', () => {
    expect(cuantosPaganDistinto([280000])).toBe(0);
    expect(cuantosPaganDistinto([])).toBe(0);
  });
});
