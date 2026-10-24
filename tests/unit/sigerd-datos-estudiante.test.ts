import { describe, it, expect } from 'vitest';
import {
  aFechaNacimientoISO, datosDesdeFichas, planearCompletado,
  type DatosDeSigerd, type EstudianteParaCompletar,
} from '@/lib/sigerd/datos-estudiante';
import { hayParientesEnDump } from '@/lib/sigerd/dump-parientes';
import { codigoVisible } from '@/lib/administracion-escolar/estudiante-utils';

/**
 * «Completar datos desde SIGERD»: de las fichas de la descarga a lo que se
 * escribe en el alumno. Es lógica pura —sin base ni red—, así que se prueba con
 * fichas y alumnos inventados.
 *
 * Todos los ids, nombres y RNE son ficticios.
 */

describe('aFechaNacimientoISO', () => {
  it('deja pasar el ISO que ya trae la ficha', () => {
    expect(aFechaNacimientoISO('2015-03-09')).toBe('2015-03-09');
  });

  it('quita la hora de un ISO con hora', () => {
    expect(aFechaNacimientoISO('2015-03-09T00:00:00.000Z')).toBe('2015-03-09');
    expect(aFechaNacimientoISO('2015-03-09 00:00:00')).toBe('2015-03-09');
  });

  it('lee dd/MM/yyyy, el formato del portal: el día va primero', () => {
    expect(aFechaNacimientoISO('09/03/2015')).toBe('2015-03-09');
    expect(aFechaNacimientoISO('30/11/2014')).toBe('2014-11-30');
  });

  it('acepta el día y el mes sin ceros y con guiones', () => {
    expect(aFechaNacimientoISO('9/3/2015')).toBe('2015-03-09');
    expect(aFechaNacimientoISO('09-03-2015')).toBe('2015-03-09');
  });

  it('rechaza lo que no es una fecha de verdad', () => {
    expect(aFechaNacimientoISO('2015-02-30')).toBeNull();
    expect(aFechaNacimientoISO('31/04/2015')).toBeNull();
    expect(aFechaNacimientoISO('2015-13-01')).toBeNull();
    expect(aFechaNacimientoISO('1850-01-01')).toBeNull();
    expect(aFechaNacimientoISO('ayer')).toBeNull();
  });

  it('rechaza un nacimiento en el futuro', () => {
    const futuro = `${new Date().getFullYear() + 1}-01-01`;
    expect(aFechaNacimientoISO(futuro)).toBeNull();
  });

  it('vacíos y tipos raros dan null', () => {
    expect(aFechaNacimientoISO('')).toBeNull();
    expect(aFechaNacimientoISO('   ')).toBeNull();
    expect(aFechaNacimientoISO(null)).toBeNull();
    expect(aFechaNacimientoISO(undefined)).toBeNull();
    expect(aFechaNacimientoISO(20150309)).toBeNull();
  });
});

describe('datosDesdeFichas', () => {
  it('saca RNE, sexo y fecha por id de SIGERD', () => {
    const datos = datosDesdeFichas([
      { idSigerd: 100, codigoRNE: ' RNE0001 ', sexoNormalizado: 'femenino', sexo: 'Mujer', fechaNacimiento: '2015-03-09' },
    ]);
    expect(datos.get(100)).toEqual({ codigoRne: 'RNE0001', sexo: 'femenino', fechaNacimiento: '2015-03-09' });
  });

  it('ignora un RNE vacío o de solo espacios', () => {
    const datos = datosDesdeFichas([
      { idSigerd: 1, codigoRNE: '   ', sexoNormalizado: 'masculino', fechaNacimiento: '2014-01-02' },
      { idSigerd: 2, codigoRNE: '', sexoNormalizado: 'masculino', fechaNacimiento: '2014-01-02' },
      { idSigerd: 3, codigoRNE: null, sexoNormalizado: 'masculino', fechaNacimiento: '2014-01-02' },
    ]);
    expect(datos.get(1)?.codigoRne).toBeNull();
    expect(datos.get(2)?.codigoRne).toBeNull();
    expect(datos.get(3)?.codigoRne).toBeNull();
  });

  it('si la ficha no trae el sexo normalizado, lo deduce del texto del portal', () => {
    const datos = datosDesdeFichas([
      { idSigerd: 1, sexo: 'Hombre' },
      { idSigerd: 2, sexo: 'Mujer' },
      { idSigerd: 3, sexo: 'Otro género' },
      { idSigerd: 4, sexo: null },
    ]);
    expect(datos.get(1)?.sexo).toBe('masculino');
    expect(datos.get(2)?.sexo).toBe('femenino');
    expect(datos.get(3)?.sexo).toBe('otro');
    expect(datos.get(4)?.sexo).toBeNull();
  });

  it('una fecha en dd/MM/yyyy también sirve', () => {
    const datos = datosDesdeFichas([{ idSigerd: 1, fechaNacimiento: '09/03/2015' }]);
    expect(datos.get(1)?.fechaNacimiento).toBe('2015-03-09');
  });

  it('una ficha sin datos aprovechables igual deja constancia de que la ficha existe', () => {
    const datos = datosDesdeFichas([{ idSigerd: 7, codigoRNE: null, sexoNormalizado: null, fechaNacimiento: null }]);
    expect(datos.has(7)).toBe(true);
    expect(datos.get(7)).toEqual({ codigoRne: null, sexo: null, fechaNacimiento: null });
  });

  it('ignora fichas rotas o sin id válido y no se cae con una entrada que no es lista', () => {
    expect(datosDesdeFichas([null, 5, 'x', { idSigerd: 'abc' }, { idSigerd: 0 }, {}]).size).toBe(0);
    expect(datosDesdeFichas(undefined).size).toBe(0);
    expect(datosDesdeFichas({ idSigerd: 1 }).size).toBe(0);
  });

  it('si el portal repite un alumno, la primera ficha manda y la otra solo rellena huecos', () => {
    const datos = datosDesdeFichas([
      { idSigerd: 5, codigoRNE: 'AAA', sexoNormalizado: null, fechaNacimiento: null },
      { idSigerd: 5, codigoRNE: 'BBB', sexoNormalizado: 'femenino', fechaNacimiento: '2014-05-06' },
    ]);
    expect(datos.get(5)).toEqual({ codigoRne: 'AAA', sexo: 'femenino', fechaNacimiento: '2014-05-06' });
  });
});

describe('planearCompletado', () => {
  const alumno = (id: number, extra: Partial<EstudianteParaCompletar> = {}): EstudianteParaCompletar => ({
    id, sigerdId: 1000 + id, codigoRne: null, sexo: null, fechaNacimiento: null, ...extra,
  });
  const ficha = (extra: Partial<DatosDeSigerd> = {}): DatosDeSigerd => ({
    codigoRne: 'RNE-A', sexo: 'femenino', fechaNacimiento: '2015-03-09', ...extra,
  });
  const fichas = (...pares: Array<[number, DatosDeSigerd]>) => new Map(pares);
  const libre = new Map<string, number[]>();

  it('llena los tres campos de quien los tiene vacíos', () => {
    const plan = planearCompletado([alumno(1)], fichas([1001, ficha()]), libre);
    expect(plan.cambios).toEqual([
      { id: 1, campos: { codigoRne: 'RNE-A', sexo: 'femenino', fechaNacimiento: '2015-03-09' } },
    ]);
    expect(plan).toMatchObject({ revisados: 1, completados: 1, sinFicha: 0, rneRepetido: 0 });
  });

  it('NO pisa lo que ya está escrito: ni sexo, ni fecha, ni RNE', () => {
    const plan = planearCompletado(
      [alumno(1, { codigoRne: 'MIO', sexo: 'masculino', fechaNacimiento: '2010-01-01' })],
      fichas([1001, ficha()]),
      new Map([['MIO', [1]]]),
    );
    expect(plan.cambios).toEqual([]);
    expect(plan.completados).toBe(0);
    expect(plan.rneRepetido).toBe(0);
  });

  it('trata el texto vacío como campo vacío', () => {
    const plan = planearCompletado([alumno(1, { sexo: '  ', codigoRne: '' })], fichas([1001, ficha()]), libre);
    expect(plan.cambios[0].campos).toMatchObject({ sexo: 'femenino', codigoRne: 'RNE-A' });
  });

  it('solo llena lo que falta y deja el resto', () => {
    const plan = planearCompletado(
      [alumno(1, { sexo: 'masculino' })],
      fichas([1001, ficha()]),
      libre,
    );
    expect(plan.cambios[0].campos).toEqual({ codigoRne: 'RNE-A', fechaNacimiento: '2015-03-09' });
  });

  it('cuenta aparte a quien no tiene ficha en la descarga', () => {
    const plan = planearCompletado([alumno(1), alumno(2)], fichas([1001, ficha()]), libre);
    expect(plan).toMatchObject({ revisados: 2, completados: 1, sinFicha: 1 });
  });

  it('una ficha vacía no cuenta como «sin ficha» ni como completado', () => {
    const plan = planearCompletado(
      [alumno(1)],
      fichas([1001, { codigoRne: null, sexo: null, fechaNacimiento: null }]),
      libre,
    );
    expect(plan).toMatchObject({ revisados: 1, completados: 0, sinFicha: 0, rneRepetido: 0 });
    expect(plan.cambios).toEqual([]);
  });

  it('salta el RNE que ya usa OTRO alumno, pero completa el resto', () => {
    const plan = planearCompletado(
      [alumno(2)],
      fichas([1002, ficha({ codigoRne: 'RNE-A' })]),
      new Map([['RNE-A', [1]]]),      // lo tiene el alumno 1
    );
    expect(plan.rneRepetido).toBe(1);
    expect(plan.cambios[0].campos).toEqual({ sexo: 'femenino', fechaNacimiento: '2015-03-09' });
    expect(plan.completados).toBe(1);
  });

  it('la colisión no distingue mayúsculas ni espacios', () => {
    const plan = planearCompletado(
      [alumno(2)],
      fichas([1002, ficha({ codigoRne: ' rne-a ' })]),
      new Map([['RNE-A', [1]]]),
    );
    expect(plan.rneRepetido).toBe(1);
    expect(plan.cambios[0].campos.codigoRne).toBeUndefined();
  });

  it('un RNE que ya es del propio alumno (p. ej. guardado como código) no choca', () => {
    const plan = planearCompletado(
      [alumno(1)],
      fichas([1001, ficha()]),
      new Map([['RNE-A', [1]]]),
    );
    expect(plan.rneRepetido).toBe(0);
    expect(plan.cambios[0].campos.codigoRne).toBe('RNE-A');
  });

  it('si dos fichas traen el mismo RNE, se queda el alumno más antiguo y el otro cuenta como repetido', () => {
    const plan = planearCompletado(
      // desordenados a propósito: el orden de entrada no decide.
      [alumno(7), alumno(3)],
      fichas([1007, ficha({ codigoRne: 'IGUAL', sexo: null, fechaNacimiento: null })],
             [1003, ficha({ codigoRne: 'IGUAL', sexo: null, fechaNacimiento: null })]),
      libre,
    );
    expect(plan.cambios).toEqual([{ id: 3, campos: { codigoRne: 'IGUAL' } }]);
    expect(plan.rneRepetido).toBe(1);
    expect(plan.completados).toBe(1);
  });

  it('un RNE repetido no impide completar los demás alumnos', () => {
    const plan = planearCompletado(
      [alumno(1), alumno(2)],
      fichas([1001, ficha({ codigoRne: 'OCUPADO' })], [1002, ficha({ codigoRne: 'LIBRE' })]),
      new Map([['OCUPADO', [99]]]),
    );
    expect(plan.rneRepetido).toBe(1);
    expect(plan.cambios.map((c) => c.id)).toEqual([1, 2]);
    expect(plan.cambios[1].campos.codigoRne).toBe('LIBRE');
  });

  it('sin alumnos no hay nada que hacer', () => {
    expect(planearCompletado([], fichas([1, ficha()]), libre)).toEqual({
      cambios: [], revisados: 0, completados: 0, sinFicha: 0, rneRepetido: 0,
    });
  });

  it('no modifica los datos de entrada', () => {
    const enUso = new Map([['X', [1]]]);
    planearCompletado([alumno(2)], fichas([1002, ficha({ codigoRne: 'Y' })]), enUso);
    expect([...enUso]).toEqual([['X', [1]]]);
  });
});

describe('hayParientesEnDump', () => {
  it('detecta los responsables bajo la clave real, estudianteParientes', () => {
    expect(hayParientesEnDump({
      estudianteParientes: [{ idEstudiante: 1, parientes: [{ tipo: 'madre' }] }],
    })).toBe(true);
  });

  it('con la lista vacía o sin parientes dentro, no hay', () => {
    expect(hayParientesEnDump({ estudianteParientes: [] })).toBe(false);
    expect(hayParientesEnDump({ estudianteParientes: [{ idEstudiante: 1, parientes: [] }] })).toBe(false);
  });

  it('la clave vieja `parientes` no cuenta: esa nunca existió en el volcado', () => {
    expect(hayParientesEnDump({ parientes: [{ tipo: 'madre' }] })).toBe(false);
  });

  it('un dump ausente o raro no lanza', () => {
    expect(hayParientesEnDump(null)).toBe(false);
    expect(hayParientesEnDump(undefined)).toBe(false);
    expect(hayParientesEnDump({ estudianteParientes: 'x' })).toBe(false);
    expect(hayParientesEnDump({ estudianteParientes: [null, 3] })).toBe(false);
  });
});

describe('codigoVisible', () => {
  it('prefiere el código interno', () => {
    expect(codigoVisible({ codigo: 'F-001', codigoRne: 'RNE1', sigerdId: 55 })).toBe('F-001');
  });

  it('sin código, el RNE', () => {
    expect(codigoVisible({ codigo: null, codigoRne: 'RNE1', sigerdId: 55 })).toBe('RNE1');
    expect(codigoVisible({ codigo: '  ', codigoRne: 'RNE1', sigerdId: 55 })).toBe('RNE1');
  });

  it('sin código ni RNE, el id de SIGERD', () => {
    expect(codigoVisible({ codigo: null, codigoRne: null, sigerdId: 55 })).toBe('SIGERD 55');
    expect(codigoVisible({ sigerdId: 55 })).toBe('SIGERD 55');
  });

  it('sin nada devuelve null para que la pantalla ponga su «—»', () => {
    expect(codigoVisible({ codigo: null, codigoRne: null, sigerdId: null })).toBeNull();
    expect(codigoVisible({})).toBeNull();
  });
});
