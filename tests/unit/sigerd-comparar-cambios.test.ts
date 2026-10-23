import { describe, it, expect } from 'vitest';
import {
  compararConSigerd, type AlumnoZero, type CursoZero, type DatosZero,
} from '@/lib/sigerd/comparar-cambios';
import type { ArbolCentro } from '@/lib/sigerd/sync';

/**
 * «Revisar cambios de SIGERD»: la comparación entre la última descarga y Zero.
 * Es lógica pura, así que se prueba con un colegio inventado:
 *
 *   Primario
 *     Primero  ── A (sec. 101): alumnos 1, 2, 3
 *              └─ B (sec. 102): alumnos 4, 5
 *     Segundo  ── A (sec. 111): alumno 6
 *
 * Todos los ids y nombres son ficticios.
 */

type SeccionIn = { idSeccion: number; nombre: string; ids: number[]; error?: string };

function arbol(grados: Array<{ nombre: string; secciones: SeccionIn[] }>): ArbolCentro {
  return {
    idCentro: 1, idRegional: 1, idDistrito: 1, anoAcademico: 24,
    servicios: [{
      idServicio: 1, nombre: 'Primario',
      grados: grados.map((g, i) => ({
        idGrado: 10 + i, nombre: g.nombre,
        secciones: g.secciones.map((s) => ({
          idSeccion: s.idSeccion, nombre: s.nombre, tope: null, error: s.error,
          estudiantes: s.ids.map((id) => ({ id, nombre: `ALUMNO ${id}` })),
        })),
      })),
    }],
    totales: { servicios: 1, grados: grados.length, secciones: 0, estudiantes: 0, seccionesConError: 0 },
  };
}

const BASE = arbol([
  { nombre: 'Primero', secciones: [
    { idSeccion: 101, nombre: 'A', ids: [1, 2, 3] },
    { idSeccion: 102, nombre: 'B', ids: [4, 5] },
  ] },
  { nombre: 'Segundo', secciones: [{ idSeccion: 111, nombre: 'A', ids: [6] }] },
]);

const CURSOS: CursoZero[] = [
  { id: 1, nombre: 'A', etiqueta: 'Primero — A', sigerdSeccionId: 101 },
  { id: 2, nombre: 'B', etiqueta: 'Primero — B', sigerdSeccionId: 102 },
  { id: 3, nombre: 'A', etiqueta: 'Segundo — A', sigerdSeccionId: 111 },
];

/** Un alumno de Zero matriculado en el curso `cursoId` (1, 2 o 3 de CURSOS). */
function alumno(id: number, sigerdId: number | null, cursoId: number | null, extra: Partial<AlumnoZero> = {}): AlumnoZero {
  const curso = CURSOS.find((c) => c.id === cursoId);
  return {
    id, nombre: `ZERO ${id}`, estado: 'activo', sigerdId, codigoRne: null,
    matricula: curso ? { id: 500 + id, cursoId: curso.id, cursoEtiqueta: curso.etiqueta, cursoSigerdSeccionId: curso.sigerdSeccionId } : null,
    ...extra,
  };
}

/** Zero con los seis alumnos de SIGERD en su sección correcta. */
function zeroAlDia(): AlumnoZero[] {
  return [
    alumno(1, 1, 1), alumno(2, 2, 1), alumno(3, 3, 1),
    alumno(4, 4, 2), alumno(5, 5, 2),
    alumno(6, 6, 3),
  ];
}

const cmp = (zero: Partial<DatosZero> = {}, a: ArbolCentro = BASE, opciones = {}) =>
  compararConSigerd(a, { alumnos: zeroAlDia(), cursos: CURSOS, ...zero }, opciones);

describe('compararConSigerd — sin diferencias', () => {
  it('Zero y SIGERD iguales: cinco listas vacías', () => {
    const r = cmp();
    expect(r.nuevos).toEqual([]);
    expect(r.yaNoEstan).toEqual([]);
    expect(r.cambiaronDeSeccion).toEqual([]);
    expect(r.seccionesNuevas).toEqual([]);
    expect(r.seccionesRenombradas).toEqual([]);
    expect(r.seccionesConError).toEqual([]);
    expect(r.totales).toEqual({ enSigerd: 6, emparejados: 6, porRne: 0, enCursoSinEnlace: 0 });
  });
});

describe('nuevos', () => {
  it('un alumno de SIGERD sin ficha en Zero es nuevo, con su ubicación', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [1, 2, 3, 7] },
      { idSeccion: 102, nombre: 'B', ids: [4, 5] },
    ] }, { nombre: 'Segundo', secciones: [{ idSeccion: 111, nombre: 'A', ids: [6] }] }]);
    const r = cmp({}, a);
    expect(r.nuevos).toEqual([{ idSigerd: 7, nombre: 'ALUMNO 7', ubicacion: 'Primario · Primero · A' }]);
  });

  it('un alumno retirado en Zero que SIGERD todavía lista NO es nuevo: ya tiene ficha', () => {
    const zero = zeroAlDia().map((e) => (e.id === 3 ? { ...e, estado: 'retirado', matricula: null } : e));
    const r = cmp({ alumnos: zero });
    expect(r.nuevos).toEqual([]);
    expect(r.yaNoEstan).toEqual([]);
  });

  it('el mismo nombre NO empareja: dos hermanos homónimos no se confunden', () => {
    // El alumno 7 se llama igual que el de Zero 1, pero tiene otro id y ningún RNE.
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [1, 2, 3, 7] },
    ] }]);
    const zero = [{ ...alumno(1, 1, 1), nombre: 'ALUMNO 7' }, alumno(2, 2, 1), alumno(3, 3, 1)];
    const r = cmp({ alumnos: zero }, a);
    expect(r.nuevos.map((n) => n.idSigerd)).toEqual([7]);
  });

  it('un alumno repetido en dos secciones es UN nuevo, con las dos ubicaciones', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [9] },
      { idSeccion: 102, nombre: 'B', ids: [9] },
    ] }]);
    const r = cmp({ alumnos: [] }, a);
    expect(r.nuevos).toHaveLength(1);
    expect(r.nuevos[0].ubicacion).toBe('Primario · Primero · A / Primario · Primero · B');
  });
});

describe('yaNoEstan', () => {
  it('un alumno activo de Zero cuyo id ya no sale en SIGERD', () => {
    const zero = [...zeroAlDia(), alumno(50, 99, 1, { nombre: 'FULANO SALIDO' })];
    const r = cmp({ alumnos: zero });
    expect(r.yaNoEstan).toEqual([
      { estudianteId: 50, nombre: 'FULANO SALIDO', sigerdId: 99, cursoEtiqueta: 'Primero — A' },
    ]);
  });

  it('sin matrícula también sale, con el curso en null', () => {
    const r = cmp({ alumnos: [alumno(50, 99, null)] });
    expect(r.yaNoEstan[0].cursoEtiqueta).toBeNull();
  });

  it('solo cuentan los ACTIVOS: un retirado que ya no sale en SIGERD es lo esperado', () => {
    const r = cmp({ alumnos: [...zeroAlDia(), alumno(50, 99, null, { estado: 'retirado' })] });
    expect(r.yaNoEstan).toEqual([]);
  });

  it('un alumno creado a mano, sin id de SIGERD, no es «ya no está»', () => {
    const r = cmp({ alumnos: [...zeroAlDia(), alumno(60, null, 1)] });
    expect(r.yaNoEstan).toEqual([]);
  });
});

describe('cambiaronDeSeccion', () => {
  it('matriculado en la A y SIGERD lo pone en la B: cambió, con el curso destino de Zero', () => {
    const zero = zeroAlDia().map((e) => (e.id === 2 ? alumno(2, 2, 2) : e));   // Zero: en la B
    // SIGERD lo tiene en la A (101) → desde B hacia A.
    const r = cmp({ alumnos: zero });
    expect(r.cambiaronDeSeccion).toEqual([{
      estudianteId: 2, matriculaId: 502, nombre: 'ZERO 2', sigerdId: 2,
      desde: 'Primero — B', desdeCursoId: 2,
      hacia: 'Primario · Primero · A',
      destino: { cursoId: 1, etiqueta: 'Primero — A' },
      sinDestino: null,
    }]);
  });

  it('si SIGERD lo pone en su misma sección, no cambió', () => {
    expect(cmp().cambiaronDeSeccion).toEqual([]);
  });

  it('SIGERD lo repite en dos secciones y una es la suya: no cambió', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [1] },
      { idSeccion: 102, nombre: 'B', ids: [1] },
    ] }]);
    const r = cmp({ alumnos: [alumno(1, 1, 1)] }, a);
    expect(r.cambiaronDeSeccion).toEqual([]);
  });

  it('SIGERD lo repite en dos secciones y NINGUNA es la suya: se avisa pero no se elige destino', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 102, nombre: 'B', ids: [1] },
    ] }, { nombre: 'Segundo', secciones: [{ idSeccion: 111, nombre: 'A', ids: [1] }] }]);
    const r = cmp({ alumnos: [alumno(1, 1, 1)] }, a);
    expect(r.cambiaronDeSeccion).toHaveLength(1);
    expect(r.cambiaronDeSeccion[0]).toMatchObject({ destino: null, sinDestino: 'varias-secciones' });
    expect(r.cambiaronDeSeccion[0].hacia).toBe('Primario · Primero · B / Primario · Segundo · A');
  });

  it('SIGERD lo pone en una sección que Zero no tiene enlazada: cambió, sin destino', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [2, 3] },
      { idSeccion: 103, nombre: 'C', ids: [1] },        // sin curso en Zero
    ] }]);
    const r = cmp({ alumnos: [alumno(1, 1, 1), alumno(2, 2, 1), alumno(3, 3, 1)] }, a);
    expect(r.cambiaronDeSeccion).toHaveLength(1);
    expect(r.cambiaronDeSeccion[0]).toMatchObject({ estudianteId: 1, destino: null, sinDestino: 'seccion-sin-enlazar' });
    expect(r.seccionesNuevas.map((s) => s.idSeccion)).toEqual([103]);
  });

  it('dos secciones de Zero enlazadas a la misma de SIGERD: no se elige destino', () => {
    const cursos = [...CURSOS, { id: 9, nombre: 'B repetida', etiqueta: 'Primero — B2', sigerdSeccionId: 102 }];
    const r = cmp({ alumnos: [alumno(4, 4, 1)], cursos });
    expect(r.cambiaronDeSeccion[0]).toMatchObject({ destino: null, sinDestino: 'enlace-duplicado' });
  });

  it('un alumno SIN matrícula activa no es un cambio de sección (para eso está «Matricular desde SIGERD»)', () => {
    const r = cmp({ alumnos: [alumno(1, 1, null)] });
    expect(r.cambiaronDeSeccion).toEqual([]);
    expect(r.yaNoEstan).toEqual([]);
  });

  it('matriculado en un curso sin enlace a SIGERD: no se puede saber, se cuenta aparte', () => {
    const z: AlumnoZero = {
      ...alumno(1, 1, null),
      matricula: { id: 501, cursoId: 77, cursoEtiqueta: 'Curso propio', cursoSigerdSeccionId: null },
    };
    const r = cmp({ alumnos: [z] });
    expect(r.cambiaronDeSeccion).toEqual([]);
    expect(r.totales.enCursoSinEnlace).toBe(1);
  });

  it('un alumno inactivo no entra en los cambios de sección', () => {
    const r = cmp({ alumnos: [alumno(1, 1, 2, { estado: 'retirado' })] });
    expect(r.cambiaronDeSeccion).toEqual([]);
  });

  it('varios cambios salen ordenados por destino y nombre', () => {
    const zero = [alumno(4, 4, 1), alumno(5, 5, 1), alumno(1, 1, 2)];
    const r = cmp({ alumnos: zero });
    expect(r.cambiaronDeSeccion.map((c) => c.estudianteId)).toEqual([1, 4, 5]);
  });
});

describe('secciones nuevas y renombradas', () => {
  it('una sección de SIGERD sin curso enlazado en Zero es nueva, con su cantidad de alumnos', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [1, 2, 3] },
      { idSeccion: 104, nombre: 'D', ids: [20, 21] },
    ] }]);
    const r = cmp({ alumnos: [alumno(1, 1, 1), alumno(2, 2, 1), alumno(3, 3, 1)] }, a);
    expect(r.seccionesNuevas).toEqual([
      { idSeccion: 104, nombre: 'D', ubicacion: 'Primario · Primero · D', estudiantes: 2 },
    ]);
  });

  it('una sección enlazada con otro nombre es renombrada', () => {
    const cursos = CURSOS.map((c) => (c.id === 3 ? { ...c, nombre: 'Única' } : c));
    const r = cmp({ cursos });
    expect(r.seccionesRenombradas).toEqual([{
      cursoId: 3, idSeccion: 111, nombreZero: 'Única', nombreSigerd: 'A', ubicacion: 'Primario · Segundo · A',
    }]);
    expect(r.seccionesNuevas).toEqual([]);
  });

  it('el nombre se compara sin tildes, mayúsculas ni espacios de más', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'Sección ÚNICA', ids: [] }] }]);
    const cursos: CursoZero[] = [{ id: 1, nombre: '  seccion   unica ', etiqueta: 'x', sigerdSeccionId: 101 }];
    expect(compararConSigerd(a, { alumnos: [], cursos }).seccionesRenombradas).toEqual([]);
  });

  it('un curso sin enlace no cuenta como la sección de SIGERD aunque se llamen igual', () => {
    const cursos: CursoZero[] = [{ id: 1, nombre: 'A', etiqueta: 'Primero — A', sigerdSeccionId: null }];
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'A', ids: [] }] }]);
    const r = compararConSigerd(a, { alumnos: [], cursos });
    expect(r.seccionesNuevas.map((s) => s.idSeccion)).toEqual([101]);
  });
});

describe('respaldo por RNE', () => {
  const rne = (pares: Array<[number, string]>) => ({ rnePorSigerd: new Map(pares) });

  it('un alumno de Zero sin id de SIGERD se empareja por RNE y deja de ser «nuevo»', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'A', ids: [8] }] }]);
    const zero = [alumno(1, null, 1, { codigoRne: 'RNE-8' })];
    const r = cmp({ alumnos: zero }, a, rne([[8, 'rne-8']]));
    expect(r.nuevos).toEqual([]);
    expect(r.totales).toMatchObject({ emparejados: 1, porRne: 1 });
  });

  it('un alumno de Zero cuyo id de SIGERD cambió se empareja por RNE: ni «nuevo» ni «ya no está»', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'A', ids: [9] }] }]);
    const zero = [alumno(1, 777, 1, { codigoRne: 'RNE-9' })];       // su id viejo, 777, ya no existe
    const r = cmp({ alumnos: zero }, a, rne([[9, 'RNE-9']]));
    expect(r.nuevos).toEqual([]);
    expect(r.yaNoEstan).toEqual([]);
  });

  it('el alumno emparejado por RNE también cuenta para los cambios de sección', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 102, nombre: 'B', ids: [9] }] }]);
    const zero = [alumno(1, null, 1, { codigoRne: 'RNE-9' })];
    const r = cmp({ alumnos: zero }, a, rne([[9, 'RNE-9']]));
    expect(r.cambiaronDeSeccion).toHaveLength(1);
    expect(r.cambiaronDeSeccion[0].destino?.cursoId).toBe(2);
  });

  it('el id manda sobre el RNE: si el id empareja, el RNE ni se mira', () => {
    const zero = zeroAlDia().map((e) => (e.id === 1 ? { ...e, codigoRne: 'OTRO-RNE' } : e));
    const r = cmp({ alumnos: zero }, BASE, rne([[1, 'RNE-1']]));
    expect(r.totales.porRne).toBe(0);
    expect(r.nuevos).toEqual([]);
  });

  it('con dos alumnos de Zero con el mismo RNE no se adivina: el de SIGERD queda como nuevo', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'A', ids: [8] }] }]);
    const zero = [alumno(1, null, 1, { codigoRne: 'DUP' }), alumno(2, null, 1, { codigoRne: 'DUP' })];
    const r = cmp({ alumnos: zero }, a, rne([[8, 'DUP']]));
    expect(r.nuevos.map((n) => n.idSigerd)).toEqual([8]);
    expect(r.totales.porRne).toBe(0);
  });

  it('con dos alumnos de SIGERD con el mismo RNE tampoco se adivina', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'A', ids: [8, 9] }] }]);
    const zero = [alumno(1, null, 1, { codigoRne: 'DUP' })];
    const r = cmp({ alumnos: zero }, a, rne([[8, 'DUP'], [9, 'DUP']]));
    expect(r.nuevos.map((n) => n.idSigerd)).toEqual([8, 9]);
  });

  it('sin RNE en las fichas de SIGERD no hay respaldo', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [{ idSeccion: 101, nombre: 'A', ids: [8] }] }]);
    const r = cmp({ alumnos: [alumno(1, null, 1, { codigoRne: 'RNE-8' })] }, a);
    expect(r.nuevos.map((n) => n.idSigerd)).toEqual([8]);
  });
});

describe('secciones que fallaron al descargarse', () => {
  it('se listan para avisar que «ya no están» puede ser incompleto', () => {
    const a = arbol([{ nombre: 'Primero', secciones: [
      { idSeccion: 101, nombre: 'A', ids: [], error: 'timeout' },
    ] }]);
    const r = cmp({ alumnos: [alumno(1, 1, 1)] }, a);
    expect(r.seccionesConError).toEqual(['Primario · Primero · A']);
    expect(r.yaNoEstan).toHaveLength(1);
  });
});

describe('entradas vacías', () => {
  it('sin servicios ni alumnos no lanza', () => {
    const vacio = { ...BASE, servicios: [] };
    const r = compararConSigerd(vacio, { alumnos: [], cursos: [] });
    expect(r.nuevos).toEqual([]);
    expect(r.totales.enSigerd).toBe(0);
  });

  it('no modifica lo que recibe', () => {
    const alumnos = zeroAlDia();
    const copia = JSON.stringify(alumnos);
    compararConSigerd(BASE, { alumnos, cursos: CURSOS });
    expect(JSON.stringify(alumnos)).toBe(copia);
  });
});
