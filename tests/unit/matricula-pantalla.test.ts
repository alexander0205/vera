/**
 * «Nueva matrícula» y «Editar matrícula» dejaron de ser un diálogo.
 *
 * Eran una ventana encima de la ficha del alumno o del listado de
 * Matriculación, y con los cobros automáticos y la cuenta entera dentro ya no
 * cabían. Ahora son dos pantallas con su dirección:
 *
 *   /escolar/matriculas/nueva            (acepta ?estudiante=<id>)
 *   /escolar/matriculas/[id]/editar
 *
 * y las dos aceptan `?volver=<ruta>` para regresar a donde se estaba.
 *
 * Lo que se fija aquí es lo que no se puede ver sin navegador:
 *   1. Que `volver` solo valga si es una ruta del módulo: es texto de la
 *      dirección y de él depende a dónde manda el botón de guardar.
 *   2. Que lo que antes le pasaba al diálogo quien lo abría —el alumno, sus
 *      períodos ocupados, si es su primera vez, el código sugerido— se derive
 *      con las MISMAS reglas, para que abrir la dirección sola dé lo mismo.
 *   3. Que los sitios que abrían el diálogo ahora naveguen, y que del diálogo
 *      no quede nada.
 *   4. Que la mudanza no tocó lo que se guarda.
 *
 * Los alumnos y las matrículas de abajo son inventados.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  arranqueDelFormulario,
  cargarArranque,
  claveFichaEstudiante,
  datosDelAlumno,
  destinoAlSalir,
  idDeRuta,
  rutaDeVueltaALaFicha,
  rutaEditarMatricula,
  rutaNuevaMatricula,
  titulosDeMatricula,
  volverSeguro,
  type Pedir,
} from '@/lib/administracion-escolar/matricula-pantalla';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

/** Lo que el servidor leería de `?volver=` al abrir la dirección que se armó. */
const volverDe = (ruta: string) => new URL(ruta, 'http://interno.invalid').searchParams.get('volver');

describe('volverSeguro: a dónde se puede regresar', () => {
  it('acepta las pantallas del módulo desde las que se llega, con su query', () => {
    for (const ruta of [
      '/escolar/matriculas',
      '/escolar/matriculas?periodo=3&estado=activa&page=2&matricula=45',
      '/escolar/estudiantes/12',
      '/escolar/estudiantes/12?tab=tutores&periodo=m-5&v=otros',
      '/escolar/responsables/7',
    ]) {
      expect(volverSeguro(ruta)).toBe(ruta);
    }
  });

  it('lo que no es texto no vale: un parámetro repetido llega como lista', () => {
    for (const crudo of [undefined, null, 12, true, {}, ['/escolar/matriculas'], ['/escolar/a', '/escolar/b']]) {
      expect(volverSeguro(crudo)).toBeNull();
    }
  });

  it('fuera del módulo no vale, aunque sea de la aplicación', () => {
    for (const ruta of [
      '',
      '/',
      '/dashboard',
      '/dashboard/facturas',
      '/escolar',              // la portada del módulo: no empieza por `/escolar/`
      '/escolarX/matriculas',
      '/escolares/matriculas',
      'escolar/matriculas',    // relativa: dependería de dónde se esté
      ' /escolar/matriculas',
    ]) {
      expect(volverSeguro(ruta)).toBeNull();
    }
  });

  it('nada que saque de la aplicación', () => {
    for (const ruta of [
      'https://ejemplo.invalid/escolar/matriculas',
      'http://ejemplo.invalid/escolar/',
      '//ejemplo.invalid/escolar/matriculas',
      'javascript:alert(1)',
      'data:text/html,hola',
      '/escolar//ejemplo.invalid',
      '/escolar/matriculas?siguiente=https://ejemplo.invalid',
      '/escolar/matriculas#//ejemplo.invalid',
    ]) {
      expect(volverSeguro(ruta)).toBeNull();
    }
  });

  it('sin barras invertidas: el navegador las lee como «/»', () => {
    for (const ruta of ['/escolar/\\ejemplo.invalid', '/escolar\\matriculas', '\\escolar\\matriculas', '/escolar/\\/ejemplo.invalid']) {
      expect(volverSeguro(ruta)).toBeNull();
    }
  });

  it('no se deja sacar del módulo con «..», tampoco escrito con %2e', () => {
    for (const ruta of [
      '/escolar/../dashboard',
      '/escolar/matriculas/../../dashboard',
      '/escolar/%2e%2e/dashboard',
      '/escolar/.%2E/dashboard',
      '/escolar/..',
    ]) {
      expect(volverSeguro(ruta)).toBeNull();
    }
  });

  it('un tabulador o un salto de línea entre dos barras no cuela un «//»', () => {
    // El navegador quita esos caracteres antes de resolver la ruta: lo que se
    // validó dejaría de ser lo que se abre.
    for (const ruta of ['/escolar/\t/ejemplo.invalid', '/escolar/\n/ejemplo.invalid', '/escolar/\r\n/ejemplo.invalid']) {
      expect(volverSeguro(ruta)).toBeNull();
    }
  });

  it('devuelve la ruta ya resuelta, que es la que validó', () => {
    expect(volverSeguro('/escolar/./matriculas')).toBe('/escolar/matriculas');
    expect(volverSeguro('/escolar/estudiantes/../matriculas?page=2')).toBe('/escolar/matriculas?page=2');
    expect(volverSeguro('/escolar/mat\triculas')).toBe('/escolar/matriculas');
  });

  it('lo que devuelve vuelve a pasar igual', () => {
    for (const ruta of ['/escolar/matriculas?q=a%2Fb&page=2', '/escolar/./matriculas', '/escolar/estudiantes/12?tab=avisos']) {
      const una = volverSeguro(ruta);
      expect(una).not.toBeNull();
      expect(volverSeguro(una)).toBe(una);
    }
  });
});

describe('idDeRuta: el id que viene escrito en la dirección', () => {
  it('solo dígitos, entero y mayor que cero', () => {
    expect(idDeRuta('1')).toBe(1);
    expect(idDeRuta('45')).toBe(45);
    expect(idDeRuta('120034')).toBe(120034);
  });

  it('lo que `parseInt` se tragaría no pasa', () => {
    for (const crudo of ['12abc', '12.5', '1e3', ' 12', '12 ', '+12', '-3', '0', '007', '', 'abc', 'NaN', '0x10']) {
      expect(idDeRuta(crudo)).toBeNull();
    }
  });

  it('ni lo que no es texto, ni un número que ya no cabe', () => {
    for (const crudo of [undefined, null, 12, ['12'], {}]) {
      expect(idDeRuta(crudo)).toBeNull();
    }
    expect(idDeRuta('9007199254740993')).toBeNull();
  });
});

describe('las direcciones de las dos pantallas', () => {
  it('nueva, sin nada: la de Matriculación con el buscador de alumnos', () => {
    expect(rutaNuevaMatricula()).toBe('/escolar/matriculas/nueva');
    expect(rutaNuevaMatricula({})).toBe('/escolar/matriculas/nueva');
    expect(rutaNuevaMatricula({ estudianteId: null, volver: null })).toBe('/escolar/matriculas/nueva');
  });

  it('nueva, con el alumno ya decidido', () => {
    expect(rutaNuevaMatricula({ estudianteId: 9 })).toBe('/escolar/matriculas/nueva?estudiante=9');
  });

  it('editar', () => {
    expect(rutaEditarMatricula(45)).toBe('/escolar/matriculas/45/editar');
    expect(rutaEditarMatricula(45, null)).toBe('/escolar/matriculas/45/editar');
  });

  it('`volver` viaja codificado y llega entero, con su propia query', () => {
    const desdeLaFicha = '/escolar/estudiantes/9?tab=tutores&periodo=m-5';
    const nueva = rutaNuevaMatricula({ estudianteId: 9, volver: desdeLaFicha });
    expect(nueva.startsWith('/escolar/matriculas/nueva?')).toBe(true);
    // Su `&periodo=` no se confunde con un parámetro de la pantalla nueva.
    const q = new URL(nueva, 'http://interno.invalid').searchParams;
    expect([...q.keys()].sort()).toEqual(['estudiante', 'volver']);
    expect(q.get('estudiante')).toBe('9');
    expect(q.get('volver')).toBe(desdeLaFicha);

    const desdeElListado = '/escolar/matriculas?q=a%2Fb&periodo=3&page=2&matricula=45';
    const editar = rutaEditarMatricula(45, desdeElListado);
    expect(editar.startsWith('/escolar/matriculas/45/editar?volver=')).toBe(true);
    expect(volverDe(editar)).toBe(desdeElListado);
  });

  it('lo que se manda como `volver` es lo que después se acepta', () => {
    for (const origen of [
      '/escolar/matriculas',
      '/escolar/matriculas?q=a%2Fb&periodo=3&page=2&matricula=45',
      rutaDeVueltaALaFicha(9, 'tab=documentos&periodo=m-5'),
    ]) {
      expect(volverSeguro(volverDe(rutaEditarMatricula(45, origen)))).toBe(origen);
      expect(volverSeguro(volverDe(rutaNuevaMatricula({ estudianteId: 9, volver: origen })))).toBe(origen);
    }
  });
});

describe('rutaDeVueltaALaFicha: la ficha tal como se estaba viendo', () => {
  it('sin query, la ficha a secas', () => {
    expect(rutaDeVueltaALaFicha(12, '')).toBe('/escolar/estudiantes/12');
  });

  it('conserva la pestaña, el período y la vista', () => {
    expect(rutaDeVueltaALaFicha(12, 'tab=tutores&periodo=m-5&v=otros'))
      .toBe('/escolar/estudiantes/12?tab=tutores&periodo=m-5&v=otros');
  });

  it('no arrastra `factura`: volver de editar una matrícula no es pedir una factura', () => {
    expect(rutaDeVueltaALaFicha(12, 'factura=nueva')).toBe('/escolar/estudiantes/12');
    expect(rutaDeVueltaALaFicha(12, 'periodo=m-5&factura=c%3A1%2C2')).toBe('/escolar/estudiantes/12?periodo=m-5');
  });
});

describe('destinoAlSalir: a dónde se va al guardar, al cancelar y con el enlace', () => {
  it('manda el `volver` de la dirección, y el enlace nombra el sitio', () => {
    expect(destinoAlSalir({ volver: '/escolar/estudiantes/12?tab=tutores', estudianteId: 12 }))
      .toEqual({ href: '/escolar/estudiantes/12?tab=tutores', etiqueta: 'Volver al perfil' });
    expect(destinoAlSalir({ volver: '/escolar/matriculas?page=2', estudianteId: 12 }))
      .toEqual({ href: '/escolar/matriculas?page=2', etiqueta: 'Volver a matriculación' });
  });

  it('a otra pantalla del módulo se vuelve igual, sin inventarle nombre', () => {
    expect(destinoAlSalir({ volver: '/escolar/responsables/7', estudianteId: 12 }))
      .toEqual({ href: '/escolar/responsables/7', etiqueta: 'Volver' });
    // La pantalla de editar al alumno no es su perfil.
    expect(destinoAlSalir({ volver: '/escolar/estudiantes/12/editar' }).etiqueta).toBe('Volver');
  });

  it('sin `volver`, a la ficha del alumno si se sabe quién es', () => {
    expect(destinoAlSalir({ volver: null, estudianteId: 12 }))
      .toEqual({ href: '/escolar/estudiantes/12', etiqueta: 'Volver al perfil' });
    expect(destinoAlSalir({ estudianteId: 12 }).href).toBe('/escolar/estudiantes/12');
  });

  it('sin `volver` y sin alumno, a Matriculación', () => {
    const aMatriculacion = { href: '/escolar/matriculas', etiqueta: 'Volver a matriculación' };
    expect(destinoAlSalir({})).toEqual(aMatriculacion);
    expect(destinoAlSalir({ volver: null, estudianteId: null })).toEqual(aMatriculacion);
  });

  it('un `volver` que no vale se ignora, aunque nadie lo haya validado antes', () => {
    for (const malo of ['https://ejemplo.invalid', '//ejemplo.invalid', '/dashboard', '/escolar/../dashboard', 'javascript:alert(1)']) {
      expect(destinoAlSalir({ volver: malo, estudianteId: 12 }).href).toBe('/escolar/estudiantes/12');
      expect(destinoAlSalir({ volver: malo }).href).toBe('/escolar/matriculas');
    }
  });
});

describe('datosDelAlumno: lo que la ficha le pasaba al diálogo', () => {
  const alumna = { nombres: 'Alumna', apellidos: 'De Prueba', codigo: 'E-0042', codigoRne: 'RNE-0001' };

  it('el nombre, como lo escribe su ficha', () => {
    expect(datosDelAlumno(alumna, []).nombre).toBe('Alumna De Prueba');
  });

  it('solo las matrículas ACTIVAS ocupan su período', () => {
    const suyas = [
      { periodoId: 3, estado: 'activa' },
      { periodoId: 2, estado: 'finalizada' },
      { periodoId: 1, estado: 'retirada' },
      { periodoId: 4, estado: 'anulada' },
    ];
    expect(datosDelAlumno(alumna, suyas).periodosOcupados).toEqual([3]);
  });

  it('con dos activas, las dos; y sin ninguna, lista vacía', () => {
    expect(datosDelAlumno(alumna, [{ periodoId: 3, estado: 'activa' }, { periodoId: 5, estado: 'activa' }]).periodosOcupados)
      .toEqual([3, 5]);
    expect(datosDelAlumno(alumna, [{ periodoId: 2, estado: 'retirada' }]).periodosOcupados).toEqual([]);
  });

  it('«primera vez» cuenta TODAS sus matrículas, no solo las activas', () => {
    expect(datosDelAlumno(alumna, []).esPrimera).toBe(true);
    expect(datosDelAlumno(alumna, [{ periodoId: 2, estado: 'retirada' }]).esPrimera).toBe(false);
    expect(datosDelAlumno(alumna, [{ periodoId: 2, estado: 'anulada' }]).esPrimera).toBe(false);
  });

  it('el código sugerido es su RNE; si no tiene, el suyo; si tampoco, nada', () => {
    expect(datosDelAlumno(alumna, []).codigoSugerido).toBe('RNE-0001');
    expect(datosDelAlumno({ ...alumna, codigoRne: null }, []).codigoSugerido).toBe('E-0042');
    expect(datosDelAlumno({ ...alumna, codigoRne: '' }, []).codigoSugerido).toBe('E-0042');
    expect(datosDelAlumno({ ...alumna, codigoRne: null, codigo: null }, []).codigoSugerido).toBe('');
  });

  it('son las mismas reglas que tenía escritas la ficha', () => {
    // Si alguien las cambia aquí, que sea a propósito: así arrancaba el diálogo
    // cuando se abría desde la ficha del alumno.
    const fuente = lee('lib/administracion-escolar/matricula-pantalla.ts');
    expect(fuente).toContain('nombre: `${estudiante.nombres} ${estudiante.apellidos}`,');
    expect(fuente).toContain("periodosOcupados: matriculas.filter((m) => m.estado === 'activa').map((m) => m.periodoId),");
    expect(fuente).toContain('esPrimera: matriculas.length === 0,');
    expect(fuente).toContain("codigoSugerido: estudiante.codigoRne || estudiante.codigo || '',");
  });
});

describe('arranqueDelFormulario: con qué arranca según cómo se entró', () => {
  const alumno = datosDelAlumno(
    { nombres: 'Alumno', apellidos: 'De Ejemplo', codigo: 'E-0007', codigoRne: null },
    [{ periodoId: 3, estado: 'activa' }, { periodoId: 2, estado: 'finalizada' }],
  );
  const matricula = {
    id: 45, estudianteId: 9, periodoId: 3, cursoId: 21, documentoListaId: 4,
    fechaInscripcion: '2026-08-20', estado: 'activa', codigoMatricula: 'M-45', notas: null,
  };

  it('editar: la matrícula tal cual, el alumno es el suyo y no hay primera vez ni código que sugerir', () => {
    const a = arranqueDelFormulario({ matricula, estudianteId: null, alumno });
    // El MISMO objeto: el formulario cuelga un efecto de él.
    expect(a.matricula).toBe(matricula);
    expect(a.estudianteFijoId).toBe(9);
    expect(a.estudianteFijoNombre).toBe('Alumno De Ejemplo');
    // Su propio período va en la lista: el formulario es quien lo descuenta.
    expect(a.periodosOcupados).toEqual([3]);
    expect(a.esPrimera).toBe(false);
    expect(a.codigoSugerido).toBe('');
  });

  it('editar: manda el alumno de la matrícula, no el de la dirección', () => {
    expect(arranqueDelFormulario({ matricula, estudianteId: 777, alumno }).estudianteFijoId).toBe(9);
  });

  it('nueva con alumno: lo mismo que al abrirla desde su ficha', () => {
    const sinMatriculas = datosDelAlumno(
      { nombres: 'Alumno', apellidos: 'De Ejemplo', codigo: 'E-0007', codigoRne: 'RNE-0009' }, [],
    );
    expect(arranqueDelFormulario({ matricula: null, estudianteId: 9, alumno: sinMatriculas })).toEqual({
      matricula: null,
      estudianteFijoId: 9,
      estudianteFijoNombre: 'Alumno De Ejemplo',
      periodosOcupados: [],
      esPrimera: true,
      codigoSugerido: 'RNE-0009',
    });
    // Con matrículas de otros años ya no es la primera, y sus activas ocupan.
    const b = arranqueDelFormulario({ matricula: null, estudianteId: 9, alumno });
    expect(b.esPrimera).toBe(false);
    expect(b.periodosOcupados).toEqual([3]);
    expect(b.codigoSugerido).toBe('E-0007');
  });

  it('nueva sin alumno: nada decidido, como al abrirla desde Matriculación', () => {
    expect(arranqueDelFormulario({ matricula: null, estudianteId: null, alumno: null })).toEqual({
      matricula: null,
      estudianteFijoId: null,
      estudianteFijoNombre: null,
      periodosOcupados: [],
      esPrimera: false,
      codigoSugerido: '',
    });
  });
});

describe('cargarArranque: abrir la dirección sola carga lo que antes pasaba quien abría el diálogo', () => {
  const MATRICULA = {
    id: 45, estudianteId: 9, periodoId: 3, cursoId: 21, documentoListaId: 4,
    fechaInscripcion: '2026-08-20', estado: 'activa', codigoMatricula: 'M-45', notas: 'Viene de traslado',
    conceptosIds: [31], conceptoMensualidadId: 31,
  };
  const ALUMNO = { id: 9, nombres: 'Alumno', apellidos: 'De Ejemplo', codigo: 'E-0007', codigoRne: 'RNE-0009' };
  const SUYAS = [
    { id: 45, periodoId: 3, estado: 'activa' },
    { id: 12, periodoId: 2, estado: 'finalizada' },
  ];

  const RUTA_MATRICULA = '/api/administracion-escolar/matriculas/45';
  const RUTA_ALUMNO    = '/api/administracion-escolar/estudiantes/9';
  const RUTA_SUYAS     = '/api/administracion-escolar/estudiantes/9/matriculas';

  /** Una API de mentira: contesta lo que se le diga a cada ruta y apunta qué se le pidió. */
  function api(respuestas: Record<string, { status: number; cuerpo?: unknown } | 'sin-red' | 'no-es-json'>) {
    const pedidas: string[] = [];
    const pedir: Pedir = async (ruta) => {
      pedidas.push(ruta);
      const r = respuestas[ruta];
      if (r === undefined) throw new Error(`ruta que nadie esperaba: ${ruta}`);
      if (r === 'sin-red') throw new TypeError('Failed to fetch');
      if (r === 'no-es-json') {
        return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
      }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.cuerpo };
    };
    return { pedir, pedidas };
  }

  const todoBien = {
    [RUTA_MATRICULA]: { status: 200, cuerpo: { matricula: MATRICULA } },
    [RUTA_ALUMNO]:    { status: 200, cuerpo: { estudiante: ALUMNO } },
    [RUTA_SUYAS]:     { status: 200, cuerpo: { matriculas: SUYAS } },
  };
  const editar = { modo: 'editar' as const, matriculaId: 45, estudianteId: null };

  it('editar: pide la matrícula, y con su alumno, a él y a sus matrículas', async () => {
    const { pedir, pedidas } = api(todoBien);
    const carga = await cargarArranque<typeof MATRICULA>(editar, pedir);
    // La matrícula primero: de ella sale de quién es.
    expect(pedidas[0]).toBe(RUTA_MATRICULA);
    expect(pedidas.slice(1).sort()).toEqual([RUTA_ALUMNO, RUTA_SUYAS].sort());
    expect(carga).toEqual({
      estado: 'lista',
      arranque: {
        matricula: MATRICULA,
        estudianteFijoId: 9,
        estudianteFijoNombre: 'Alumno De Ejemplo',
        periodosOcupados: [3],
        esPrimera: false,
        codigoSugerido: '',
      },
    });
  });

  it('editar: la matrícula llega ENTERA, con el listado de documentos que ni la ficha ni el listado traían', async () => {
    const carga = await cargarArranque<typeof MATRICULA>(editar, api(todoBien).pedir);
    if (carga.estado !== 'lista') throw new Error('tenía que cargar');
    expect(carga.arranque.matricula?.documentoListaId).toBe(4);
    expect(carga.arranque.matricula?.notas).toBe('Viene de traslado');
  });

  it('editar: 404 o 400 es «no existe o no es de este colegio», y ya no se pide nada más', async () => {
    for (const status of [404, 400]) {
      const { pedir, pedidas } = api({ [RUTA_MATRICULA]: { status, cuerpo: { error: 'No encontrada' } } });
      expect(await cargarArranque(editar, pedir)).toEqual({ estado: 'no-existe', que: 'matricula' });
      expect(pedidas).toEqual([RUTA_MATRICULA]);
    }
  });

  it('editar: un id de la dirección que no era un número ni se pide', async () => {
    const { pedir, pedidas } = api({});
    expect(await cargarArranque({ modo: 'editar', matriculaId: null, estudianteId: null }, pedir))
      .toEqual({ estado: 'no-existe', que: 'matricula' });
    expect(pedidas).toEqual([]);
  });

  it('editar: cualquier otro error es un fallo que se puede reintentar, no un «no existe»', async () => {
    for (const status of [500, 502, 401, 403]) {
      const { pedir } = api({ [RUTA_MATRICULA]: { status, cuerpo: { error: 'x' } } });
      expect(await cargarArranque(editar, pedir)).toEqual({ estado: 'fallo' });
    }
    expect(await cargarArranque(editar, api({ [RUTA_MATRICULA]: 'sin-red' }).pedir)).toEqual({ estado: 'fallo' });
    expect(await cargarArranque(editar, api({ [RUTA_MATRICULA]: 'no-es-json' }).pedir)).toEqual({ estado: 'fallo' });
    // Un 200 sin matrícula dentro tampoco es una matrícula.
    expect(await cargarArranque(editar, api({ [RUTA_MATRICULA]: { status: 200, cuerpo: {} } }).pedir))
      .toEqual({ estado: 'fallo' });
  });

  it('editar: si falla el alumno o sus matrículas no se enseña un formulario a medias', async () => {
    for (const rota of [RUTA_ALUMNO, RUTA_SUYAS]) {
      expect(await cargarArranque(editar, api({ ...todoBien, [rota]: { status: 500 } }).pedir)).toEqual({ estado: 'fallo' });
      expect(await cargarArranque(editar, api({ ...todoBien, [rota]: 'sin-red' }).pedir)).toEqual({ estado: 'fallo' });
    }
    // La matrícula existe, así que su alumno también: un 404 ahí es un fallo.
    expect(await cargarArranque(editar, api({ ...todoBien, [RUTA_ALUMNO]: { status: 404 } }).pedir))
      .toEqual({ estado: 'fallo' });
  });

  it('nueva con `?estudiante=`: lo mismo que al abrirla desde su ficha, sin pedir ninguna matrícula', async () => {
    const { pedir, pedidas } = api({
      [RUTA_ALUMNO]: { status: 200, cuerpo: { estudiante: ALUMNO } },
      [RUTA_SUYAS]:  { status: 200, cuerpo: { matriculas: [] } },
    });
    expect(await cargarArranque({ modo: 'nueva', matriculaId: null, estudianteId: 9 }, pedir)).toEqual({
      estado: 'lista',
      arranque: {
        matricula: null,
        estudianteFijoId: 9,
        estudianteFijoNombre: 'Alumno De Ejemplo',
        periodosOcupados: [],
        esPrimera: true,
        codigoSugerido: 'RNE-0009',
      },
    });
    expect(pedidas.sort()).toEqual([RUTA_ALUMNO, RUTA_SUYAS].sort());
  });

  it('nueva con un alumno que ya tuvo matrículas: no es la primera y sus activas ocupan', async () => {
    const { pedir } = api({
      [RUTA_ALUMNO]: { status: 200, cuerpo: { estudiante: ALUMNO } },
      [RUTA_SUYAS]:  { status: 200, cuerpo: { matriculas: SUYAS } },
    });
    const carga = await cargarArranque({ modo: 'nueva', matriculaId: null, estudianteId: 9 }, pedir);
    if (carga.estado !== 'lista') throw new Error('tenía que cargar');
    expect(carga.arranque.esPrimera).toBe(false);
    expect(carga.arranque.periodosOcupados).toEqual([3]);
  });

  it('nueva con un alumno que no existe o es de otro colegio: lo dice SU ruta, no la lista vacía', async () => {
    // La ruta de sus matrículas contesta 200 y una lista vacía también para un
    // alumno ajeno: leída sola diría «nunca estuvo matriculado».
    const { pedir } = api({
      [RUTA_ALUMNO]: { status: 404, cuerpo: { error: 'No encontrado' } },
      [RUTA_SUYAS]:  { status: 200, cuerpo: { matriculas: [] } },
    });
    expect(await cargarArranque({ modo: 'nueva', matriculaId: null, estudianteId: 9 }, pedir))
      .toEqual({ estado: 'no-existe', que: 'estudiante' });
  });

  it('nueva sin alumno: no pide nada, el formulario trae la lista para elegirlo', async () => {
    const { pedir, pedidas } = api({});
    expect(await cargarArranque({ modo: 'nueva', matriculaId: null, estudianteId: null }, pedir)).toEqual({
      estado: 'lista',
      arranque: {
        matricula: null,
        estudianteFijoId: null,
        estudianteFijoNombre: null,
        periodosOcupados: [],
        esPrimera: false,
        codigoSugerido: '',
      },
    });
    expect(pedidas).toEqual([]);
  });
});

describe('titulosDeMatricula: los mismos textos que llevaba el diálogo', () => {
  it('al editar', () => {
    expect(titulosDeMatricula({ editando: true, esPrimera: false })).toEqual({
      titulo: 'Editar matrícula',
      subtitulo: 'Corrige el curso, la fecha o el estado de esta inscripción.',
    });
    // Editando no hay «primera vez» que valga.
    expect(titulosDeMatricula({ editando: true, esPrimera: true }).titulo).toBe('Editar matrícula');
  });

  it('al inscribir a quien nunca estuvo matriculado', () => {
    expect(titulosDeMatricula({ editando: false, esPrimera: true })).toEqual({
      titulo: 'Matricular estudiante',
      subtitulo: 'Elige el período y el curso. De aquí sale su código de matrícula.',
    });
  });

  it('en cualquier otra matrícula nueva', () => {
    expect(titulosDeMatricula({ editando: false, esPrimera: false })).toEqual({
      titulo: 'Nueva matrícula',
      subtitulo: 'Inscribe un estudiante en un período y curso.',
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Lo que solo se puede comprobar leyendo el código                   */
/* ------------------------------------------------------------------ */

const DIALOGO    = 'components/administracion-escolar/MatriculaDialog.tsx';
const formulario = lee('components/administracion-escolar/MatriculaFormulario.tsx');
const pantalla   = lee('app/escolar/matriculas/_matricula-pantalla.tsx');
const paginaNueva  = lee('app/escolar/matriculas/nueva/page.tsx');
const paginaEditar = lee('app/escolar/matriculas/[id]/editar/page.tsx');
const ficha      = lee('app/escolar/estudiantes/[id]/_perfil-client.tsx');
const listado    = lee('app/escolar/matriculas/_page-client.tsx');
const alta       = lee('app/escolar/estudiantes/nuevo/_nuevo-client.tsx');

/** Todos los `.ts` y `.tsx` que cuelgan de una carpeta. */
function fuentesDe(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(join(raiz, carpeta))) {
    const relativa = `${carpeta}/${nombre}`;
    if (statSync(join(raiz, relativa)).isDirectory()) salida.push(...fuentesDe(relativa));
    else if (/\.tsx?$/.test(nombre)) salida.push(relativa);
  }
  return salida;
}

describe('del diálogo no queda nada', () => {
  it('el archivo se eliminó', () => {
    expect(existsSync(join(raiz, DIALOGO))).toBe(false);
  });

  it('nadie lo importa ni lo monta', () => {
    const quienes = [...fuentesDe('app'), ...fuentesDe('components'), ...fuentesDe('lib')]
      .filter((f) => /MatriculaDialog['"]|<MatriculaDialog\b/.test(lee(f)));
    expect(quienes).toEqual([]);
  });

  it('el formulario no trae el marco: ni `Dialog`, ni su cabecera, ni abierto/cerrado', () => {
    expect(formulario).not.toContain("@/components/ui/dialog'");
    expect(formulario).not.toContain('ModalHeader');
    expect(formulario).not.toContain('<Dialog');
    expect(formulario).not.toMatch(/\bopen\b/);
    expect(formulario).not.toMatch(/\bonClose\b|\bonSaved\b/);
    expect(formulario).toContain('export function MatriculaFormulario({');
  });

  it('ni la caja con desplazamiento propio en la que vivía la cuenta', () => {
    expect(formulario).not.toContain('overflow-y-auto');
    expect(formulario).not.toContain('min-h-[14rem]');
    expect(formulario).not.toMatch(/h-\[\d+vh\]/);
  });

  it('en la ficha y en el listado no queda estado ni JSX del diálogo', () => {
    for (const muerto of ['MatriculaDialog', 'matriculaEditar', 'reinscribirAbierto', 'matricularPedido', 'periodosOcupados']) {
      expect(ficha).not.toContain(muerto);
    }
    for (const muerto of ['MatriculaDialog', 'showForm', 'setEditando']) {
      expect(listado).not.toContain(muerto);
    }
  });
});

describe('los sitios que abrían el diálogo ahora navegan', () => {
  it('ficha del alumno, «Inscribir»: a la pantalla nueva, con él y con la ficha de vuelta', () => {
    expect(ficha).toContain('const volverAqui = rutaDeVueltaALaFicha(id, urlParams.toString());');
    expect(ficha).toMatch(
      /<Link href=\{rutaNuevaMatricula\(\{ estudianteId: estudiante\.id, volver: volverAqui \}\)\}>\s*<Plus className="h-4 w-4 mr-1\.5" \/>Inscribir/,
    );
    // Sigue saliendo solo a quien puede gestionar y solo sin matrículas.
    expect(ficha).toMatch(/\{matriculas\.length === 0 \? \(\s*puedeGestionar && \(\s*<Button asChild size="sm" variant="outline">/);
  });

  it('ficha del alumno, «Editar matrícula»: a la pantalla de editar esa matrícula', () => {
    expect(ficha).toContain('onEditarMatricula={(mid) => router.push(rutaEditarMatricula(mid, volverAqui))}');
  });

  it('ficha del alumno: ya no abre nada sola con `?matricular=1`', () => {
    expect(ficha).not.toContain("'matricular'");
    expect(ficha).not.toContain('useSearchParams');
  });

  it('Matriculación, «Nueva matrícula» y el lápiz: a las dos pantallas, con el listado de vuelta', () => {
    expect(listado).toContain("const volverAqui = qs ? `/escolar/matriculas?${qs}` : '/escolar/matriculas';");
    expect(listado).toContain('router.push(rutaNuevaMatricula({ volver: volverAqui }));');
    expect(listado).toContain('router.push(rutaEditarMatricula(m.id, volverAqui));');
    // Los dos «Nueva matrícula» (el de arriba, con sus otras formas en la
    // flecha, y el de la lista vacía) y el lápiz siguen colgando de lo mismo.
    expect(listado.split('onClick={abrirNueva}').length - 1).toBe(1);
    expect(listado).toContain('<BotonMatricular onNueva={abrirNueva}');
    expect(listado).toContain('onEditar={abrirEdicion}');
  });

  it('Matriculación vuelve a lo que se estaba mirando: filtros, página y fila van en la URL', () => {
    expect(listado).toContain('const { params: urlParams, setParams } = useUrlParams();');
    expect(listado).toContain('const qs = urlParams.toString();');
    for (const parametro of ["urlParams.get('q')", "urlParams.get('periodo')", "urlParams.get('estado')", "urlParams.get('page')", "urlParams.get('matricula')"]) {
      expect(listado).toContain(parametro);
    }
    // `useSearchParams` exige un límite de Suspense por encima.
    expect(lee('app/escolar/matriculas/page.tsx')).toMatch(/<Suspense>\s*<MatriculasClient \/>\s*<\/Suspense>/);
  });

  it('«Matricular en lote» no es parte de esto: sigue siendo su diálogo', () => {
    expect(listado).toContain('<MatriculaLoteDialog');
    expect(existsSync(join(raiz, 'components/administracion-escolar/MatriculaLoteDialog.tsx'))).toBe(true);
  });

  it('el alta de un alumno entra derecho a matricularlo, sin pasar por su ficha', () => {
    expect(alta).toContain('router.push(rutaNuevaMatricula({ estudianteId: data.estudiante.id }));');
    expect(alta).not.toContain('matricular=1');
  });
});

describe('las dos pantallas', () => {
  it('existen las dos direcciones y montan la misma pantalla', () => {
    expect(paginaNueva).toContain("import MatriculaPantalla from '../_matricula-pantalla';");
    expect(paginaEditar).toContain("import MatriculaPantalla from '../../_matricula-pantalla';");
    expect(paginaNueva).toContain('modo="nueva"');
    expect(paginaEditar).toContain('modo="editar"');
  });

  it('exigen el permiso de gestionar ANTES de pintar nada: el mismo que enseñaba los botones', () => {
    for (const pagina of [paginaNueva, paginaEditar]) {
      const permiso = pagina.indexOf("await requirePermission('administracion-escolar:gestionar');");
      expect(permiso).toBeGreaterThan(-1);
      expect(pagina.indexOf('<MatriculaPantalla')).toBeGreaterThan(permiso);
    }
  });

  it('validan en el servidor lo que viene en la dirección', () => {
    expect(paginaNueva).toContain('const estudianteId = idDeRuta(estudiante);');
    expect(paginaNueva).toContain('volver={volverSeguro(volver)}');
    expect(paginaEditar).toContain('matriculaId={idDeRuta(id)}');
    expect(paginaEditar).toContain('volver={volverSeguro(volver)}');
    // Next 15: `params` y `searchParams` son promesas.
    expect(paginaEditar).toContain('const { id } = await params;');
    expect(paginaEditar).toContain('const { volver } = await searchParams;');
    expect(paginaNueva).toContain('const { estudiante, volver } = await searchParams;');
  });

  it('la pantalla pide ella sola lo que antes llegaba por props, con la carga probada arriba y `fetch`', () => {
    expect(pantalla).toContain(
      'cargarArranque<MatriculaDeLaRuta>({ modo, matriculaId, estudianteId }, (ruta) => fetch(ruta))',
    );
    // Y vuelve a pedirlo al reintentar o si cambia la dirección.
    expect(pantalla).toContain('}, [modo, matriculaId, estudianteId, intento]);');
  });

  it('cada final de la carga tiene su pantalla, y de todas se puede salir', () => {
    expect(pantalla).toContain("if (carga.estado === 'no-existe') {");
    expect(pantalla).toContain("'Esa matrícula no existe o no pertenece a este colegio.'");
    expect(pantalla).toContain("'Ese estudiante no existe o no pertenece a este colegio.'");
    expect(pantalla).toContain("{carga.estado === 'fallo' ? (");
    expect(pantalla).toContain('<Button variant="outline" onClick={() => setIntento((n) => n + 1)}>Intentar otra vez</Button>');
    expect(pantalla).toContain('<div role="status"');
    // El enlace de volver: uno en «no existe» y otro arriba en todo lo demás.
    expect(pantalla.split('<Link href={salida.href} onClick={alPulsarVolver}').length - 1).toBe(2);
  });

  it('el formulario se monta solo con todo cargado, y con los datos del estado', () => {
    const monta = pantalla.indexOf('<MatriculaFormulario');
    expect(monta).toBeGreaterThan(pantalla.indexOf(") : carga.estado === 'cargando' || cargandoPermisos ? ("));
    expect(pantalla).toContain('matricula={carga.arranque.matricula}');
    expect(pantalla).toContain('periodosOcupados={carga.arranque.periodosOcupados}');
    expect(pantalla).toContain('codigoSugerido={carga.arranque.codigoSugerido}');
  });

  it('al guardar avisa y regresa; al cancelar regresa sin más', () => {
    expect(pantalla).toContain("toast.success(editando ? 'Matrícula actualizada' : 'Matrícula creada');");
    expect(pantalla).toContain('salir(destinoAlSalir({ volver, estudianteId: deQuien }).href);');
    expect(pantalla).toContain('onCancelar={() => salir(salida.href)}');
    // Salir no deja el formulario en el historial detrás del origen: se
    // retrocede cuando el origen es la entrada anterior, y si no se reemplaza.
    expect(pantalla).toContain('if (volver && hayHistorialPropio()) router.back();');
    expect(pantalla).toContain('else router.replace(destino);');
    expect(pantalla).not.toContain('router.push(');
    expect(pantalla).toContain('const salida = destinoAlSalir({ volver, estudianteId: alumnoId });');
  });

  it('la cabecera lleva el título y el subtítulo de siempre', () => {
    expect(pantalla).toContain('<Cabecera {...titulosDeMatricula({ editando, esPrimera: carga.arranque.esPrimera })} />');
    expect(pantalla).toContain('<h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>');
  });

  it('«Cancelar» y guardar van en una barra pegada abajo, con el error dentro', () => {
    const barra = formulario.indexOf('<div className="sticky bottom-0 ');
    expect(barra).toBeGreaterThan(-1);
    const dentro = formulario.slice(barra, formulario.indexOf('function InlineCrear'));
    expect(dentro).toContain('<p role="alert"');
    expect(dentro).toContain('{error}');
    expect(dentro).toContain('<Button variant="outline" onClick={onCancelar} disabled={saving}>Cancelar</Button>');
    // Guardar ya no depende de la lista de conceptos: no la manda (la guarda
    // su tarjeta, en el acto), así que no espera por ella.
    expect(dentro).toContain('<Button className="w-full sm:w-auto" onClick={guardar} disabled={saving}>');
    expect(formulario).not.toContain('cobrosSinCargar');
    expect(dentro).toContain(": (editando ? 'Guardar cambios' : 'Crear matrícula')}");
    // El error no se pinta en ningún otro sitio del formulario principal.
    expect(formulario.slice(0, barra)).not.toContain('{error}');
  });
});

describe('la ficha del alumno enseña lo nuevo al volver', () => {
  it('pide sus datos con la clave que el formulario marca como vieja', () => {
    expect(claveFichaEstudiante(12)).toBe('/api/administracion-escolar/estudiantes/12/ficha');
    expect(ficha).toContain('claveFichaEstudiante(id),');
    expect(ficha).not.toContain('/api/administracion-escolar/estudiantes/${id}/ficha');
    expect(formulario).toContain('void revalidar(claveFichaEstudiante(estudianteId));');
    expect(formulario).toContain("import { mutate as revalidar } from 'swr';");
  });

  it('se marca en CADA escritura: al guardar la matrícula y al cambiar algo en la lista de conceptos', () => {
    expect(formulario.split('avisarALaFicha(estudianteId);').length - 1).toBe(2);
    // Al guardar: antes de avisar a la pantalla, que es la que navega.
    const guardado = formulario.indexOf('onGuardado(estudianteId);');
    expect(guardado).toBeGreaterThan(-1);
    expect(formulario.lastIndexOf('avisarALaFicha(estudianteId);', guardado)).toBeGreaterThan(-1);
    // Al cambiar un precio, quitar o agregar un concepto: la lista avisa, y eso
    // ya está guardado se pulse «Guardar cambios» o no.
    expect(formulario).toMatch(
      /onCambio=\{\(\) => \{[\s\S]{0,300}?if \(estudianteId\) avisarALaFicha\(estudianteId\);\s*\}\}/,
    );
    const lista = readFileSync(join(__dirname, '..', '..', 'components/administracion-escolar/ConceptosDeLaMatricula.tsx'), 'utf8');
    // Las tres acciones avisan: precio, quitar y agregar.
    expect(lista.split('onCambio();').length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe('la mudanza no tocó lo que se guarda', () => {
  it('una sola validación antes de guardar, con el mensaje de siempre', () => {
    expect(formulario).toContain('if (!form.estudianteId || !form.periodoId || !form.cursoId) {');
    expect(formulario).toContain("setError('Estudiante, período y curso son obligatorios'); return;");
  });

  it('crear es un POST y editar un PATCH a la matrícula, con el mismo cuerpo', () => {
    expect(formulario).toContain('? `/api/administracion-escolar/matriculas/${matricula.id}`');
    expect(formulario).toContain(": '/api/administracion-escolar/matriculas',");
    expect(formulario).toContain("method: editando ? 'PATCH' : 'POST',");
    for (const campo of [
      '...(editando ? {} : { estudianteId: Number(form.estudianteId) }),',
      'periodoId: Number(form.periodoId),',
      'cursoId: Number(form.cursoId),',
      'documentoListaId: form.documentoListaId ? Number(form.documentoListaId) : null,',
      'codigoMatricula: form.codigoMatricula || null,',
      'fechaInscripcion: form.fechaInscripcion || null,',
      'notas: form.notas || null,',
      // Al editar ya no viaja la lista de conceptos: la guarda la tarjeta, en el acto.
      '...(editando ? { estado: form.estado } : { conceptos }),',
    ]) {
      expect(formulario).toContain(campo);
    }
  });

  it('el precio propio del alumno sigue yendo ANTES de la matrícula, y se deshace si esta falla', () => {
    const precio    = formulario.indexOf("fetch('/api/administracion-escolar/concepto-precios', {");
    const matricula = formulario.indexOf("method: editando ? 'PATCH' : 'POST',");
    expect(precio).toBeGreaterThan(-1);
    expect(matricula).toBeGreaterThan(precio);
    expect(formulario).toContain('if (!editando && preciosPropios.length > 0) {');
    expect(formulario).toContain("objetivoTipo: 'estudiante',");
    expect(formulario).toContain('objetivoId:   Number(form.estudianteId),');
    expect(formulario).toContain('devengar:     false,');
    expect(formulario.split('await revertirPrecios(preciosEscritos);').length - 1).toBe(2);
  });

  it('el monto de un concepto se guarda al momento, con sus tres comprobaciones', () => {
    // Ya no se corrige cargo por cargo desde aquí: se cambia el precio del
    // concepto, y eso va a sus cargos sin factura por la misma ruta de antes.
    const lista = readFileSync(join(__dirname, '..', '..', 'components/administracion-escolar/ConceptosDeLaMatricula.tsx'), 'utf8');
    expect(lista).toContain("if (centavos == null) { toast.error('Escribe un monto válido'); return; }");
    expect(lista).toContain('if (centavos === 0) {');
    expect(lista).toContain('if (f.montosLibres.length === 1 && f.montosLibres[0] === centavos) { setAbierto(null); return; }');
    expect(lista).toContain("method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ montoCentavos: centavos }),");
  });

  it('los cargos y los cobros de la matrícula se piden a las mismas rutas', () => {
    expect(formulario).toContain('fetch(`/api/administracion-escolar/cargos?matriculaId=${matriculaId}&porPagina=200`)');
    expect(formulario).toContain('fetch(`/api/administracion-escolar/matriculas/${matricula.id}`)');
    expect(formulario).toContain("fetch('/api/administracion-escolar/conceptos')");
  });

  it('quién puede tocar qué dentro sigue saliendo de los mismos permisos', () => {
    expect(formulario).toContain("const puedeConfigurar = permissions.includes('administracion-escolar:configurar');");
    expect(formulario).toContain("const puedeGestionar = permissions.includes('administracion-escolar:gestionar');");
    // Una sola tarjeta al editar: la lista de conceptos.
    expect(formulario.split('editable={puedeGestionar}').length - 1).toBe(1);
    expect(formulario).toContain('onPrecios={puedeGestionar ? setPreciosPropios : undefined}');
    expect(formulario).toContain('{puedeConfigurar && (');
  });
});
