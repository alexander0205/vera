import { describe, it, expect } from 'vitest';
import {
  ETIQUETA_CARGAR, cuotasYaEmitidas, motivoParaNoCargar, otraColegiatura,
  seccionesDelObjetivo, type ObjetivoDeTarifa,
} from '@/lib/administracion-escolar/cargo-desde-tarifa';

/**
 * «Asignar a estudiantes» desde una fila de Tarifas.
 *
 * La fila añade su concepto al plan de los alumnos de ese curso; las cuotas se
 * vuelven cargo en su fecha. Como el concepto y el curso son los de la fila,
 * lo único que se decide aquí es a cuáles de esos alumnos.
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
});

describe('otraColegiatura', () => {
  const COLEGIO = [
    { id: 28, tipo: 'mensualidad', nombre: 'Colegiatura 1ra Generación' },
    { id: 38, tipo: 'actividad', nombre: 'Evaluacion Inicial' },
  ];

  /*
   * La fila de «Colegiatura 2da» cubre el servicio entero y trae también a los
   * de 1ra. Asignársela a todos les cobraría dos colegiaturas cada mes.
   */
  it('dice cuál tiene el alumno cuando se le va a poner otra', () => {
    expect(otraColegiatura({ id: 26, tipo: 'mensualidad' }, COLEGIO))
      .toBe('Colegiatura 1ra Generación');
  });

  it('la misma colegiatura no choca consigo misma', () => {
    expect(otraColegiatura({ id: 28, tipo: 'mensualidad' }, COLEGIO)).toBeNull();
  });

  it('lo que no es colegiatura no choca con nada', () => {
    expect(otraColegiatura({ id: 39, tipo: 'actividad' }, COLEGIO)).toBeNull();
  });

  it('sin colegiatura en el plan no hay choque', () => {
    expect(otraColegiatura({ id: 26, tipo: 'mensualidad' }, [COLEGIO[1]])).toBeNull();
  });
});

describe('cuotasYaEmitidas', () => {
  const CALENDARIO = [
    { fechaEmision: '2026-10-13' }, { fechaEmision: '2027-01-19' },
    { fechaEmision: '2027-03-15' }, { fechaEmision: null },
  ];

  it('cuenta las que emiten hoy o antes: esas se crean al confirmar', () => {
    expect(cuotasYaEmitidas(CALENDARIO, '2026-10-13')).toBe(1);
    expect(cuotasYaEmitidas(CALENDARIO, '2027-02-01')).toBe(2);
  });

  it('antes de la primera no hay ninguna', () => {
    expect(cuotasYaEmitidas(CALENDARIO, '2026-10-12')).toBe(0);
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
