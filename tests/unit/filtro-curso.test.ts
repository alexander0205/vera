import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TODOS_LOS_CURSOS, acotarFiltro, contarAlumnos, cursoDeCadaAlumno, nombreDelGrupo, normalizarFiltro,
  opcionesDelFiltro, preguntasDelFiltro, seccionesDelFiltro,
  type CursoFiltrable, type FiltroGrupo, type MatriculaActiva,
} from '@/lib/administracion-escolar/filtro-curso';

/**
 * En «Cargo a varios alumnos» no se podía acotar a quién se le cobra.
 *
 * Al elegir un servicio con más de un grado —«Primaria», «Sala de tareas»— el
 * filtro se devolvía solo a «Todos los cursos»: la pantalla usaba el selector
 * de matricular, que solo sabe guardar UNA sección, y un servicio entero no
 * cabe en un id de sección. Solo se dejaba elegir el servicio que tenía un
 * único grado y una única sección. Con 146 alumnos en la lista, cobrarle a la
 * sala de tareas era repasarlos todos y marcar a mano.
 *
 * El colegio de abajo es inventado, con la misma forma que el del fallo: un
 * servicio de una sola sección (el que sí funcionaba), dos con varios grados
 * (los que no) y el mismo servicio repetido en el año anterior.
 */
const ESTE_ANIO = 900;
const ANIO_PASADO = 800;

const GUARDERIA = 10;
const PRIMARIA = 11;
const SALA_TAREAS = 12;
const PRIMARIA_VIEJA = 20;

function seccion(
  id: number, nombre: string,
  grado: [number, string],
  servicio: [number, string, string | null],
  periodoId = ESTE_ANIO,
): CursoFiltrable {
  return {
    id, nombre,
    gradoId: grado[0], gradoNombre: grado[1],
    servicioId: servicio[0], servicioNombre: servicio[1], servicioTanda: servicio[2],
    periodoId,
  };
}

const guarderia: [number, string, string | null] = [GUARDERIA, 'Guardería de Mentira', null];
const primaria: [number, string, string | null] = [PRIMARIA, 'Primaria de Mentira', 'Matutina'];
const salaTareas: [number, string, string | null] = [SALA_TAREAS, 'Sala de tareas de Mentira', null];
const primariaVieja: [number, string, string | null] = [PRIMARIA_VIEJA, 'Primaria de Mentira', 'Matutina'];

const CATALOGO: CursoFiltrable[] = [
  seccion(1000, 'Única', [100, 'Bebés'], guarderia),
  seccion(1100, 'A', [110, 'Primero'], primaria),
  seccion(1101, 'B', [110, 'Primero'], primaria),
  seccion(1110, 'A', [111, 'Segundo'], primaria),
  seccion(1200, 'Única', [120, 'Pequeños'], salaTareas),
  seccion(1210, 'Única', [121, 'Grandes'], salaTareas),
  seccion(2100, 'A', [210, 'Primero'], primariaVieja, ANIO_PASADO),
];

const filtro = (servicioId: number | null, gradoId: number | null = null, cursoId: number | null = null): FiltroGrupo =>
  ({ servicioId, gradoId, cursoId });

describe('seccionesDelFiltro: qué secciones entran', () => {
  it('«Todos los cursos» no acota: no hay lista que mandar', () => {
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, TODOS_LOS_CURSOS)).toBeNull();
  });

  it('un servicio con varios grados devuelve TODAS sus secciones — el caso que fallaba', () => {
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA))).toEqual([1100, 1101, 1110]);
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(SALA_TAREAS))).toEqual([1200, 1210]);
  });

  it('el servicio de una sola sección, que era el único que se dejaba elegir, sigue saliendo', () => {
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(GUARDERIA))).toEqual([1000]);
  });

  it('servicio y grado: todas las secciones de ese grado y ninguna de otro', () => {
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110))).toEqual([1100, 1101]);
  });

  it('una sección: solo ella', () => {
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110, 1101))).toEqual([1101]);
  });

  it('un servicio sin secciones da una lista vacía, que no es lo mismo que «todos»', () => {
    // La ruta de generar lee una lista vacía como «sin filtro»: si esto
    // devolviera null, o si la pantalla la mandara tal cual, un grupo sin
    // nadie le cobraría al colegio entero.
    const sinSecciones = seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(999));
    expect(sinSecciones).toEqual([]);
    expect(sinSecciones).not.toBeNull();
  });

  it('las secciones de otro año escolar no se cuelan', () => {
    // El filtro quedó apuntando al año pasado y ahora se mira este.
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA_VIEJA))).toEqual([]);
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA_VIEJA, 210, 2100))).toEqual([]);
    // Y al revés: mirando el año pasado solo sale lo del año pasado.
    expect(seccionesDelFiltro(CATALOGO, ANIO_PASADO, filtro(PRIMARIA_VIEJA))).toEqual([2100]);
    expect(seccionesDelFiltro(CATALOGO, ANIO_PASADO, filtro(PRIMARIA))).toEqual([]);
  });

  it('un grado que no es de ese servicio no encuentra a nadie, en vez de ensancharse', () => {
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 120))).toEqual([]);
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110, 1110))).toEqual([]);
  });

  it('sin año escolar elegido, un filtro puesto no encuentra a nadie', () => {
    expect(seccionesDelFiltro(CATALOGO, null, filtro(PRIMARIA))).toEqual([]);
  });
});

describe('acotarFiltro: lo elegido se queda elegido', () => {
  it('elegir un servicio con varios grados ya no se devuelve a «Todos los cursos»', () => {
    const elegido = acotarFiltro(TODOS_LOS_CURSOS, 'servicio', SALA_TAREAS);
    expect(elegido).toEqual(filtro(SALA_TAREAS));
    // Pasa por el catálogo sin perderse y basta para cobrarle a toda la sala.
    expect(normalizarFiltro(CATALOGO, ESTE_ANIO, elegido)).toEqual(filtro(SALA_TAREAS));
    expect(seccionesDelFiltro(CATALOGO, ESTE_ANIO, elegido)).toEqual([1200, 1210]);
  });

  it('elegir un grado conserva el servicio', () => {
    expect(acotarFiltro(filtro(PRIMARIA), 'grado', 111)).toEqual(filtro(PRIMARIA, 111));
  });

  it('elegir una sección conserva servicio y grado', () => {
    expect(acotarFiltro(filtro(PRIMARIA, 110), 'seccion', 1101)).toEqual(filtro(PRIMARIA, 110, 1101));
  });

  it('cambiar de servicio limpia grado y sección', () => {
    expect(acotarFiltro(filtro(PRIMARIA, 110, 1101), 'servicio', SALA_TAREAS)).toEqual(filtro(SALA_TAREAS));
  });

  it('cambiar de grado limpia la sección', () => {
    expect(acotarFiltro(filtro(PRIMARIA, 110, 1101), 'grado', 111)).toEqual(filtro(PRIMARIA, 111));
  });

  it('«Todos» en grado vuelve a todo el servicio y «Todas» en sección a todo el grado', () => {
    expect(acotarFiltro(filtro(PRIMARIA, 110, 1101), 'grado', null)).toEqual(filtro(PRIMARIA));
    expect(acotarFiltro(filtro(PRIMARIA, 110, 1101), 'seccion', null)).toEqual(filtro(PRIMARIA, 110));
  });

  it('«Todos los cursos» lo suelta todo', () => {
    expect(acotarFiltro(filtro(PRIMARIA, 110, 1101), 'servicio', null)).toEqual(TODOS_LOS_CURSOS);
  });
});

describe('normalizarFiltro: los desplegables enseñan lo que de verdad se filtra', () => {
  it('cada nivel es un filtro válido y se deja como está', () => {
    for (const f of [TODOS_LOS_CURSOS, filtro(PRIMARIA), filtro(PRIMARIA, 110), filtro(PRIMARIA, 110, 1101)]) {
      expect(normalizarFiltro(CATALOGO, ESTE_ANIO, f)).toEqual(f);
    }
  });

  it('al cambiar de año escolar vuelve a «Todos los cursos»', () => {
    expect(normalizarFiltro(CATALOGO, ANIO_PASADO, filtro(PRIMARIA, 110, 1101))).toEqual(TODOS_LOS_CURSOS);
    expect(normalizarFiltro(CATALOGO, null, filtro(PRIMARIA))).toEqual(TODOS_LOS_CURSOS);
  });

  it('si el grado ya no está, se queda en el servicio', () => {
    expect(normalizarFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 999, 1101))).toEqual(filtro(PRIMARIA));
  });

  it('si la sección ya no está, se queda en el grado', () => {
    expect(normalizarFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110, 1110))).toEqual(filtro(PRIMARIA, 110));
  });

  it('nunca deja un grado sin servicio ni una sección sin grado', () => {
    expect(normalizarFiltro(CATALOGO, ESTE_ANIO, filtro(null, 110, 1101))).toEqual(TODOS_LOS_CURSOS);
    expect(normalizarFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, null, 1101))).toEqual(filtro(PRIMARIA));
  });
});

describe('opcionesDelFiltro: qué ofrece cada desplegable', () => {
  it('sin acotar: los servicios de este año y nada más', () => {
    const o = opcionesDelFiltro(CATALOGO, ESTE_ANIO, TODOS_LOS_CURSOS);
    expect(o.servicios.map((s) => s.id)).toEqual([GUARDERIA, PRIMARIA, SALA_TAREAS]);
    expect(o.grados).toEqual([]);
    expect(o.secciones).toEqual([]);
  });

  it('la tanda va en la etiqueta del servicio', () => {
    const o = opcionesDelFiltro(CATALOGO, ESTE_ANIO, TODOS_LOS_CURSOS);
    expect(o.servicios.map((s) => s.etiqueta)).toEqual([
      'Guardería de Mentira', 'Primaria de Mentira · Matutina', 'Sala de tareas de Mentira',
    ]);
  });

  it('con el servicio: sus grados, una vez cada uno, y todavía ninguna sección', () => {
    const o = opcionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA));
    expect(o.grados).toEqual([{ id: 110, nombre: 'Primero' }, { id: 111, nombre: 'Segundo' }]);
    expect(o.secciones).toEqual([]);
  });

  it('con el grado: sus secciones', () => {
    const o = opcionesDelFiltro(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110));
    expect(o.secciones).toEqual([{ id: 1100, nombre: 'A' }, { id: 1101, nombre: 'B' }]);
  });

  it('no ofrece los servicios de otro año escolar', () => {
    expect(opcionesDelFiltro(CATALOGO, ANIO_PASADO, TODOS_LOS_CURSOS).servicios.map((s) => s.id))
      .toEqual([PRIMARIA_VIEJA]);
    expect(opcionesDelFiltro(CATALOGO, null, TODOS_LOS_CURSOS).servicios).toEqual([]);
  });
});

describe('nombreDelGrupo: cómo se le dice al usuario', () => {
  it('sin acotar no hay grupo que nombrar', () => {
    expect(nombreDelGrupo(CATALOGO, ESTE_ANIO, TODOS_LOS_CURSOS)).toBeNull();
  });

  it('nombra el servicio, el grado o la sección según hasta dónde se acotó', () => {
    expect(nombreDelGrupo(CATALOGO, ESTE_ANIO, filtro(SALA_TAREAS))).toBe('Sala de tareas de Mentira');
    expect(nombreDelGrupo(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110))).toBe('Primero de Primaria de Mentira · Matutina');
    expect(nombreDelGrupo(CATALOGO, ESTE_ANIO, filtro(PRIMARIA, 110, 1101))).toBe('Primero B de Primaria de Mentira · Matutina');
  });

  it('un filtro que no apunta a nada de este año no tiene nombre', () => {
    expect(nombreDelGrupo(CATALOGO, ESTE_ANIO, filtro(PRIMARIA_VIEJA))).toBeNull();
  });
});

/**
 * Lo que no se puede ejecutar sin navegador se comprueba leyendo el código,
 * como en `cargos-filtro-por-concepto.test.ts`.
 */
const raiz = join(__dirname, '..', '..');
const lee = (p: string) => readFileSync(join(raiz, p), 'utf8');

const pantalla = lee('app/escolar/cargos/lote/_page-client.tsx');
const componente = lee('components/administracion-escolar/FiltroCurso.tsx');
const selectorMatricular = lee('components/administracion-escolar/SelectorCurso.tsx');

describe('la pantalla de cargo a varios alumnos usa el grupo elegido', () => {
  it('filtra con su propio control, no con el selector de matricular', () => {
    expect(pantalla).toContain('<FiltroCurso');
    expect(pantalla).not.toContain('SelectorCurso');
  });

  it('manda al servidor las secciones del grupo, y nada si es «Todos los cursos»', () => {
    expect(pantalla).toMatch(/secciones === null \? \{\} : \{ cursoIds: secciones \}/);
    // El `cursoId` suelto solo alcanzaba para una sección.
    expect(pantalla).not.toMatch(/\bcursoId:/);
  });

  it('ofrece solo lo activo, pero cuenta también las secciones desactivadas del grupo', () => {
    // Una sección se puede desactivar con alumnos dentro. Siguen siendo de su
    // servicio: si la lista saliera solo de las activas, aparecerían en «Todos
    // los cursos» y en ningún servicio.
    expect(pantalla).toMatch(/normalizarFiltro\(cursosActivos, periodoNum, form\.grupo\)/);
    expect(pantalla).toMatch(/seccionesDelFiltro\(cursos, periodoNum, grupo\)/);
  });

  it('un grupo sin secciones no se le pregunta al servidor, que lo leería como «todos»', () => {
    expect(pantalla).toMatch(/if \(secciones\?\.length === 0\)/);
  });

  it('cambiar el filtro invalida la revisión', () => {
    // Y deja dicho que se eligió: nadie viene elegido de entrada, así que
    // «todo el colegio» solo vale si la persona lo tocó.
    expect(pantalla).toContain(
      "onChange={(elegido) => { limpiarRevision(); setForm((f) => ({ ...f, grupo: elegido, quien: 'grupo' })); }}",
    );
  });

  it('cambiar de año escolar vuelve a «Todos los cursos»', () => {
    expect(pantalla).toMatch(/periodoId: e\.target\.value,\s*grupo: TODOS_LOS_CURSOS,/);
    // …y deja el grupo SIN CONTESTAR, no en todo el colegio: el grupo de antes
    // era de otro año y hay que volver a decir a quién.
    expect(pantalla).toMatch(/periodoId: e\.target\.value,\s*grupo: TODOS_LOS_CURSOS,\s*quien: null,/);
  });

  it('un grupo sin matriculados lo dice, en vez de una lista vacía muda', () => {
    expect(pantalla).toMatch(/revision\.total === 0/);
    expect(pantalla).toContain('No hay nadie matriculado en');
  });
});

describe('lo elegido no se mueve solo', () => {
  it('traer un producto como concepto no recarga los catálogos', () => {
    // La recarga devolvía el período al año en curso, y con el período se caía
    // el grupo: quien cobraba la reinscripción de «Primaria de Mentira» del año
    // que viene acababa revisando el colegio entero de este año.
    expect(pantalla).not.toMatch(/onConceptoCreado=\{\(\) => void cargarCatalogos\(\)\}/);
    expect(pantalla).toMatch(/onConceptoCreado=\{\(creado\) => setConceptos\(/);
    // Los catálogos se cargan al entrar y nada más.
    expect(pantalla.match(/cargarCatalogos\(\)/g)).toHaveLength(1);
  });

  it('cargar los catálogos no pisa un período ya elegido', () => {
    expect(pantalla).toMatch(/setForm\(\(f\) => \(f\.periodoId \? f : \{/);
    // La línea que lo reponía siempre.
    expect(pantalla).not.toMatch(/periodoId: activo \? String\(activo\.id\) : f\.periodoId/);
  });
});

describe('la lista que se ve es la del grupo que se ve', () => {
  it('la respuesta de una revisión que se quedó vieja no se pinta', () => {
    // Cambiar cualquier dato adelanta la cuenta…
    expect(pantalla).toMatch(/const limpiarRevision = useCallback\(\(\) => \{\s*revisionPedida\.current \+= 1;/);
    // …y revisar la apunta ANTES de preguntar y la compara ANTES de pintar. El
    // orden es lo que importa: comparada después, la lista vieja ya estaría
    // en pantalla bajo un desplegable que dice otra cosa.
    const revisar = pantalla.slice(pantalla.indexOf('async function revisar()'), pantalla.indexOf('async function crear()'));
    const apunta = revisar.indexOf('const estaVez = revisionPedida.current;');
    const pregunta = revisar.indexOf('await fetch(');
    const descarta = revisar.indexOf('if (estaVez !== revisionPedida.current) return;');
    const pinta = revisar.indexOf('setRevision({ ...(data as Generacion)');
    expect(apunta).toBeGreaterThan(-1);
    expect(pregunta).toBeGreaterThan(apunta);
    expect(descarta).toBeGreaterThan(pregunta);
    expect(pinta).toBeGreaterThan(descarta);
  });

  it('la revisión guarda el grupo por el que se preguntó', () => {
    // Con el nombre de ese momento, igual que el resumen de lo creado guarda
    // el concepto y el monto: no depende de lo que marquen después los
    // desplegables.
    // Y ahora también el pedido exacto que se mandó: de él salen la frase de
    // cobrar y lo que se crea.
    expect(pantalla).toContain('setRevision({ ...(data as Generacion), grupo: grupoNombre, pedido })');
    expect(pantalla).toContain('detalles: [], grupo: grupoNombre, pedido })');
  });

  it('la frase de cobrar sale de lo revisado, no del formulario', () => {
    // Antes la lista decía «Grupo: …» arriba y junto al botón. Ahora lo dice
    // una frase entera, y lo que protege esta prueba es lo mismo: que el grupo
    // (y el monto, y el cobro) que se LEE sea el de la revisión y no el que
    // marquen los campos en ese momento.
    const desde = pantalla.indexOf('const frase = revision ? fraseDelCobro({');
    expect(desde).toBeGreaterThan(-1);
    const frase = pantalla.slice(desde, pantalla.indexOf('}) : null;', desde));
    expect(frase).toContain('grupo: revision.grupo,');
    expect(frase).toContain('marcados: seleccion.size,');
    expect(frase).not.toContain('form.');
    // La barra de cobrar y el diálogo de confirmar pintan ese mismo objeto.
    expect(pantalla).toContain('{frase.principal}');
    expect(pantalla).toContain('frase={frase}');
  });

  it('el aviso de grupo vacío nombra el grupo que se revisó', () => {
    expect(pantalla).toContain('`No hay nadie matriculado en «${revision.grupo}»`');
  });

  it('el aviso de grupo vacío no se pinta como el panel de espera', () => {
    // Con el mismo icono gris y la misma letra parecía que «Revisar» no había
    // hecho nada.
    const desde = pantalla.indexOf('revision.total === 0');
    expect(desde).toBeGreaterThan(-1);
    const aviso = pantalla.slice(desde, pantalla.indexOf('`No hay nadie matriculado en'));
    expect(aviso.length).toBeGreaterThan(0);
    expect(aviso).toContain('amber');
    expect(aviso).not.toContain('text-gray-300');
    // Ya no hay panel donde centrarlo: va en el paso 2, encima de «Continuar»,
    // y se anuncia solo al lector de pantalla.
    expect(aviso).toContain('role="alert"');
  });
});

describe('el filtro no tiene estados a medias', () => {
  it('no guarda nada por su cuenta: lo que enseña es lo que le pasan', () => {
    // El fallo vivía en el «tanteo»: servicio y grado guardados dentro del
    // control mientras no hubiera sección, y descartados al primer render.
    expect(componente).not.toMatch(/useState|useEffect/);
  });

  it('ya no son desplegables: una lista de opciones a la vista, y qué preguntar lo decide la función pura', () => {
    // Eran tres <select> con «Todos los cursos», «Todos» y «Todas» de primera
    // opción. La regla de que la primera opción es el nivel de arriba entero
    // sigue en pie, pero ahora vive en `preguntasDelFiltro` (probada abajo); el
    // componente solo pinta lo que ella devuelve.
    expect(componente).toContain('type="radio"');
    expect(componente).toContain('aria-pressed');
    expect(componente).toContain('preguntasDelFiltro(');
    expect(componente).not.toContain('<select');
    expect(componente).not.toContain('NativeSelect');
  });

  it('todas las opciones se ven y ninguna se apaga', () => {
    // Los desplegables de grado y sección salían apagados hasta elegir el
    // nivel de arriba, sin decir por qué. Lo que no aplica ya no se pinta.
    expect(componente).not.toContain('disabled={disabled ||');
    expect(componente).not.toMatch(/\bdisabled\b/);
  });
});

/**
 * Los números que acompañan a cada grupo («Sala de tareas · 5 alumnos») salen
 * de las matrículas activas. Los alumnos de abajo son inventados.
 */
function matricula(
  estudianteId: number, cursoId: number | null,
  curso: string | null = null, grado: string | null = null,
  servicio: string | null = null, tanda: string | null = null,
): MatriculaActiva {
  return { estudianteId, cursoId, curso, grado, servicio, tanda };
}

// Segundo B existe pero el colegio la desactivó con un alumno dentro: no se
// ofrece para elegir, y aun así su alumno sigue siendo de Primaria.
const SEGUNDO_B_DESACTIVADA = seccion(1111, 'B', [111, 'Segundo'], primaria);
const CATALOGO_ENTERO: CursoFiltrable[] = [...CATALOGO, SEGUNDO_B_DESACTIVADA];

const MATRICULAS: MatriculaActiva[] = [
  matricula(1, 1000, 'Única', 'Bebés', 'Guardería de Mentira'),
  matricula(2, 1100, 'A', 'Primero', 'Primaria de Mentira', 'Matutina'),
  matricula(3, 1100, 'A', 'Primero', 'Primaria de Mentira', 'Matutina'),
  matricula(4, 1101, 'B', 'Primero', 'Primaria de Mentira', 'Matutina'),
  matricula(5, 1110, 'A', 'Segundo', 'Primaria de Mentira', 'Matutina'),
  matricula(6, 1111, 'B', 'Segundo', 'Primaria de Mentira', 'Matutina'),
  matricula(7, 1200, 'Única', 'Pequeños', 'Sala de tareas de Mentira'),
];

describe('contarAlumnos: cuántos hay en cada grupo', () => {
  it('cuenta por servicio, por grado y por sección', () => {
    const c = contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, MATRICULAS);
    expect(c.total).toBe(7);
    expect(c.porServicio).toEqual({ [GUARDERIA]: 1, [PRIMARIA]: 5, [SALA_TAREAS]: 1 });
    expect(c.porGrado).toEqual({ 100: 1, 110: 3, 111: 2, 120: 1 });
    expect(c.porSeccion).toEqual({ 1000: 1, 1100: 2, 1101: 1, 1110: 1, 1111: 1, 1200: 1 });
  });

  it('el alumno de una sección desactivada cuenta en su servicio', () => {
    // Por eso se cruza con el catálogo ENTERO, igual que `seccionesDelFiltro`:
    // a ese alumno se le va a cobrar al elegir «Primaria», y el número de la
    // fila tiene que contarlo.
    expect(contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, MATRICULAS).porServicio[PRIMARIA]).toBe(5);
    // Con solo las activas se quedaría fuera de Primaria (y dentro del total).
    const soloActivas = contarAlumnos(CATALOGO, ESTE_ANIO, MATRICULAS);
    expect(soloActivas.porServicio[PRIMARIA]).toBe(4);
    expect(soloActivas.total).toBe(7);
  });

  it('una matrícula colgada de una sección de otro año no suma en ningún grupo de este', () => {
    const c = contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, [
      matricula(1, 1100), matricula(2, 2100), matricula(3, null),
    ]);
    expect(c.porServicio).toEqual({ [PRIMARIA]: 1 });
    expect(c.porGrado).toEqual({ 110: 1 });
    expect(c.porSeccion).toEqual({ 1100: 1 });
    // Sí en el total, que es lo que ve el servidor al cobrarle a todo el colegio.
    expect(c.total).toBe(3);
  });

  it('un alumno repetido cuenta una vez', () => {
    const c = contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, [
      matricula(1, 1100), matricula(1, 1100), matricula(1, 1101), matricula(2, 1110),
    ]);
    expect(c.total).toBe(2);
    expect(c.porServicio[PRIMARIA]).toBe(2);
    expect(c.porGrado[110]).toBe(1);
    expect(c.porSeccion).toEqual({ 1100: 1, 1101: 1, 1110: 1 });
  });

  it('sin matrículas todo queda en cero, sin grupos', () => {
    expect(contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, [])).toEqual({
      total: 0, porServicio: {}, porGrado: {}, porSeccion: {},
    });
  });
});

describe('cursoDeCadaAlumno: lo que se lee bajo cada nombre', () => {
  const cursosDe = cursoDeCadaAlumno([
    ...MATRICULAS,
    matricula(8, null),
    // La segunda matrícula del mismo alumno no pisa la primera.
    matricula(2, 1200, 'Única', 'Pequeños', 'Sala de tareas de Mentira'),
  ]);

  it('grado, sección, servicio y tanda, como se dice en el colegio', () => {
    expect(cursosDe.get(2)).toBe('Primero A · Primaria de Mentira · Matutina');
  });

  it('sin tanda no deja un punto colgando', () => {
    expect(cursosDe.get(7)).toBe('Pequeños Única · Sala de tareas de Mentira');
  });

  it('vacío si la matrícula no tiene sección', () => {
    expect(cursosDe.get(8)).toBe('');
  });

  it('de quien no está matriculado no dice nada', () => {
    expect(cursosDe.has(999)).toBe(false);
  });
});

describe('preguntasDelFiltro: lo que se le enseña para elegir a quién', () => {
  const conteo = contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, MATRICULAS);
  const preguntas = (f: FiltroGrupo, elegido = true, c: typeof conteo | null = conteo) =>
    preguntasDelFiltro(CATALOGO, ESTE_ANIO, f, c, elegido);

  it('un grupo por servicio del año, con su tanda y su número de alumnos', () => {
    const { grupos, colegio } = preguntas(TODOS_LOS_CURSOS, false);
    expect(grupos.map((g) => [g.etiqueta, g.alumnos])).toEqual([
      ['Guardería de Mentira', 1],
      ['Primaria de Mentira · Matutina', 5],
      ['Sala de tareas de Mentira', 1],
    ]);
    expect(grupos.map((g) => g.filtro)).toEqual([filtro(GUARDERIA), filtro(PRIMARIA), filtro(SALA_TAREAS)]);
    expect(colegio.etiqueta).toBe('Todo el colegio');
    expect(colegio.alumnos).toBe(7);
    expect(colegio.filtro).toEqual(TODOS_LOS_CURSOS);
  });

  it('nadie viene elegido: sin haber elegido no hay nada puesto, ni «todo el colegio»', () => {
    // El filtro vacío ES «todo el colegio»; lo que lo distingue de «todavía no
    // ha dicho nada» es `elegido`. Sin él, bastaba no tocar nada para cobrarle
    // a los 146.
    const { grupos, colegio, afinar } = preguntas(TODOS_LOS_CURSOS, false);
    expect(grupos.some((g) => g.puesta)).toBe(false);
    expect(colegio.puesta).toBe(false);
    expect(afinar).toEqual([]);
    // Ni aunque el filtro guardado apunte a un servicio.
    const conFiltro = preguntas(filtro(PRIMARIA, 110), false);
    expect(conFiltro.grupos.some((g) => g.puesta)).toBe(false);
    expect(conFiltro.afinar).toEqual([]);
  });

  it('con «todo el colegio» elegido solo él está puesto, y no pregunta nada más', () => {
    const { grupos, colegio, afinar } = preguntas(TODOS_LOS_CURSOS);
    expect(colegio.puesta).toBe(true);
    expect(grupos.some((g) => g.puesta)).toBe(false);
    expect(afinar).toEqual([]);
  });

  it('un servicio de una sola sección no pregunta nada', () => {
    const { grupos, colegio, afinar } = preguntas(filtro(GUARDERIA));
    expect(grupos.filter((g) => g.puesta).map((g) => g.etiqueta)).toEqual(['Guardería de Mentira']);
    expect(colegio.puesta).toBe(false);
    expect(afinar).toEqual([]);
  });

  it('un servicio con varios grados pregunta el curso, y la primera opción es el servicio entero', () => {
    const { afinar } = preguntas(filtro(PRIMARIA));
    expect(afinar).toHaveLength(1);
    expect(afinar[0].id).toBe('curso');
    expect(afinar[0].pregunta).toBe('¿A todo «Primaria de Mentira · Matutina» o solo a un curso?');
    expect(afinar[0].opciones.map((o) => [o.etiqueta, o.alumnos, o.puesta])).toEqual([
      ['Todo', 5, true],
      ['Primero', 3, false],
      ['Segundo', 2, false],
    ]);
    expect(afinar[0].opciones.map((o) => o.filtro)).toEqual([
      filtro(PRIMARIA), filtro(PRIMARIA, 110), filtro(PRIMARIA, 111),
    ]);
  });

  it('con un grado de dos secciones pregunta también la sección, y la primera opción es el grado entero', () => {
    const { afinar } = preguntas(filtro(PRIMARIA, 110));
    expect(afinar.map((p) => p.id)).toEqual(['curso', 'seccion']);
    // Arriba queda puesto el grado, ya no «Todo».
    expect(afinar[0].opciones.filter((o) => o.puesta).map((o) => o.etiqueta)).toEqual(['Primero']);
    expect(afinar[1].pregunta).toBe('¿A todo Primero o solo a una sección?');
    expect(afinar[1].opciones.map((o) => [o.etiqueta, o.alumnos, o.puesta])).toEqual([
      ['Todo Primero', 3, true],
      ['Primero A', 2, false],
      ['Primero B', 1, false],
    ]);
    expect(afinar[1].opciones.map((o) => o.filtro)).toEqual([
      filtro(PRIMARIA, 110), filtro(PRIMARIA, 110, 1100), filtro(PRIMARIA, 110, 1101),
    ]);
    // Con la sección elegida, la puesta es ella.
    const conSeccion = preguntas(filtro(PRIMARIA, 110, 1101)).afinar[1];
    expect(conSeccion.opciones.filter((o) => o.puesta).map((o) => o.etiqueta)).toEqual(['Primero B']);
  });

  it('un grado de una sola sección no pregunta la sección', () => {
    // Segundo solo ofrece la A (la B está desactivada y no se ofrece).
    expect(preguntas(filtro(PRIMARIA, 111)).afinar.map((p) => p.id)).toEqual(['curso']);
    // Y la sala de tareas, con dos grados de una sección cada uno, solo el curso.
    const sala = preguntas(filtro(SALA_TAREAS)).afinar;
    expect(sala.map((p) => p.id)).toEqual(['curso']);
    expect(sala[0].opciones.map((o) => o.etiqueta)).toEqual(['Todo', 'Pequeños', 'Grandes']);
  });

  it('un servicio con un solo grado y varias secciones hace UNA pregunta, y elegir sección fija grado y sección', () => {
    const TALLER = 13;
    const taller: [number, string, string | null] = [TALLER, 'Taller de Mentira', null];
    const conTaller = [
      ...CATALOGO,
      seccion(1300, 'A', [130, 'Único'], taller),
      seccion(1301, 'B', [130, 'Único'], taller),
    ];
    const { afinar } = preguntasDelFiltro(conTaller, ESTE_ANIO, filtro(TALLER), null, true);
    expect(afinar).toHaveLength(1);
    expect(afinar[0].id).toBe('unico');
    expect(afinar[0].pregunta).toBe('¿A todo «Taller de Mentira» o solo a una sección?');
    expect(afinar[0].opciones.map((o) => [o.etiqueta, o.puesta])).toEqual([
      ['Todo', true], ['Único A', false], ['Único B', false],
    ]);
    expect(afinar[0].opciones.map((o) => o.filtro)).toEqual([
      filtro(TALLER), filtro(TALLER, 130, 1300), filtro(TALLER, 130, 1301),
    ]);
    // Elegida la B, la puesta es ella y «Todo» deja de estarlo.
    const conB = preguntasDelFiltro(conTaller, ESTE_ANIO, filtro(TALLER, 130, 1301), null, true).afinar[0];
    expect(conB.opciones.filter((o) => o.puesta).map((o) => o.etiqueta)).toEqual(['Único B']);
  });

  it('si no se pudo contar, ninguna opción lleva número', () => {
    const { grupos, colegio, afinar } = preguntas(filtro(PRIMARIA, 110), true, null);
    const todas = [...grupos, colegio, ...afinar.flatMap((p) => p.opciones)];
    expect(todas.length).toBeGreaterThan(5);
    expect(todas.every((o) => o.alumnos === null)).toBe(true);
  });

  it('un grupo sin alumnos dice cero, que no es lo mismo que no saberlo', () => {
    const sinNadie = contarAlumnos(CATALOGO_ENTERO, ESTE_ANIO, [matricula(1, 1000)]);
    const { grupos } = preguntas(TODOS_LOS_CURSOS, false, sinNadie);
    expect(grupos.map((g) => g.alumnos)).toEqual([1, 0, 0]);
  });

  it('el filtro de cada opción da las secciones que promete su etiqueta', () => {
    const secciones = (f: FiltroGrupo) => seccionesDelFiltro(CATALOGO, ESTE_ANIO, f);
    const { grupos, colegio, afinar } = preguntas(filtro(PRIMARIA, 110));
    expect(secciones(colegio.filtro)).toBeNull();
    expect(grupos.map((g) => secciones(g.filtro))).toEqual([[1000], [1100, 1101, 1110], [1200, 1210]]);
    expect(afinar[0].opciones.map((o) => secciones(o.filtro))).toEqual([
      [1100, 1101, 1110], [1100, 1101], [1110],
    ]);
    expect(afinar[1].opciones.map((o) => secciones(o.filtro))).toEqual([
      [1100, 1101], [1100], [1101],
    ]);
    // Y todas pasan por el catálogo sin perderse.
    for (const o of [...grupos, ...afinar.flatMap((p) => p.opciones)]) {
      expect(normalizarFiltro(CATALOGO, ESTE_ANIO, o.filtro)).toEqual(o.filtro);
    }
  });

  it('no ofrece los servicios de otro año escolar', () => {
    const viejo = preguntasDelFiltro(CATALOGO, ANIO_PASADO, TODOS_LOS_CURSOS, null, false);
    expect(viejo.grupos.map((g) => g.filtro)).toEqual([filtro(PRIMARIA_VIEJA)]);
  });
});

describe('el selector de matricular vuelve a servir solo para matricular', () => {
  it('ya no tiene el modo filtro que se le añadió encima', () => {
    expect(selectorMatricular).not.toContain('permitirTodos');
    expect(selectorMatricular).not.toContain("'todos'");
  });

  it('sigue pidiendo exactamente una sección', () => {
    expect(selectorMatricular).toContain('<Label>Sección *</Label>');
    expect(selectorMatricular).toContain("onChange={(e) => onChange(e.target.value)}");
  });
});

describe('la ruta que crea los cargos no ensancha una lista vacía', () => {
  it('cursoIds: [] devuelve nadie, no el colegio entero', async () => {
    const { readFileSync } = await import('node:fs');
    const ruta = readFileSync('app/api/administracion-escolar/cargos/generar/route.ts', 'utf8');
    // El fallo que se cierra: con la lista vacía no se añadía ningún filtro de
    // sección y la consulta devolvía a todos los matriculados del período.
    expect(ruta).toMatch(/Array\.isArray\(cursoIds\) && cursos\.length === 0/);
    const corte = ruta.indexOf('Array.isArray(cursoIds) && cursos.length === 0');
    expect(ruta.slice(corte, corte + 200)).toContain('detalles: []');
  });
});
