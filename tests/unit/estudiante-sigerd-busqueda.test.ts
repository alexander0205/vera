import { describe, it, expect } from 'vitest';
import {
  avisoSinResultados, busquedaDesdeFicha, esDeOtroAlumno, seEligeSolo, NADIE_CON_ESOS_DATOS,
  type BusquedaDeFicha, type CriteriosSigerd,
} from '@/lib/administracion-escolar/estudiante-sigerd-busqueda';

/**
 * «Buscar este estudiante en SIGERD» abre el buscador ya relleno y, si no cabe
 * duda, elige solo. Aquí se prueban las dos decisiones que eso esconde: con qué
 * se busca y cuándo se puede elegir sin preguntar.
 *
 * Importa porque elegir no es mirar: en la pantalla de edición ata al alumno
 * los tutores del portal en el mismo momento. Un homónimo elegido solo serían
 * los padres de otro niño colgados de esta ficha.
 *
 * Todos los nombres, RNE e ids son inventados.
 */

const VACIOS: CriteriosSigerd = {
  nombres: '', primerApellido: '', segundoApellido: '',
  rne: '', nui: '', idEstudiante: '', fechaNacimiento: '',
};

/** Lo que el diálogo enseña en sus campos para la ficha `completa`. */
const POR_NOMBRE = {
  ...VACIOS,
  nombres: 'ZUTANA',
  primerApellido: 'DE LA NADA',
  segundoApellido: 'INVENTADO',
  fechaNacimiento: '2015-03-09',
};

describe('busquedaDesdeFicha', () => {
  const completa = {
    sigerdId: 10000001,
    codigoRne: 'RNEFICTICIO0001',
    nombres: 'ZUTANA PERENGANA',
    apellidos: 'DE LA NADA INVENTADO',
    fechaNacimiento: '2015-03-09',
  };

  it('con id de SIGERD busca solo por él, aunque haya RNE y nombre', () => {
    // Mezclarlo con el nombre es lo que se evita: una letra distinta en
    // nuestra ficha dejaría sin resultado a un id que es exacto.
    expect(busquedaDesdeFicha(completa))
      .toEqual({ por: 'id', criterios: { ...VACIOS, idEstudiante: '10000001' }, aLaVista: POR_NOMBRE });
  });

  it('sin id busca solo por el RNE, y se lleva la fecha aparte para comprobar', () => {
    // La fecha NO va en los criterios: como filtro, una mal escrita en nuestra
    // ficha vaciaría la búsqueda. Va al lado, para cotejar lo que vuelva.
    expect(busquedaDesdeFicha({ ...completa, sigerdId: null }))
      .toEqual({ por: 'rne', criterios: { ...VACIOS, rne: 'RNEFICTICIO0001' }, nacio: '2015-03-09', aLaVista: POR_NOMBRE });
    // Sin fecha, o con una que no es `yyyy-MM-dd`, no hay con qué comprobar.
    // Sin nombre en la ficha, en los campos sale el RNE con que se busca.
    const soloRne = { ...VACIOS, rne: 'RNEFICTICIO0001' };
    expect(busquedaDesdeFicha({ codigoRne: 'RNEFICTICIO0001' }))
      .toEqual({ por: 'rne', criterios: soloRne, aLaVista: soloRne });
    expect(busquedaDesdeFicha({ codigoRne: 'RNEFICTICIO0001', fechaNacimiento: '09/03/2015' }))
      .toEqual({ por: 'rne', criterios: soloRne, aLaVista: soloRne });
  });

  it('sin id ni RNE busca por nombre, apellidos partidos y fecha', () => {
    expect(busquedaDesdeFicha({ ...completa, sigerdId: null, codigoRne: '' }))
      .toEqual({ por: 'nombre', criterios: POR_NOMBRE, aLaVista: POR_NOMBRE });
  });

  it('aunque busque por id, en los campos sale el nombre del alumno', () => {
    // Abrir con los campos vacíos no decía a quién se buscaba. El id no se
    // enseña: volver a pulsar «Buscar» con id y nombre juntos vaciaría la lista.
    const b = busquedaDesdeFicha(completa);
    expect(b?.criterios.idEstudiante).toBe('10000001');
    expect(b?.aLaVista?.idEstudiante).toBe('');
    expect(b?.aLaVista?.nombres).toBe('ZUTANA');
  });

  it('un id que no es un id no cuenta', () => {
    // Ni «0» ni «null» pueden llegar al campo «Id de SIGERD».
    for (const sigerdId of [0, -5, 1.5, Number.NaN, null, undefined]) {
      expect(busquedaDesdeFicha({ ...completa, sigerdId })?.por).toBe('rne');
    }
  });

  it('el RNE se recorta, y uno de solo espacios es no tenerlo', () => {
    expect(busquedaDesdeFicha({ codigoRne: '  RNEFICTICIO0001 ' })?.criterios.rne).toBe('RNEFICTICIO0001');
    expect(busquedaDesdeFicha({ codigoRne: '   ', nombres: 'ZUTANA', apellidos: 'INVENTADO' })?.por).toBe('nombre');
  });

  it('una ficha vacía no busca nada', () => {
    expect(busquedaDesdeFicha({})).toBeNull();
    expect(busquedaDesdeFicha({
      sigerdId: null, codigoRne: null, nombres: '  ', apellidos: '', fechaNacimiento: null,
    })).toBeNull();
    // La fecha sola tampoco: en un padrón nacional no señala a nadie.
    expect(busquedaDesdeFicha({ fechaNacimiento: '2015-03-09' })).toBeNull();
  });

  it('del nombre va solo el primero, sin los espacios de más', () => {
    // El segundo vive en otra columna del portal (`Nombre2`) que no se puede
    // filtrar; mandarlos juntos arriesga un «no existe» que no es verdad.
    const b = busquedaDesdeFicha({ nombres: '  ZUTANA   PERENGANA  ', apellidos: ' INVENTADO ' });
    expect(b?.criterios.nombres).toBe('ZUTANA');
    expect(b?.criterios.primerApellido).toBe('INVENTADO');
  });

  it('un solo apellido deja el segundo en blanco', () => {
    const b = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'INVENTADO' });
    expect(b?.criterios.primerApellido).toBe('INVENTADO');
    expect(b?.criterios.segundoApellido).toBe('');
  });

  it('dos apellidos simples: uno y uno', () => {
    const b = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'INVENTADO FICTICIO' });
    expect(b?.criterios.primerApellido).toBe('INVENTADO');
    expect(b?.criterios.segundoApellido).toBe('FICTICIO');
  });

  it('el apellido compuesto no se parte por la mitad, vaya primero o segundo', () => {
    // Cortando por el primer espacio, el primer apellido sería «DE».
    const primero = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'DE LA NADA INVENTADO' });
    expect(primero?.criterios.primerApellido).toBe('DE LA NADA');
    expect(primero?.criterios.segundoApellido).toBe('INVENTADO');

    const segundo = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'INVENTADO DEL EJEMPLO' });
    expect(segundo?.criterios.primerApellido).toBe('INVENTADO');
    expect(segundo?.criterios.segundoApellido).toBe('DEL EJEMPLO');

    const solo = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'de los ejemplos' });
    expect(solo?.criterios.primerApellido).toBe('de los ejemplos');
    expect(solo?.criterios.segundoApellido).toBe('');
  });

  it('con tres apellidos no se arriesga el segundo', () => {
    // No se sabe dónde acaba el primero; un segundo mal puesto vaciaría la
    // búsqueda. Va solo el primero y la lista sale más larga.
    const b = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'INVENTADO FICTICIO IMAGINARIO' });
    expect(b?.criterios.primerApellido).toBe('INVENTADO');
    expect(b?.criterios.segundoApellido).toBe('');
  });

  it('sin apellidos busca con el nombre, y sin nombre con los apellidos', () => {
    expect(busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: '' })?.criterios)
      .toEqual({ ...VACIOS, nombres: 'ZUTANA' });
    expect(busquedaDesdeFicha({ nombres: '', apellidos: 'INVENTADO FICTICIO' })?.criterios)
      .toEqual({ ...VACIOS, primerApellido: 'INVENTADO', segundoApellido: 'FICTICIO' });
  });

  it('una fecha que el campo no sabría enseñar no viaja', () => {
    // El campo es de tipo fecha: «09/03/2015» se vería en blanco y aun así
    // filtraría, sin que nadie supiera por qué no sale el alumno.
    const b = busquedaDesdeFicha({ nombres: 'ZUTANA', apellidos: 'INVENTADO', fechaNacimiento: '09/03/2015' });
    expect(b?.criterios.fechaNacimiento).toBe('');
  });

  it('todos los criterios salen como texto', () => {
    // El diálogo les hace `trim()` a los siete: un número o un nulo lo revienta.
    for (const ficha of [completa, { ...completa, sigerdId: null }, { nombres: 'ZUTANA' }]) {
      const criterios = busquedaDesdeFicha(ficha)!.criterios;
      expect(Object.keys(criterios).sort()).toEqual(Object.keys(VACIOS).sort());
      for (const v of Object.values(criterios)) expect(typeof v).toBe('string');
    }
  });

  it('«buscar otro» va por nombre aunque la ficha tenga id y RNE', () => {
    // Es la salida de una ficha enlazada al alumno equivocado: por su id
    // volvería siempre él, se elegiría solo y no habría forma de cambiarlo.
    const otro = busquedaDesdeFicha(completa, { soloPorNombre: true });
    expect(otro).toEqual({ por: 'nombre', criterios: POR_NOMBRE, aLaVista: POR_NOMBRE });
    // Y como va por nombre, no se elige solo ni aunque vuelva justo el de la ficha.
    expect(seEligeSolo({
      busqueda: otro!,
      filas: [{ IdEstudiante: 10000001, CodigoRNE: 'RNEFICTICIO0001' }],
      yaEstan: new Map(),
      estudianteId: 7,
    })).toBe(false);
    // Sin nombre no hay con qué buscar: el identificador no entra por detrás.
    expect(busquedaDesdeFicha({ sigerdId: 10000001, codigoRne: 'RNEFICTICIO0001' }, { soloPorNombre: true }))
      .toBeNull();
  });
});

describe('esDeOtroAlumno', () => {
  it('en el alta, cualquiera que ya exista es otro', () => {
    expect(esDeOtroAlumno(7)).toBe(true);
    expect(esDeOtroAlumno(undefined)).toBe(false);
  });

  it('al editar, el propio alumno no es «otro»', () => {
    expect(esDeOtroAlumno(7, 7)).toBe(false);
    expect(esDeOtroAlumno(8, 7)).toBe(true);
    expect(esDeOtroAlumno(undefined, 7)).toBe(false);
  });
});

describe('seEligeSolo', () => {
  const porId: BusquedaDeFicha = { por: 'id', criterios: { ...VACIOS, idEstudiante: '10000001' } };
  const porRne: BusquedaDeFicha = {
    por: 'rne', criterios: { ...VACIOS, rne: 'RNEFICTICIO0001' }, nacio: '2015-03-09',
  };
  const porNombre: BusquedaDeFicha = {
    por: 'nombre', criterios: { ...VACIOS, nombres: 'ZUTANA', primerApellido: 'INVENTADO' },
  };

  const fila = { IdEstudiante: 10000001, CodigoRNE: 'RNEFICTICIO0001', FechaNacimiento: '09/03/2015' };
  const nadie = new Map<number, number>();

  it('por id, una fila con ese mismo id: se elige', () => {
    expect(seEligeSolo({ busqueda: porId, filas: [fila], yaEstan: nadie })).toBe(true);
  });

  it('por RNE, una fila con ese mismo RNE y la misma fecha de nacimiento: se elige', () => {
    expect(seEligeSolo({ busqueda: porRne, filas: [fila], yaEstan: nadie })).toBe(true);
    // El portal lo guarda a su manera; espacios, guiones y mayúsculas no hacen
    // que sea otro RNE.
    expect(seEligeSolo({
      busqueda: porRne, filas: [{ ...fila, CodigoRNE: ' rne-ficticio 0001 ' }], yaEstan: nadie,
    })).toBe(true);
  });

  it('por RNE no basta el RNE: sin la misma fecha de nacimiento confirma una persona', () => {
    // El RNE lo copia alguien de un papel. Uno con un dígito cambiado que sea
    // de otro niño devolvería UNA fila con «el mismo RNE», y elegirla sola le
    // ataría a sus padres. La fecha es lo que delata que no es él.
    expect(seEligeSolo({
      busqueda: porRne, filas: [{ ...fila, FechaNacimiento: '10/03/2015' }], yaEstan: nadie,
    })).toBe(false);
    // El portal no trae fecha, o la trae en un formato que no se entiende.
    expect(seEligeSolo({ busqueda: porRne, filas: [{ ...fila, FechaNacimiento: null }], yaEstan: nadie })).toBe(false);
    expect(seEligeSolo({ busqueda: porRne, filas: [{ ...fila, FechaNacimiento: '2015-03-09' }], yaEstan: nadie })).toBe(false);
    // Nuestra ficha no tiene fecha: no hay con qué cotejar.
    const sinFecha: BusquedaDeFicha = { por: 'rne', criterios: porRne.criterios };
    expect(seEligeSolo({ busqueda: sinFecha, filas: [fila], yaEstan: nadie })).toBe(false);
  });

  it('por id la fecha no cuenta: el id lo guardó el sistema, no una persona', () => {
    expect(seEligeSolo({
      busqueda: porId, filas: [{ ...fila, FechaNacimiento: null }], yaEstan: nadie,
    })).toBe(true);
  });

  it('por nombre no se elige nunca, ni con un único resultado', () => {
    // El buscador es nacional: uno solo no quiere decir que sea el nuestro.
    expect(seEligeSolo({ busqueda: porNombre, filas: [fila], yaEstan: nadie })).toBe(false);
    expect(seEligeSolo({ busqueda: porNombre, filas: [fila], yaEstan: nadie, estudianteId: 7 })).toBe(false);
  });

  it('por nombre no se elige aunque los identificadores cuadren', () => {
    // Aquí lo ÚNICO que lo impide es que se buscó por nombre: los criterios
    // llevan un RNE y la fila trae ese mismo. Sin la regla, se elegiría.
    const conRne: BusquedaDeFicha = {
      por: 'nombre', criterios: { ...VACIOS, nombres: 'ZUTANA', rne: 'RNEFICTICIO0001' },
    };
    expect(seEligeSolo({ busqueda: conRne, filas: [fila], yaEstan: nadie })).toBe(false);
    expect(seEligeSolo({ busqueda: conRne, filas: [fila], yaEstan: nadie, estudianteId: 7 })).toBe(false);
    // Ni una fila sin RNE: vacío contra vacío no es «el mismo identificador».
    expect(seEligeSolo({
      busqueda: porNombre, filas: [{ IdEstudiante: 10000001, CodigoRNE: null }], yaEstan: nadie,
    })).toBe(false);
  });

  it('si lo que vuelve no trae el identificador pedido, no se elige', () => {
    // El portal podría ignorar el filtro y devolver a otro.
    expect(seEligeSolo({
      busqueda: porId, filas: [{ IdEstudiante: 10000002, CodigoRNE: 'RNEFICTICIO0001' }], yaEstan: nadie,
    })).toBe(false);
    expect(seEligeSolo({
      busqueda: porRne, filas: [{ IdEstudiante: 10000001, CodigoRNE: 'RNEFICTICIO0002' }], yaEstan: nadie,
    })).toBe(false);
    // Buscando por RNE, que coincida el id no arregla nada: el RNE es lo pedido.
    expect(seEligeSolo({
      busqueda: porRne, filas: [{ IdEstudiante: 10000001, CodigoRNE: null }], yaEstan: nadie,
    })).toBe(false);
    expect(seEligeSolo({ busqueda: porRne, filas: [{ IdEstudiante: 10000001 }], yaEstan: nadie })).toBe(false);
  });

  it('un id que no llega como número no se da por bueno', () => {
    const rara = { IdEstudiante: '10000001' as unknown as number, CodigoRNE: null };
    expect(seEligeSolo({ busqueda: porId, filas: [rara], yaEstan: nadie })).toBe(false);
    expect(seEligeSolo({ busqueda: porId, filas: [{ CodigoRNE: null }], yaEstan: nadie })).toBe(false);
    // Tampoco buscando por RNE, aunque el RNE sea el pedido: la ficha y los
    // tutores se piden con el id, y sin él el diálogo se cerraría sin traer nada.
    expect(seEligeSolo({
      busqueda: porRne, filas: [{ CodigoRNE: 'RNEFICTICIO0001' }], yaEstan: nadie,
    })).toBe(false);
    expect(seEligeSolo({
      busqueda: porRne,
      filas: [{ IdEstudiante: '10000001' as unknown as number, CodigoRNE: 'RNEFICTICIO0001' }],
      yaEstan: nadie,
    })).toBe(false);
  });

  it('con cero resultados no hay nada que elegir', () => {
    expect(seEligeSolo({ busqueda: porId, filas: [], yaEstan: nadie })).toBe(false);
    expect(seEligeSolo({ busqueda: porRne, filas: [], yaEstan: nadie })).toBe(false);
  });

  it('con dos o más decide una persona, aunque uno coincida', () => {
    const otra = { IdEstudiante: 10000002, CodigoRNE: 'RNEFICTICIO0002' };
    expect(seEligeSolo({ busqueda: porId, filas: [fila, otra], yaEstan: nadie })).toBe(false);
    expect(seEligeSolo({ busqueda: porRne, filas: [fila, otra, otra], yaEstan: nadie })).toBe(false);
    // Dos filas iguales tampoco: algo raro pasa y mejor que se vea.
    expect(seEligeSolo({ busqueda: porRne, filas: [fila, fila], yaEstan: nadie })).toBe(false);
  });

  it('el propio alumno que se edita sí se elige', () => {
    // Es el caso de todos los días: un alumno importado busca su propia ficha
    // para completar dirección, acta y tutores.
    const yaEstan = new Map([[10000001, 7]]);
    expect(seEligeSolo({ busqueda: porId, filas: [fila], yaEstan, estudianteId: 7 })).toBe(true);
  });

  it('lo que ya es de OTRO alumno del colegio no se elige', () => {
    // Serían dos fichas apuntando al mismo niño del padrón.
    const yaEstan = new Map([[10000001, 8]]);
    expect(seEligeSolo({ busqueda: porRne, filas: [fila], yaEstan, estudianteId: 7 })).toBe(false);
    expect(seEligeSolo({ busqueda: porId, filas: [fila], yaEstan, estudianteId: 7 })).toBe(false);
    // Sin alumno en edición (el alta), cualquiera que exista es otro.
    expect(seEligeSolo({ busqueda: porId, filas: [fila], yaEstan })).toBe(false);
  });

  it('si no se pudo comprobar de quién es, no se elige', () => {
    expect(seEligeSolo({ busqueda: porId, filas: [fila], yaEstan: null, estudianteId: 7 })).toBe(false);
    expect(seEligeSolo({ busqueda: porRne, filas: [fila], yaEstan: null })).toBe(false);
  });
});

/**
 * Cuando no sale nadie, el consejo depende de con qué se buscó. Lo que se
 * evita: mandar a «escribir solo el apellido» a quien tiene puesto un RNE mal
 * copiado, que es la forma segura de volver a no encontrar a nadie.
 */
describe('avisoSinResultados', () => {
  it('buscando solo por nombre dice lo de siempre', () => {
    expect(avisoSinResultados({ ...VACIOS, nombres: 'ZUTANA', primerApellido: 'INVENTADO' }))
      .toBe(NADIE_CON_ESOS_DATOS);
    expect(avisoSinResultados(VACIOS)).toBe(NADIE_CON_ESOS_DATOS);
  });

  it('con un identificador manda a quitarlo, no a recortar el nombre', () => {
    const casos: Array<[Partial<CriteriosSigerd>, string]> = [
      [{ rne: 'RNEFICTICIO0001' }, 'ese RNE'],
      [{ nui: '00000000000' }, 'ese NUI'],
      [{ idEstudiante: '10000001' }, 'ese id de SIGERD'],
    ];
    for (const [puesto, nombre] of casos) {
      const aviso = avisoSinResultados({ ...VACIOS, ...puesto });
      expect(aviso).toContain(nombre);
      expect(aviso).toContain('bórralo y busca por nombre y apellido');
      expect(aviso).not.toContain('menos letras');
    }
  });

  it('con varios identificadores los nombra todos', () => {
    const aviso = avisoSinResultados({ ...VACIOS, rne: 'RNEFICTICIO0001', idEstudiante: '10000001' });
    expect(aviso).toContain('ese RNE y ese id de SIGERD');
    expect(aviso).toContain('bórralos');
  });

  it('el identificador manda aunque también haya nombre y fecha', () => {
    // Es lo que estorba de verdad: el portal junta los filtros con «y».
    const aviso = avisoSinResultados({
      ...VACIOS, nombres: 'ZUTANA', primerApellido: 'INVENTADO', fechaNacimiento: '2015-03-09', rne: 'RNEFICTICIO0001',
    });
    expect(aviso).toContain('ese RNE');
    expect(aviso).not.toContain('fecha');
  });

  it('por nombre con fecha, lo primero que se propone es quitar la fecha', () => {
    const aviso = avisoSinResultados({
      ...VACIOS, nombres: 'ZUTANA', primerApellido: 'INVENTADO', fechaNacimiento: '2015-03-09',
    });
    expect(aviso).toContain('sin la fecha de nacimiento');
  });

  it('un criterio de solo espacios es no haberlo puesto', () => {
    expect(avisoSinResultados({ ...VACIOS, nombres: 'ZUTANA', rne: '   ', fechaNacimiento: ' ' }))
      .toBe(NADIE_CON_ESOS_DATOS);
  });
});
