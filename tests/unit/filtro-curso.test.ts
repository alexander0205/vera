import { describe, it, expect } from 'vitest';
import {
  completarFiltro, normalizarFiltro, opcionesDelFiltro, seccionesDelFiltro, TODOS_LOS_CURSOS,
  type CursoFiltrable,
} from '@/lib/administracion-escolar/filtro-curso';
import { filtroAUrl, filtroDeUrl } from '@/components/administracion-escolar/FiltroEstructura';

/**
 * El filtro de estructura (nivel → grado → sección) que ahora usan Estudiantes,
 * Documentos y Servicios por alumno. Antes cada pantalla comparaba la LETRA de
 * la sección: «A» traía la A de todos los grados.
 */

const P = 10; // año escolar en curso
const VIEJO = 9;

function curso(id: number, nombre: string, gradoId: number, gradoNombre: string,
  servicioId: number, servicioNombre: string, periodoId = P, tanda: string | null = null): CursoFiltrable {
  return { id, nombre, gradoId, gradoNombre, servicioId, servicioNombre, servicioTanda: tanda, periodoId };
}

const CATALOGO: CursoFiltrable[] = [
  curso(1, 'A', 100, 'Primero', 1000, 'Primaria', P, 'Matutina'),
  curso(2, 'B', 100, 'Primero', 1000, 'Primaria', P, 'Matutina'),
  curso(3, 'A', 101, 'Segundo', 1000, 'Primaria', P, 'Matutina'),
  // Mismo nombre de grado en otra tanda: es otro grado.
  curso(4, 'A', 200, 'Primero', 2000, 'Primaria', P, 'Vespertina'),
  curso(5, 'Única', 300, 'Sala', 3000, 'Sala de tareas', P),
  // Del año pasado: nunca se ofrece ni se cuela en un filtro de este año.
  curso(9, 'A', 900, 'Primero', 9000, 'Primaria', VIEJO, 'Matutina'),
];

describe('seccionesDelFiltro', () => {
  it('«Todos» no manda lista', () => {
    expect(seccionesDelFiltro(CATALOGO, P, TODOS_LOS_CURSOS)).toBeNull();
  });

  it('una sección es solo esa, no todas las «A»', () => {
    expect(seccionesDelFiltro(CATALOGO, P, { servicioId: 1000, gradoId: 100, cursoId: 1 })).toEqual([1]);
  });

  it('un grado son todas sus secciones y nada de la otra tanda', () => {
    expect(seccionesDelFiltro(CATALOGO, P, { servicioId: 1000, gradoId: 100, cursoId: null })).toEqual([1, 2]);
  });

  it('un servicio son todos sus grados', () => {
    expect(seccionesDelFiltro(CATALOGO, P, { servicioId: 1000, gradoId: null, cursoId: null })).toEqual([1, 2, 3]);
  });

  it('nunca entra una sección de otro año', () => {
    expect(seccionesDelFiltro(CATALOGO, P, { servicioId: 9000, gradoId: null, cursoId: null })).toEqual([]);
  });
});

describe('completarFiltro', () => {
  it('un enlace viejo con solo ?curso= se completa con su grado y su servicio', () => {
    expect(completarFiltro(CATALOGO, { servicioId: null, gradoId: null, cursoId: 2 }))
      .toEqual({ servicioId: 1000, gradoId: 100, cursoId: 2 });
  });

  it('un grado sin servicio recupera su servicio', () => {
    expect(completarFiltro(CATALOGO, { servicioId: null, gradoId: 101, cursoId: null }))
      .toEqual({ servicioId: 1000, gradoId: 101, cursoId: null });
  });

  it('una sección que no existe no inventa nada', () => {
    const f = { servicioId: null, gradoId: null, cursoId: 999 };
    expect(completarFiltro(CATALOGO, f)).toBe(f);
  });

  it('completado y normalizado, el enlace viejo sigue filtrando', () => {
    const f = normalizarFiltro(CATALOGO, P, completarFiltro(CATALOGO, { servicioId: null, gradoId: null, cursoId: 2 }));
    expect(seccionesDelFiltro(CATALOGO, P, f)).toEqual([2]);
  });

  it('una sección del año pasado se suelta en vez de filtrar a nadie a escondidas', () => {
    const f = normalizarFiltro(CATALOGO, P, completarFiltro(CATALOGO, { servicioId: null, gradoId: null, cursoId: 9 }));
    expect(f).toEqual(TODOS_LOS_CURSOS);
  });
});

describe('opcionesDelFiltro', () => {
  it('los niveles llevan la tanda: dos «Primaria» no se confunden', () => {
    const { servicios } = opcionesDelFiltro(CATALOGO, P, TODOS_LOS_CURSOS);
    expect(servicios.map((s) => s.etiqueta)).toEqual(['Primaria · Matutina', 'Primaria · Vespertina', 'Sala de tareas']);
  });

  it('los grados son los del nivel elegido y las secciones las del grado', () => {
    const o = opcionesDelFiltro(CATALOGO, P, { servicioId: 1000, gradoId: 100, cursoId: null });
    expect(o.grados.map((g) => g.id)).toEqual([100, 101]);
    expect(o.secciones.map((s) => s.id)).toEqual([1, 2]);
  });
});

describe('filtro en la URL', () => {
  it('ida y vuelta', () => {
    const f = { servicioId: 1000, gradoId: 100, cursoId: 2 };
    const url = new URLSearchParams(Object.entries(filtroAUrl(f)).filter(([, v]) => v != null) as [string, string][]);
    expect(filtroDeUrl(url)).toEqual(f);
  });

  it('lo que no es un id se ignora', () => {
    expect(filtroDeUrl(new URLSearchParams('servicio=abc&grado=-3&curso=0'))).toEqual(TODOS_LOS_CURSOS);
  });

  it('«Todos» no deja nada en la URL', () => {
    expect(filtroAUrl(TODOS_LOS_CURSOS)).toEqual({ servicio: null, grado: null, curso: null, sinGrado: null });
  });
});
