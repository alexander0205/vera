import { describe, it, expect } from 'vitest';
import { resolverTarifasEnMemoria, type ContextoTarifa, type PrecioConfigurado } from '@/lib/administracion-escolar/tarifas';
import { objetivoCubreCadena } from '@/lib/administracion-escolar/tarifa-lifecycle';
import { motivoParaNoCargar, seccionesDelObjetivo } from '@/lib/administracion-escolar/cargo-desde-tarifa';
import { deDondeSaleElPrecio } from '@/lib/administracion-escolar/precio-cargo-individual';
import { esGradoSinGrado, NOMBRE_SECCION_SIN_GRADO, NOMBRE_SIN_GRADO, textoDeCurso } from '@/lib/administracion-escolar/sin-grado';
import {
  acotarFiltro, contarAlumnos, cursoDeCadaAlumno, nombreDelGrupo, normalizarFiltro, opcionesDelFiltro, preguntasDelFiltro,
  seccionesDelFiltro, SIN_GRADO, TODOS_LOS_CURSOS, type CursoFiltrable,
} from '@/lib/administracion-escolar/filtro-curso';
import { filtroAUrl, filtroDeUrl } from '@/components/administracion-escolar/FiltroEstructura';
import { opcionesDeGrado } from '@/lib/administracion-escolar/facturar-lote';

/**
 * Lo que pidió Jelisa con Mis Pequeños Campeones (colegio 45, 30-10-2026):
 * Terapia, Almuerzo, Inglés y Reforzamiento no dependen del grado, y un alumno
 * de otro centro no tiene ninguno. El grado no debe limitar un concepto.
 */

const TERAPIA = 70;
const ctx: ContextoTarifa = {
  periodoId: 11, seccionId: 3, gradoId: 2, servicioId: 1,
  becaTipo: null, becaValor: null, estudianteId: 9, conceptoMensualidadId: null,
};
const precio = (objetivoTipo: string, objetivoId: number, montoCentavos: number, productId = 500): PrecioConfigurado =>
  ({ conceptoId: TERAPIA, objetivoTipo, objetivoId, montoCentavos, productId, cuotas: null });
const resolver = (precios: PrecioConfigurado[], c: ContextoTarifa = ctx, admiteBeca = false) =>
  resolverTarifasEnMemoria(precios, new Map([[TERAPIA, admiteBeca]]), c, [TERAPIA]).get(TERAPIA);

describe('precio de todo el colegio', () => {
  it('le sirve a cualquier alumno, esté en el grado que esté', () => {
    const t = resolver([precio('colegio', 45, 150000)]);
    expect(t).toMatchObject({ montoCentavos: 150000, origen: 'colegio', productId: 500, deTodoElColegio: true });
    expect(resolver([precio('colegio', 45, 150000)], { ...ctx, seccionId: 77, gradoId: 66, servicioId: 55 })?.montoCentavos).toBe(150000);
  });

  it('sin ningún precio en la cadena el concepto sigue sin tarifa', () => {
    expect(resolver([])).toBeUndefined();
    expect(resolver([precio('servicio', 999, 100000)])).toBeUndefined();
  });

  it('todo lo más específico gana sobre él', () => {
    const colegio = precio('colegio', 45, 150000);
    expect(resolver([colegio, precio('servicio', 1, 140000)])).toMatchObject({ montoCentavos: 140000, origen: 'servicio' });
    expect(resolver([colegio, precio('grado', 2, 130000)])).toMatchObject({ montoCentavos: 130000, origen: 'grado' });
    expect(resolver([colegio, precio('seccion', 3, 120000)])).toMatchObject({ montoCentavos: 120000, origen: 'seccion' });
    expect(resolver([colegio, precio('estudiante', 9, 110000)])).toMatchObject({ montoCentavos: 110000, origen: 'estudiante' });
    expect(resolver([colegio, precio('grado', 2, 130000)])?.deTodoElColegio).toBeUndefined();
  });

  it('el precio de otro servicio no le gana: se queda con el del colegio', () => {
    expect(resolver([precio('colegio', 45, 150000), precio('servicio', 999, 100000)]))
      .toMatchObject({ montoCentavos: 150000, origen: 'colegio' });
  });

  it('la beca descuenta sobre él y se sigue sabiendo de dónde salió', () => {
    const t = resolver([precio('colegio', 45, 150000)], { ...ctx, becaTipo: 'porcentaje', becaValor: 50 }, true);
    expect(t).toMatchObject({ montoCentavos: 75000, origen: 'beca', productId: 500, deTodoElColegio: true });
  });

  it('cubre la cadena de cualquiera al quitar otra tarifa', () => {
    expect(objetivoCubreCadena('colegio', 45, { seccionId: 3, gradoId: 2, servicioId: 1 })).toBe(true);
    // Los demás siguen mirando su id.
    expect(objetivoCubreCadena('servicio', 999, { seccionId: 3, gradoId: 2, servicioId: 1 })).toBe(false);
  });

  it('la fila abarca todas las secciones del año y se puede asignar', () => {
    const grados = [{ id: 2, servicioId: 1 }, { id: 8, servicioId: 7 }];
    const secciones = [{ id: 3, gradoId: 2 }, { id: 4, gradoId: 8 }];
    const ids = seccionesDelObjetivo({ tipo: 'colegio', id: 45 }, grados, secciones);
    expect(ids).toEqual([3, 4]);
    expect(motivoParaNoCargar({ montoCentavos: 150000, cursoIds: ids })).toBeNull();
    expect(motivoParaNoCargar({ montoCentavos: 150000, cursoIds: [] })).not.toBeNull();
  });

  it('se explica en la pantalla de cargo suelto', () => {
    expect(deDondeSaleElPrecio('colegio')).toBe('todo el colegio');
  });
});

describe('alumno sin grado', () => {
  it('reconoce el grado que crea el sistema, se escriba como se escriba', () => {
    expect(esGradoSinGrado(NOMBRE_SIN_GRADO)).toBe(true);
    expect(esGradoSinGrado('  sin grado ')).toBe(true);
    expect(esGradoSinGrado('Kinder')).toBe(false);
    expect(esGradoSinGrado(null)).toBe(false);
  });
});

describe('los filtros y quien no tiene grado', () => {
  const P = 11;
  const curso = (id: number, grado: string, gradoId: number, servicio: string, servicioId: number, seccion = 'A'): CursoFiltrable => ({
    id, nombre: seccion, gradoId, gradoNombre: grado, servicioId, servicioNombre: servicio, servicioTanda: null, periodoId: P,
  });
  const CATALOGO = [
    curso(1, 'Kinder', 10, 'Inicial', 100),
    curso(2, NOMBRE_SIN_GRADO, 11, 'Inicial', 100, NOMBRE_SECCION_SIN_GRADO),
    curso(3, NOMBRE_SIN_GRADO, 12, 'Otros Centros', 200, NOMBRE_SECCION_SIN_GRADO),
    { ...curso(4, NOMBRE_SIN_GRADO, 13, 'Otros Centros', 200, NOMBRE_SECCION_SIN_GRADO), periodoId: 9 },
  ];
  const matricula = (estudianteId: number, cursoId: number, grado: string, curso: string) =>
    ({ estudianteId, cursoId, curso, grado, servicio: 'Inicial', tanda: null });

  it('«Sin grado» trae las secciones de todos los servicios, solo de este año', () => {
    expect(seccionesDelFiltro(CATALOGO, P, SIN_GRADO)).toEqual([2, 3]);
  });

  it('sin nadie sin grado, la lista viene vacía y no se ensancha al colegio', () => {
    expect(seccionesDelFiltro([curso(1, 'Kinder', 10, 'Inicial', 100)], P, SIN_GRADO)).toEqual([]);
  });

  it('sobrevive a normalizar, y elegir un servicio lo suelta', () => {
    expect(normalizarFiltro(CATALOGO, P, SIN_GRADO)).toEqual(SIN_GRADO);
    expect(acotarFiltro(SIN_GRADO, 'servicio', 100)).toEqual({ servicioId: 100, gradoId: null, cursoId: null });
    expect(acotarFiltro(SIN_GRADO, 'servicio', null)).toEqual(TODOS_LOS_CURSOS);
  });

  it('se ofrece solo si este año hay alguno', () => {
    expect(opcionesDelFiltro(CATALOGO, P, TODOS_LOS_CURSOS).haySinGrado).toBe(true);
    expect(opcionesDelFiltro(CATALOGO, 9, TODOS_LOS_CURSOS).haySinGrado).toBe(true);
    expect(opcionesDelFiltro([curso(1, 'Kinder', 10, 'Inicial', 100)], P, TODOS_LOS_CURSOS).haySinGrado).toBe(false);
  });

  it('dentro de su servicio sale como un grado más', () => {
    const { grados } = opcionesDelFiltro(CATALOGO, P, { servicioId: 100, gradoId: null, cursoId: null });
    expect(grados.map((g) => g.nombre)).toEqual(['Kinder', NOMBRE_SIN_GRADO]);
  });

  it('va y vuelve por la URL, y quitarlo lo borra', () => {
    expect(filtroDeUrl(new URLSearchParams(new URLSearchParams({ sinGrado: filtroAUrl(SIN_GRADO).sinGrado! })))).toEqual(SIN_GRADO);
    expect(filtroAUrl(TODOS_LOS_CURSOS).sinGrado).toBeNull();
    expect(filtroDeUrl(new URLSearchParams('sinGrado=0'))).toEqual(TODOS_LOS_CURSOS);
  });

  it('Cobrar a un grupo lo ofrece con su número, sin confundirlo con todo el colegio', () => {
    const conteo = contarAlumnos(CATALOGO, P, [
      matricula(1, 1, 'Kinder', 'A'), matricula(2, 2, NOMBRE_SIN_GRADO, NOMBRE_SECCION_SIN_GRADO), matricula(3, 3, NOMBRE_SIN_GRADO, NOMBRE_SECCION_SIN_GRADO),
    ]);
    expect(conteo.sinGrado).toBe(2);
    const p = preguntasDelFiltro(CATALOGO, P, SIN_GRADO, conteo, true);
    const fila = p.grupos.find((g) => g.id === 'sin-grado');
    expect(fila).toMatchObject({ alumnos: 2, puesta: true, filtro: SIN_GRADO });
    expect(p.colegio.puesta).toBe(false);
    expect(p.afinar).toEqual([]);
    expect(preguntasDelFiltro([curso(1, 'Kinder', 10, 'Inicial', 100)], P, TODOS_LOS_CURSOS, null, false).grupos.some((g) => g.id === 'sin-grado')).toBe(false);
  });

  it('el servicio automático no sale dos veces', () => {
    const conServicio = [...CATALOGO, curso(5, NOMBRE_SIN_GRADO, 14, NOMBRE_SIN_GRADO, 300, NOMBRE_SECCION_SIN_GRADO)];
    const { grupos } = preguntasDelFiltro(conServicio, P, TODOS_LOS_CURSOS, null, false);
    expect(grupos.filter((g) => /sin grado/i.test(g.etiqueta)).map((g) => g.id)).toEqual(['sin-grado']);
    expect(seccionesDelFiltro(conServicio, P, SIN_GRADO)).toEqual([2, 3, 5]);
  });

  it('se lee «Sin grado» y no «Sin grado Sin sección»', () => {
    expect(textoDeCurso(NOMBRE_SIN_GRADO, NOMBRE_SECCION_SIN_GRADO)).toBe(NOMBRE_SIN_GRADO);
    expect(textoDeCurso('Kinder', 'A')).toBe('Kinder A');
    expect(textoDeCurso('Kinder', 'A', ' — ')).toBe('Kinder — A');
    expect(textoDeCurso(null, null)).toBe('');
    expect(nombreDelGrupo(CATALOGO, P, SIN_GRADO)).toBe('Alumnos sin grado');
    expect(cursoDeCadaAlumno([matricula(2, 2, NOMBRE_SIN_GRADO, NOMBRE_SECCION_SIN_GRADO)]).get(2)).toBe('Sin grado · Inicial');
  });

  it('Facturar por lote no repite «Sin grado · Sin grado»', () => {
    const alumno = (gradoId: number, grado: string, servicioId: number, servicio: string) =>
      ({ gradoId, grado, servicioId, servicio }) as Parameters<typeof opcionesDeGrado>[0][number];
    const op = opcionesDeGrado([
      alumno(10, 'Kinder', 100, 'Inicial'), alumno(14, NOMBRE_SIN_GRADO, 300, NOMBRE_SIN_GRADO), alumno(12, NOMBRE_SIN_GRADO, 200, 'Otros Centros'),
    ]).map((o) => o.etiqueta);
    expect(op).toContain(NOMBRE_SIN_GRADO);
    expect(op).toContain('Sin grado · Otros Centros');
    expect(op).toContain('Kinder · Inicial');
  });
});
