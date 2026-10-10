import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ERRORES_AL_COMPROBAR_EL_COBRO, ERRORES_PASO_1,
  alumnosConCargoVivo, alumnosEnLetras, avisoDeComprobacion, avisoDeMonto, avisosDeConfirmar,
  claveDeQuienes, cobroConEseNombre, cobrosALaVista, comprobarIntento, consejoTodosLoTienen,
  ecoDeLaFecha, ecoDelMonto, esCobroFijo, esFechaValida, fechaEnLetras, filtrarAlumnos,
  fraseDeDuplicados, fraseDeLoCobrado, fraseDeMarcados, fraseDeNoEncontrados, fraseDeOmitidos,
  fraseDeQuitados, fraseDeSinComprobar, fraseDelCobro, leerMonto, listarNombres,
  marcarLosQueYaLoTienen, marcasTrasRevisar, mensajeDeError, mesEnLetras, momentoDeLaFecha,
  nombresMarcados, normalizar, ordenarParaRevisar, resumenAQuien, resumenQueSeCobra, sumarDias,
  tituloDelResultado, tituloTodosLoTienen,
  type CuerpoGenerar, type DatosDeLaFrase, type DetalleRevisado, type PedidoRevisado,
} from '@/lib/administracion-escolar/cargo-lote';

/**
 * «Cargo a varios alumnos» le crea la misma deuda a un grupo de una vez. Lo
 * único que separa a quien la usa de cobrarle a quien no era es lo que la
 * pantalla le DICE antes de confirmar, así que aquí se prueba palabra por
 * palabra: la frase, el total, la fecha, y lo que pasa cuando algo falla.
 *
 * Todo lo de abajo es inventado y se nota: «…de mentira», «Alumna Inventada Uno».
 */
const HOY = '2026-10-09';
const VIERNES = '2026-10-16';

const frase = (d: Partial<DatosDeLaFrase>) => fraseDelCobro({
  montoCentavos: 15000,
  cobro: 'Día de cine de mentira',
  mesTexto: null,
  aMano: false,
  grupo: 'Sala de tareas de Mentira',
  marcados: 5,
  enLaLista: 5,
  fechaVencimiento: VIERNES,
  hoy: HOY,
  ...d,
});

describe('fraseDelCobro: lo que se lee justo antes de cobrar', () => {
  it('un grupo entero', () => {
    expect(frase({}).principal)
      .toBe('Les vas a cobrar RD$150.00 de «Día de cine de mentira» a 5 alumnos de Sala de tareas de Mentira.');
  });

  it('parte del grupo: «a 3 de los 5» avisa de que no son todos', () => {
    // Da igual por qué no son todos: se les quitó la marca o ya lo tenían.
    expect(frase({ marcados: 3 }).principal)
      .toBe('Les vas a cobrar RD$150.00 de «Día de cine de mentira» a 3 de los 5 alumnos de Sala de tareas de Mentira.');
  });

  it('un solo alumno va en singular', () => {
    expect(frase({ marcados: 1, enLaLista: 1 }).principal)
      .toBe('Le vas a cobrar RD$150.00 de «Día de cine de mentira» a 1 alumno de Sala de tareas de Mentira.');
  });

  it('uno de varios', () => {
    expect(frase({ marcados: 1 }).principal)
      .toBe('Le vas a cobrar RD$150.00 de «Día de cine de mentira» a 1 de los 5 alumnos de Sala de tareas de Mentira.');
  });

  it('todo el colegio suena a lo grande que es', () => {
    expect(frase({ grupo: null, marcados: 148, enLaLista: 148 }).principal)
      .toBe('Les vas a cobrar RD$150.00 de «Día de cine de mentira» a los 148 alumnos de todo el colegio.');
  });

  it('todo el colegio, en parte', () => {
    expect(frase({ grupo: null, marcados: 140, enLaLista: 148 }).principal)
      .toBe('Les vas a cobrar RD$150.00 de «Día de cine de mentira» a 140 de los 148 alumnos de todo el colegio.');
  });

  it('solo algunos: no dice «de los 148», dice que los marcó la persona', () => {
    expect(frase({ cobro: 'Excursión de mentira', aMano: true, grupo: null, marcados: 8, enLaLista: 148 }).principal)
      .toBe('Les vas a cobrar RD$150.00 de «Excursión de mentira» a 8 alumnos que marcaste tú, uno por uno.');
  });

  it('solo algunos, uno', () => {
    expect(frase({ cobro: 'Excursión de mentira', aMano: true, grupo: null, marcados: 1, enLaLista: 148 }).principal)
      .toBe('Le vas a cobrar RD$150.00 de «Excursión de mentira» a 1 alumno que marcaste tú.');
  });

  it('una mensualidad dice de qué mes es', () => {
    expect(frase({
      montoCentavos: 350000, cobro: 'Mensualidad de mentira', mesTexto: 'octubre de 2026',
      grupo: 'Primero de Primaria de Mentira · Matutina', marcados: 20, enLaLista: 20,
    }).principal).toBe(
      'Les vas a cobrar RD$3,500.00 de «Mensualidad de mentira» de octubre de 2026 a 20 alumnos de Primero de Primaria de Mentira · Matutina.',
    );
  });

  it('el total es lo marcado por el monto', () => {
    expect(frase({}).total).toBe('Total: RD$750.00');
    expect(frase({}).totalCentavos).toBe(75000);
    expect(frase({ marcados: 3 }).total).toBe('Total: RD$450.00');
    expect(frase({ grupo: null, marcados: 148, enLaLista: 148 }).totalCentavos).toBe(148 * 15000);
  });

  it('hasta cuándo pueden pagar, con el día de la semana', () => {
    expect(frase({}).plazo).toBe('Tienen hasta el viernes 16 de octubre de 2026 para pagar.');
    expect(frase({ marcados: 1 }).plazo).toBe('Tiene hasta el viernes 16 de octubre de 2026 para pagar.');
  });

  it('una fecha de hoy o pasada se dice: el cargo nace atrasado', () => {
    expect(frase({ fechaVencimiento: HOY }).plazo)
      .toBe('Tienen hasta hoy para pagar: desde mañana les sale como atrasado.');
    expect(frase({ fechaVencimiento: '2026-10-01' }).plazo)
      .toBe('La fecha límite (01/10/2026) ya pasó: les sale como atrasado desde hoy.');
    expect(frase({ fechaVencimiento: HOY, marcados: 1 }).plazo)
      .toBe('Tiene hasta hoy para pagar: desde mañana le sale como atrasado.');
  });

  it('sin fecha también se dice', () => {
    expect(frase({ fechaVencimiento: null }).plazo).toBe('Sin fecha límite para pagar.');
  });

  it('sin nadie marcado no hay frase: no hay nada que cobrar', () => {
    const vacia = frase({ marcados: 0 });
    expect(vacia.principal).toBeNull();
    expect(vacia.totalCentavos).toBe(0);
  });
});

describe('lo que acompaña a la frase', () => {
  it('a quién se le quitó la marca, con hasta tres nombres', () => {
    expect(fraseDeQuitados(['Alumna Inventada Uno', 'Alumno Inventado Dos']))
      .toBe('No se le cobra a: Alumna Inventada Uno y Alumno Inventado Dos.');
    expect(fraseDeQuitados([
      'Alumna Inventada Uno', 'Alumno Inventado Dos', 'Alumna Inventada Tres',
      'Alumno Inventado Cuatro', 'Alumna Inventada Cinco', 'Alumno Inventado Seis', 'Alumna Inventada Siete',
    ])).toBe('No se le cobra a: Alumna Inventada Uno, Alumno Inventado Dos, Alumna Inventada Tres y 4 más.');
  });

  it('cuántos ya lo tienen', () => {
    expect(fraseDeDuplicados(2)).toBe('2 ya lo tienen y no se les cobra otra vez.');
    expect(fraseDeDuplicados(1)).toBe('1 ya lo tiene y no se le cobra otra vez.');
  });

  it('el titular de «todos ya lo tienen» nombra el grupo y el cobro', () => {
    expect(tituloTodosLoTienen(5, 'Sala de tareas de Mentira', 'Día de cine de mentira'))
      .toBe('Los 5 alumnos de «Sala de tareas de Mentira» ya tienen «Día de cine de mentira»');
    expect(tituloTodosLoTienen(1, 'Sala de tareas de Mentira', 'Día de cine de mentira'))
      .toBe('El único alumno de «Sala de tareas de Mentira» ya tiene «Día de cine de mentira»');
    expect(tituloTodosLoTienen(148, null, 'Día de cine de mentira'))
      .toBe('Los 148 alumnos del colegio ya tienen «Día de cine de mentira»');
  });

  it('con una mensualidad, «todos ya lo tienen» dice de qué mes y manda a elegir otro mes', () => {
    // Antes decía «a nadie se le cobra dos veces en el mismo año escolar» y
    // «cóbralo como un cobro nuevo, con otro nombre»: falso para una
    // mensualidad, que se cobra cada mes, y así nacían las «Mensualidad 2».
    expect(tituloTodosLoTienen(96, 'Primaria de Mentira · Matutina', 'Mensualidad de mentira', 'octubre de 2026'))
      .toBe('Los 96 alumnos de «Primaria de Mentira · Matutina» ya tienen «Mensualidad de mentira» de octubre de 2026');
    for (const puedeCrear of [true, false]) {
      const consejo = consejoTodosLoTienen({ mesTexto: 'octubre de 2026', puedeCrear });
      expect(consejo.accion).toBe('otro-mes');
      expect(consejo.texto).toBe('Ya tienen la de ese mes. Vuelve al paso 1 y elige otro mes, o elige otro grupo.');
      expect(consejo.texto).not.toContain('cobro nuevo');
      expect(consejo.texto).not.toContain('año escolar');
    }
  });

  it('con un cobro suelto, «todos ya lo tienen» ofrece el cobro nuevo solo a quien puede crearlo', () => {
    const conPermiso = consejoTodosLoTienen({ mesTexto: null, puedeCrear: true });
    expect(conPermiso.accion).toBe('cobro-nuevo');
    expect(conPermiso.texto).toContain('cóbralo como un cobro nuevo, con otro nombre');
    const sinPermiso = consejoTodosLoTienen({ mesTexto: null, puedeCrear: false });
    expect(sinPermiso.accion).toBeNull();
    expect(sinPermiso.texto).toContain('pídele a un administrador de tu colegio');
    for (const consejo of [conPermiso, sinPermiso]) {
      expect(consejo.texto).toContain('A nadie se le cobra dos veces lo mismo en el mismo año escolar');
      expect(consejo.texto).toMatch(/Si no, elige otro grupo\.$/);
    }
  });

  it('marcando uno por uno se dicen los nombres, no solo cuántos', () => {
    // «a 8 alumnos que marcaste tú» es verdad aunque uno de los ocho sea el de
    // la fila de al lado: con los nombres delante se ve antes de confirmar.
    expect(fraseDeMarcados(['Alumna Inventada Uno', 'Alumno Inventado Dos']))
      .toBe('Marcaste a: Alumna Inventada Uno y Alumno Inventado Dos.');
    const ocho = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho'].map((n) => `${n} de Mentira`);
    expect(fraseDeMarcados(ocho))
      .toBe('Marcaste a: Uno de Mentira, Dos de Mentira, Tres de Mentira, Cuatro de Mentira, Cinco de Mentira y 3 más.');
    // En el diálogo de confirmar caben más.
    expect(fraseDeMarcados(ocho, 12)).toContain('Siete de Mentira y Ocho de Mentira.');
  });

  it('las líneas de los pasos ya contestados', () => {
    const base = { montoCentavos: 15000, cobro: 'Día de cine de mentira', mesTexto: null };
    expect(resumenQueSeCobra({ ...base, fechaVencimiento: VIERNES }))
      .toBe('RD$150.00 de «Día de cine de mentira» · hasta el 16/10/2026');
    expect(resumenQueSeCobra({ ...base, fechaVencimiento: null }))
      .toBe('RD$150.00 de «Día de cine de mentira» · sin fecha límite');
    expect(resumenQueSeCobra({
      montoCentavos: 350000, cobro: 'Mensualidad de mentira', mesTexto: 'octubre de 2026', fechaVencimiento: VIERNES,
    })).toBe('RD$3,500.00 de «Mensualidad de mentira» de octubre de 2026 · hasta el 16/10/2026');

    expect(resumenAQuien({ aMano: false, grupo: 'Sala de tareas de Mentira', total: 5 }))
      .toBe('Sala de tareas de Mentira · 5 alumnos');
    expect(resumenAQuien({ aMano: false, grupo: null, total: 148 })).toBe('Todo el colegio · 148 alumnos');
    expect(resumenAQuien({ aMano: true, grupo: null, total: 148 })).toBe('Solo algunos alumnos');
    expect(resumenAQuien({ aMano: false, grupo: 'Sala de tareas de Mentira', total: null }))
      .toBe('Sala de tareas de Mentira');
  });
});

describe('fraseDeLoCobrado: lo que se hizo', () => {
  const cobrado = (d: Partial<Parameters<typeof fraseDeLoCobrado>[0]>) => fraseDeLoCobrado({
    montoCentavos: 15000, cobro: 'Día de cine de mentira', mesTexto: null,
    aMano: false, grupo: 'Sala de tareas de Mentira', creados: 5,
    fechaVencimiento: VIERNES, hoy: HOY, ...d,
  });

  it('en plural, en singular, todo el colegio y solo algunos', () => {
    expect(cobrado({}).principal)
      .toBe('Les cobraste RD$150.00 de «Día de cine de mentira» a 5 alumnos de Sala de tareas de Mentira.');
    expect(cobrado({ creados: 1 }).principal)
      .toBe('Le cobraste RD$150.00 de «Día de cine de mentira» a 1 alumno de Sala de tareas de Mentira.');
    expect(cobrado({ grupo: null, creados: 148 }).principal)
      .toBe('Les cobraste RD$150.00 de «Día de cine de mentira» a 148 alumnos de todo el colegio.');
    expect(cobrado({ cobro: 'Excursión de mentira', aMano: true, grupo: null, creados: 8 }).principal)
      .toBe('Les cobraste RD$150.00 de «Excursión de mentira» a 8 alumnos que marcaste tú.');
  });

  it('el total y el plazo son los de lo que de verdad se creó', () => {
    // Se marcaron 5 y el servidor creó 4: la cuenta es con 4.
    const cuatro = cobrado({ creados: 4 });
    expect(cuatro.principal).toContain('a 4 alumnos');
    expect(cuatro.total).toBe('Total: RD$600.00');
    expect(cuatro.plazo).toBe('Tienen hasta el viernes 16 de octubre de 2026 para pagar.');
    expect(cobrado({ creados: 1 }).plazo).toBe('Tiene hasta el viernes 16 de octubre de 2026 para pagar.');
  });

  it('el titular y lo que se omitió', () => {
    expect(tituloDelResultado(5)).toBe('Listo: se crearon 5 cargos');
    expect(tituloDelResultado(1)).toBe('Listo: se creó 1 cargo');
    expect(tituloDelResultado(0)).toBe('No se creó ningún cargo');
    expect(fraseDeOmitidos(2)).toBe('2 ya lo tenían y no se les cobró otra vez.');
    expect(fraseDeOmitidos(1)).toBe('1 ya lo tenía y no se le cobró otra vez.');
  });

  it('a quién se marcó y ya no estaba en el grupo, con su nombre', () => {
    expect(fraseDeNoEncontrados(['Alumno Inventado Seis']))
      .toBe('No se le creó a Alumno Inventado Seis: ya no está matriculado en ese grupo.');
    expect(fraseDeNoEncontrados(['Alumno Inventado Seis', 'Alumna Inventada Siete']))
      .toBe('No se les creó a Alumno Inventado Seis y Alumna Inventada Siete: ya no están matriculados en ese grupo.');
  });
});

describe('fechas: días del calendario, no instantes', () => {
  it('la fecha que viene puesta es hoy más una semana', () => {
    expect(sumarDias('2026-10-09', 7)).toBe('2026-10-16');
  });

  it('cruza fin de mes, fin de año y el 29 de febrero', () => {
    expect(sumarDias('2026-10-28', 7)).toBe('2026-11-04');
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04');
    expect(sumarDias('2028-02-25', 7)).toBe('2028-03-03');
    expect(sumarDias('2026-10-09', 0)).toBe('2026-10-09');
  });

  it('se escribe con el día de la semana', () => {
    expect(fechaEnLetras('2026-10-16')).toBe('viernes 16 de octubre de 2026');
    expect(fechaEnLetras('2026-10-09')).toBe('viernes 9 de octubre de 2026');
    expect(fechaEnLetras('2027-01-04')).toBe('lunes 4 de enero de 2027');
    expect(fechaEnLetras('2026-03-01')).toBe('domingo 1 de marzo de 2026');
    expect(fechaEnLetras('no es una fecha')).toBe('');
  });

  it('el mes de una mensualidad', () => {
    expect(mesEnLetras(10, 2026)).toBe('octubre de 2026');
    expect(mesEnLetras(1, 2027)).toBe('enero de 2027');
  });

  it('distingue pasada, hoy, futura y sin fecha', () => {
    expect(momentoDeLaFecha('2026-10-08', HOY)).toBe('pasada');
    expect(momentoDeLaFecha(HOY, HOY)).toBe('hoy');
    expect(momentoDeLaFecha('2026-10-10', HOY)).toBe('futura');
    expect(momentoDeLaFecha('', HOY)).toBe('sin-fecha');
    expect(momentoDeLaFecha(null, HOY)).toBe('sin-fecha');
  });

  it('lo que se lee bajo el campo: avisa de hoy y de una fecha pasada, sin bloquear', () => {
    expect(ecoDeLaFecha(VIERNES, HOY)).toEqual({
      texto: 'Viernes 16 de octubre de 2026. Pasado ese día, al que no haya pagado le sale como atrasado.',
      aviso: false,
    });
    expect(ecoDeLaFecha(HOY, HOY)).toEqual({
      texto: 'Es hoy. Desde mañana, al que no haya pagado le sale como atrasado.', aviso: true,
    });
    expect(ecoDeLaFecha('2026-10-01', HOY)).toEqual({
      texto: 'Esa fecha ya pasó: les va a salir como atrasado desde hoy.', aviso: true,
    });
    expect(ecoDeLaFecha('', HOY)).toEqual({
      texto: 'Sin fecha límite: a nadie le sale como atrasado.', aviso: false,
    });
  });

  it('una fecha que no existe o de otro siglo no vale', () => {
    expect(esFechaValida('2026-10-16')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    // El campo de fecha deja teclear el año cifra a cifra.
    expect(esFechaValida('0026-10-16')).toBe(false);
    expect(esFechaValida('16/10/2026')).toBe(false);
  });
});

describe('leerMonto: lo que se teclea en «¿Cuánto paga cada alumno?»', () => {
  it('lee el número a secas', () => {
    expect(leerMonto('150')).toEqual({ centavos: 15000, problema: null });
    expect(leerMonto(' 150.50 ')).toEqual({ centavos: 15050, problema: null });
  });

  it('la coma es de miles: «1,100» son mil cien, no uno con diez', () => {
    expect(leerMonto('1,100')).toEqual({ centavos: 110000, problema: null });
    expect(leerMonto('1,100.50')).toEqual({ centavos: 110050, problema: null });
  });

  it('perdona el «RD$» de un monto copiado de otra pantalla', () => {
    expect(leerMonto('RD$1,100.00')).toEqual({ centavos: 110000, problema: null });
    expect(leerMonto('$150')).toEqual({ centavos: 15000, problema: null });
  });

  it('vacío y cero son «todavía no ha dicho cuánto»', () => {
    expect(leerMonto('').problema).toBe('vacio');
    expect(leerMonto('   ').problema).toBe('vacio');
    expect(leerMonto('0').problema).toBe('vacio');
    expect(leerMonto('0.00').problema).toBe('vacio');
  });

  it('lo que no es un número no se entiende', () => {
    expect(leerMonto('abc').problema).toBe('no-se-entiende');
    expect(leerMonto('1.2.3').problema).toBe('no-se-entiende');
    expect(leerMonto('-150').problema).toBe('no-se-entiende');
    expect(leerMonto('150 pesos').problema).toBe('no-se-entiende');
  });

  it('más de un millón por alumno es un dedo de más', () => {
    expect(leerMonto('1000000').problema).toBeNull();
    expect(leerMonto('1000000.01').problema).toBe('demasiado');
    expect(leerMonto('15000000').problema).toBe('demasiado');
  });

  it('cada problema tiene su frase, que dice qué hacer', () => {
    for (const texto of ['', 'abc', '15000000']) {
      const { problema } = leerMonto(texto);
      expect(problema).not.toBeNull();
      expect(ERRORES_PASO_1.monto[problema as NonNullable<typeof problema>]).toMatch(/\.$/);
    }
  });
});

describe('avisoDeMonto: un monto raro se dice, no se bloquea', () => {
  it('avisa de RD$10,000 en adelante', () => {
    expect(avisoDeMonto(1_000_000)).toBe('alto');
    expect(avisoDeMonto(1_500_000)).toBe('alto');
    expect(avisoDeMonto(999_999)).toBeNull();
  });

  it('avisa por debajo de RD$10', () => {
    expect(avisoDeMonto(999)).toBe('bajo');
    expect(avisoDeMonto(150)).toBe('bajo');
    expect(avisoDeMonto(1_000)).toBeNull();
  });

  it('calla entre medias', () => {
    expect(avisoDeMonto(15_000)).toBeNull();
    expect(avisoDeMonto(350_000)).toBeNull();
  });

  it('lo que se lee bajo el campo devuelve el número ya con sus comas', () => {
    expect(ecoDelMonto('150')).toEqual({ texto: 'RD$150.00 por alumno', aviso: false });
    expect(ecoDelMonto('1,100')).toEqual({ texto: 'RD$1,100.00 por alumno', aviso: false });
    expect(ecoDelMonto('15000')).toEqual({
      texto: 'Son RD$15,000.00 por alumno. Si te sobra un cero, corrígelo.', aviso: true,
    });
    expect(ecoDelMonto('1.50')).toEqual({
      texto: 'Son RD$1.50 por alumno. Mira si te faltan ceros.', aviso: true,
    });
    // A media tecla no se regaña: el error sale al pulsar «Continuar».
    expect(ecoDelMonto('')).toEqual({ texto: 'Solo el número, por ejemplo 150.', aviso: false });
    expect(ecoDelMonto('abc')).toEqual({ texto: 'Solo el número, por ejemplo 150.', aviso: false });
  });
});

const cuerpo = (d: Partial<CuerpoGenerar> = {}): CuerpoGenerar => ({
  periodoId: 900,
  cursoIds: [1200, 1210],
  conceptoId: 70,
  mes: null,
  anio: 2026,
  montoCentavos: 15000,
  fechaVencimiento: VIERNES,
  ...d,
});

const detalle = (
  estudianteId: number, nombre: string, resultado: DetalleRevisado['resultado'] = 'crear', codigo: string | null = null,
): DetalleRevisado => ({ estudianteId, matriculaId: estudianteId + 5000, nombre, codigo, resultado });

const LISTA: DetalleRevisado[] = [
  detalle(1, 'Alumna Inventada Uno'),
  detalle(2, 'Alumno Inventado Dos', 'duplicado'),
  detalle(3, 'José Inventado Tres', 'crear', 'EST-0003'),
  detalle(4, 'Alumna Inventada Cuatro', 'duplicado'),
  detalle(5, 'Alumno Inventado Cinco'),
];

describe('claveDeQuienes: qué pregunta es esta', () => {
  const clave = claveDeQuienes(cuerpo(), false);

  it('no cambia al corregir el monto o la fecha: la lista es la misma', () => {
    expect(claveDeQuienes(cuerpo({ montoCentavos: 20000 }), false)).toBe(clave);
    expect(claveDeQuienes(cuerpo({ fechaVencimiento: null }), false)).toBe(clave);
    expect(claveDeQuienes(cuerpo({ anio: 2027 }), false)).toBe(clave);
    // El orden en que lleguen las secciones tampoco.
    expect(claveDeQuienes(cuerpo({ cursoIds: [1210, 1200] }), false)).toBe(clave);
  });

  it('cambia con todo lo que decide quién sale en la lista o quién «ya lo tiene»', () => {
    expect(claveDeQuienes(cuerpo({ periodoId: 800 }), false)).not.toBe(clave);
    expect(claveDeQuienes(cuerpo({ cursoIds: [1200] }), false)).not.toBe(clave);
    expect(claveDeQuienes(cuerpo({ cursoIds: undefined }), false)).not.toBe(clave);
    expect(claveDeQuienes(cuerpo({ conceptoId: 71 }), false)).not.toBe(clave);
    expect(claveDeQuienes(cuerpo({ mes: 10 }), false)).not.toBe(clave);
    expect(claveDeQuienes(cuerpo(), true)).not.toBe(clave);
  });
});

describe('marcasTrasRevisar: quién viene marcado', () => {
  const clave = claveDeQuienes(cuerpo(), false);

  it('en un grupo, todos los que pueden recibirlo y ninguno de los que ya lo tienen', () => {
    expect(marcasTrasRevisar(LISTA, false, null, clave)).toEqual({ ids: [1, 3, 5], recordadas: false });
  });

  it('en «solo algunos», nadie', () => {
    expect(marcasTrasRevisar(LISTA, true, null, clave)).toEqual({ ids: [], recordadas: false });
  });

  it('con marcas de ESTA misma pregunta se conservan', () => {
    // Quitó a la alumna 1, volvió a corregir el monto y regresó.
    expect(marcasTrasRevisar(LISTA, false, { clave, ids: [3, 5] }, clave))
      .toEqual({ ids: [3, 5], recordadas: true });
    // También si las había quitado todas.
    expect(marcasTrasRevisar(LISTA, false, { clave, ids: [] }, clave))
      .toEqual({ ids: [], recordadas: true });
    // Y marcando a mano.
    expect(marcasTrasRevisar(LISTA, true, { clave, ids: [5] }, clave))
      .toEqual({ ids: [5], recordadas: true });
  });

  it('las marcas de otra pregunta se ignoran', () => {
    const deOtra = { clave: claveDeQuienes(cuerpo({ cursoIds: [1000] }), false), ids: [3] };
    expect(marcasTrasRevisar(LISTA, false, deOtra, clave)).toEqual({ ids: [1, 3, 5], recordadas: false });
    expect(marcasTrasRevisar(LISTA, true, deOtra, clave)).toEqual({ ids: [], recordadas: false });
  });

  it('quien ya lo tiene no queda marcado nunca, aunque estuviera en la memoria', () => {
    // Entre una revisión y otra se le creó el cargo desde otra pantalla.
    expect(marcasTrasRevisar(LISTA, false, { clave, ids: [1, 2, 3, 4] }, clave))
      .toEqual({ ids: [1, 3], recordadas: true });
  });

  it('quien ya no está en la lista tampoco', () => {
    expect(marcasTrasRevisar(LISTA, false, { clave, ids: [5, 99] }, clave))
      .toEqual({ ids: [5], recordadas: true });
  });
});

describe('la lista de alumnos', () => {
  it('primero los que se pueden marcar y al final los que ya lo tienen, sin desordenar los nombres', () => {
    expect(ordenarParaRevisar(LISTA).map((d) => d.estudianteId)).toEqual([1, 3, 5, 2, 4]);
    // No toca la lista que le pasan.
    expect(LISTA.map((d) => d.estudianteId)).toEqual([1, 2, 3, 4, 5]);
  });

  const cursos = new Map<number, string>([
    [1, 'Primero A · Primaria de Mentira · Matutina'],
    [3, 'Primero B · Primaria de Mentira · Matutina'],
    [5, 'Pequeños Única · Sala de tareas de Mentira'],
  ]);
  const ids = (q: string) => filtrarAlumnos(LISTA, cursos, q).map((d) => d.estudianteId);

  it('busca por nombre sin mirar tildes ni mayúsculas', () => {
    expect(ids('jose')).toEqual([3]);
    expect(ids('JOSÉ')).toEqual([3]);
    expect(ids('inventada')).toEqual([1, 4]);
  });

  it('busca por código', () => {
    expect(ids('est-0003')).toEqual([3]);
  });

  it('busca por curso: «primero a» se queda con esa sección, no con toda Primaria', () => {
    expect(ids('primero a')).toEqual([1]);
    expect(ids('primero')).toEqual([1, 3]);
    expect(ids('sala de tareas')).toEqual([5]);
  });

  it('sin nada escrito devuelve la lista entera, y sin curso conocido busca igual por nombre', () => {
    expect(ids('')).toEqual([1, 2, 3, 4, 5]);
    expect(ids('   ')).toEqual([1, 2, 3, 4, 5]);
    expect(filtrarAlumnos(LISTA, new Map(), 'cinco').map((d) => d.estudianteId)).toEqual([5]);
    expect(filtrarAlumnos(LISTA, new Map(), 'primero')).toEqual([]);
  });
});

describe('nombresMarcados: a quiénes se les va a cobrar', () => {
  it('los marcados, en el orden de la lista, y nunca quien ya lo tiene', () => {
    expect(nombresMarcados(LISTA, new Set([5, 1]))).toEqual(['Alumna Inventada Uno', 'Alumno Inventado Cinco']);
    // El 2 ya lo tiene: aunque estuviera en las marcas, no se le cobra.
    expect(nombresMarcados(LISTA, new Set([2, 3]))).toEqual(['José Inventado Tres']);
    expect(nombresMarcados(LISTA, new Set())).toEqual([]);
  });
});

describe('«ya lo tiene» también es quien tiene ese cobro guardado con mes', () => {
  // Lo que devuelve el servidor al revisar un cobro suelto (sin mes): solo ve
  // los cargos sin mes, así que al alumno 3 —que tiene la excursión guardada
  // con mes, de la pantalla anterior— lo da por «se le puede cobrar».
  const delServidor = { creados: 3, omitidos: 2, total: 5, detalles: LISTA, dryRun: true };

  it('quien tiene un cargo sin anular de ese cobro queda bloqueado, tenga mes o no', () => {
    const cruzada = marcarLosQueYaLoTienen(delServidor, new Set([3]));
    expect(cruzada.detalles.map((d) => [d.estudianteId, d.resultado])).toEqual([
      [1, 'crear'], [2, 'duplicado'], [3, 'duplicado'], [4, 'duplicado'], [5, 'crear'],
    ]);
    // Los números que salen en la frase se rehacen con él.
    expect(cruzada.creados).toBe(2);
    expect(cruzada.omitidos).toBe(3);
    expect(cruzada.total).toBe(5);
    // Y ya no viene marcado.
    expect(marcasTrasRevisar(cruzada.detalles, false, null, 'x').ids).toEqual([1, 5]);
  });

  it('solo añade bloqueos: a quien el servidor dio por duplicado no se le quita', () => {
    const cruzada = marcarLosQueYaLoTienen(delServidor, new Set<number>());
    expect(cruzada.detalles).toEqual(LISTA);
    expect(cruzada.creados).toBe(3);
    expect(cruzada.omitidos).toBe(2);
  });

  it('si todos lo tienen, no queda a quién cobrarle', () => {
    const cruzada = marcarLosQueYaLoTienen(delServidor, new Set([1, 3, 5, 99]));
    expect(cruzada.creados).toBe(0);
    expect(cruzada.omitidos).toBe(5);
  });

  it('no toca la revisión que le pasan y conserva lo demás', () => {
    const cruzada = marcarLosQueYaLoTienen(delServidor, new Set([3]));
    expect(delServidor.detalles[2].resultado).toBe('crear');
    expect(cruzada.dryRun).toBe(true);
  });

  it('un cargo anulado no cuenta: anular es decir «esto no se cobra»', () => {
    expect(alumnosConCargoVivo([
      { estudianteId: 1, estado: 'pendiente' },
      { estudianteId: 2, estado: 'anulado' },
      { estudianteId: 3, estado: 'pagado' },
      { estudianteId: 1, estado: 'pagado' },
      { estudianteId: 4, estado: 'anulado' },
      { estudianteId: 4, estado: 'pendiente' },
    ])).toEqual([1, 3, 4]);
    expect(alumnosConCargoVivo([])).toEqual([]);
  });

  it('si no se puede saber quién lo tiene, hay una frase que dice qué hacer', () => {
    expect(ERRORES_AL_COMPROBAR_EL_COBRO['sin-respuesta']).toContain('«Continuar»');
    expect(ERRORES_AL_COMPROBAR_EL_COBRO.demasiados).toContain('cobro nuevo');
  });
});

describe('comprobarIntento: ¿se crearon o no, cuando la respuesta no llegó?', () => {
  // Se mandó cobrar a 1, 3 y 5. La respuesta se perdió. Se vuelve a mirar.
  const tras = (resultados: Record<number, DetalleRevisado['resultado']>) => LISTA
    .filter((d) => d.estudianteId in resultados)
    .map((d) => ({ ...d, resultado: resultados[d.estudianteId] }));

  it('todos los que se mandaron lo tienen ahora: SÍ se crearon', () => {
    const c = comprobarIntento([1, 3, 5], tras({ 1: 'duplicado', 2: 'duplicado', 3: 'duplicado', 4: 'duplicado', 5: 'duplicado' }));
    expect(c.veredicto).toBe('se-crearon');
    expect(c.conCargo.map((d) => d.estudianteId)).toEqual([1, 3, 5]);
    expect(c.sinCargo).toEqual([]);
    // No hay nada que avisar encima de la lista: se enseña el «Listo».
    expect(avisoDeComprobacion(c)).toBeNull();
  });

  it('también si solo se había marcado a una parte: los que se quitaron no cuentan', () => {
    // Se mandó a 1 y 3; el 5 se había quitado a propósito y sigue sin el cargo.
    // Antes aquí salía «No hay ningún alumno marcado. Marca al menos uno», que
    // invitaba a marcar justo al 5.
    const c = comprobarIntento([1, 3], tras({ 1: 'duplicado', 2: 'duplicado', 3: 'duplicado', 4: 'duplicado', 5: 'crear' }));
    expect(c.veredicto).toBe('se-crearon');
    expect(c.conCargo.map((d) => d.estudianteId)).toEqual([1, 3]);
  });

  it('ninguno lo tiene: NO se creó nada, y se dice', () => {
    const c = comprobarIntento([1, 3, 5], tras({ 1: 'crear', 2: 'duplicado', 3: 'crear', 4: 'duplicado', 5: 'crear' }));
    expect(c.veredicto).toBe('no-se-crearon');
    expect(c.sinCargo.map((d) => d.estudianteId)).toEqual([1, 3, 5]);
    expect(avisoDeComprobacion(c))
      .toBe('Comprobado: no se había creado ningún cargo. Tus marcas siguen como las dejaste; ya puedes cobrar.');
  });

  it('unos sí y otros no: se dice cuántos, sin adivinar quién los puso', () => {
    const c = comprobarIntento([1, 3, 5], tras({ 1: 'duplicado', 3: 'crear', 5: 'crear' }));
    expect(c.veredicto).toBe('parte');
    expect(avisoDeComprobacion(c))
      .toBe('Comprobado: 1 ya tiene el cargo y a 2 todavía no se les creó. Siguen marcados: revisa la lista y cobra.');
    const alReves = comprobarIntento([1, 3, 5], tras({ 1: 'duplicado', 3: 'duplicado', 5: 'crear' }));
    expect(avisoDeComprobacion(alReves))
      .toBe('Comprobado: 2 ya tienen el cargo y a 1 todavía no se le creó. Sigue marcado: revisa la lista y cobra.');
  });

  it('quien ya no sale en la lista no decide nada, pero se apunta', () => {
    const c = comprobarIntento([1, 3, 99], tras({ 1: 'duplicado', 3: 'duplicado' }));
    expect(c.veredicto).toBe('se-crearon');
    expect(c.desaparecidos).toEqual([99]);
    expect(fraseDeSinComprobar(['Alumno Inventado Noventa']))
      .toBe('De Alumno Inventado Noventa no se pudo comprobar: ya no sale en ese grupo. Mira su cuenta en su ficha.');
    expect(fraseDeSinComprobar(['Alumno Inventado Noventa', 'Alumna Inventada Cien']))
      .toContain('ya no salen en ese grupo');
  });

  it('si no queda nadie de los que se mandaron, no afirma nada', () => {
    const c = comprobarIntento([98, 99], LISTA);
    expect(c.veredicto).toBe('sin-datos');
    expect(avisoDeComprobacion(c)).toBeNull();
    expect(comprobarIntento([], LISTA).veredicto).toBe('sin-datos');
  });

  it('las marcas que vuelven tras «no se creó» son las que se mandaron, sin los que ya lo tengan', () => {
    // Es lo que hace la pantalla: recuerda lo enviado con la clave de esa pregunta.
    const lista = tras({ 1: 'duplicado', 2: 'duplicado', 3: 'crear', 4: 'duplicado', 5: 'crear' });
    expect(marcasTrasRevisar(lista, false, { clave: 'k', ids: [1, 3] }, 'k')).toEqual({ ids: [3], recordadas: true });
  });
});

describe('cobrosALaVista: qué cobros se enseñan en «¿Qué vas a cobrar?»', () => {
  const COBROS = Array.from({ length: 10 }, (_, i) => ({ id: 100 - i, nombre: `Cobro de Mentira ${i + 1}` }));
  const cine = { id: 50, nombre: 'Día de cine de Mentira' };
  const excursion = { id: 40, nombre: 'Excursión de Mentira' };
  const todos = [...COBROS, cine, excursion];
  const ver = (d: Partial<Parameters<typeof cobrosALaVista>[1]>) => cobrosALaVista(todos, {
    buscado: '', verTodos: false, cobroId: '', tope: 6, ...d,
  });

  it('de entrada, los primeros seis', () => {
    expect(ver({}).visibles.map((c) => c.id)).toEqual([100, 99, 98, 97, 96, 95]);
    expect(ver({ verTodos: true }).visibles).toHaveLength(12);
  });

  it('el elegido se enseña aunque caiga fuera de los seis', () => {
    expect(ver({ cobroId: '40' }).visibles.map((c) => c.id)).toEqual([100, 99, 98, 97, 96, 95, 40]);
    // Y no se repite si ya estaba.
    expect(ver({ cobroId: '99' }).visibles).toHaveLength(6);
  });

  it('buscando, salen los que casan sin tildes ni mayúsculas', () => {
    expect(ver({ buscado: 'DIA de cine' }).visibles).toEqual([cine]);
  });

  it('buscando, el elegido NO desaparece aunque no case', () => {
    // El fallo: con «Excursión» elegida se buscaba «cine», quedaba a la vista
    // solo «Día de cine» sin marcar, y «Continuar» seguía con la excursión.
    const r = ver({ buscado: 'cine', cobroId: '40' });
    expect(r.visibles).toEqual([cine, excursion]);
    expect(r.sinCoincidencias).toBe(false);
  });

  it('si lo buscado no da nada se dice, y el elegido sigue a la vista', () => {
    const r = ver({ buscado: 'no existe', cobroId: '40' });
    expect(r.sinCoincidencias).toBe(true);
    expect(r.visibles).toEqual([excursion]);
    expect(ver({ buscado: 'no existe' })).toEqual({ visibles: [], sinCoincidencias: true });
  });
});

describe('texto', () => {
  it('normalizar quita tildes y mayúsculas', () => {
    expect(normalizar('Día de Cine')).toBe('dia de cine');
    expect(normalizar('JOSÉ ÑOÑO')).toBe('jose nono');
  });

  it('listarNombres: uno, dos, tres y más de tres', () => {
    expect(listarNombres([])).toBe('');
    expect(listarNombres(['Alumna Inventada Uno'])).toBe('Alumna Inventada Uno');
    expect(listarNombres(['Alumna Inventada Uno', 'Alumno Inventado Dos']))
      .toBe('Alumna Inventada Uno y Alumno Inventado Dos');
    expect(listarNombres(['Alumna Inventada Uno', 'Alumno Inventado Dos', 'Alumna Inventada Tres']))
      .toBe('Alumna Inventada Uno, Alumno Inventado Dos y Alumna Inventada Tres');
    expect(listarNombres(['Uno Inventado', 'Dos Inventado', 'Tres Inventado', 'Cuatro Inventado']))
      .toBe('Uno Inventado, Dos Inventado, Tres Inventado y 1 más');
    expect(listarNombres(['Uno Inventado', 'Dos Inventado', 'Tres Inventado', 'Cuatro Inventado'], 2))
      .toBe('Uno Inventado, Dos Inventado y 2 más');
  });

  it('listarNombres: «e» delante de un nombre que empieza por i', () => {
    expect(listarNombres(['Alumna Inventada Uno', 'Inés Inventada'])).toBe('Alumna Inventada Uno e Inés Inventada');
    expect(listarNombres(['Alumna Inventada Uno', 'Hilda Inventada'])).toBe('Alumna Inventada Uno e Hilda Inventada');
  });

  it('alumnosEnLetras', () => {
    expect(alumnosEnLetras(1)).toBe('1 alumno');
    expect(alumnosEnLetras(5)).toBe('5 alumnos');
    expect(alumnosEnLetras(0)).toBe('0 alumnos');
  });
});

describe('cobros', () => {
  const COBROS = [
    { id: 70, nombre: 'Día de Cine de Mentira', tipo: 'otro', activo: true },
    { id: 71, nombre: 'Excursión de Mentira', tipo: 'actividad', activo: false },
    { id: 72, nombre: 'Mensualidad de Mentira', tipo: 'mensualidad' },
  ];

  it('un nombre que ya existe se reconoce sin tildes ni mayúsculas, para no crear un gemelo', () => {
    expect(cobroConEseNombre(COBROS, 'dia de cine de mentira')?.id).toBe(70);
    expect(cobroConEseNombre(COBROS, '  DÍA DE CINE DE MENTIRA ')?.id).toBe(70);
    // Sin `activo` cuenta como activo, igual que en el resto del módulo.
    expect(cobroConEseNombre(COBROS, 'mensualidad de mentira')?.id).toBe(72);
  });

  it('un cobro inactivo no cuenta: el colegio lo retiró y no se puede elegir', () => {
    expect(cobroConEseNombre(COBROS, 'Excursión de Mentira')).toBeNull();
  });

  it('un nombre distinto o vacío no coincide con nada', () => {
    expect(cobroConEseNombre(COBROS, 'Día de cine de octubre')).toBeNull();
    expect(cobroConEseNombre(COBROS, 'Día de cine')).toBeNull();
    expect(cobroConEseNombre(COBROS, '   ')).toBeNull();
  });

  it('mensualidad e inscripción son los cobros con precio por curso; lo demás es suelto', () => {
    expect(esCobroFijo('mensualidad')).toBe(true);
    expect(esCobroFijo('inscripcion')).toBe(true);
    expect(esCobroFijo('otro')).toBe(false);
    expect(esCobroFijo('actividad')).toBe(false);
    expect(esCobroFijo('uniforme')).toBe(false);
  });
});

describe('avisosDeConfirmar: lo que se repite en ámbar antes del «sí»', () => {
  const pedido = (d: Partial<PedidoRevisado> = {}, c: Partial<CuerpoGenerar> = {}): PedidoRevisado => ({
    cuerpo: cuerpo(c), cobro: 'Día de cine de mentira', mesTexto: null, aMano: false,
    clave: 'x', anioEscolar: '2026-2027 de Mentira', anioEnCurso: true, ...d,
  });

  it('un grupo normal no avisa de nada', () => {
    expect(avisosDeConfirmar({
      pedido: pedido(), grupo: 'Sala de tareas de Mentira', marcados: 5, enLaLista: 5,
    })).toEqual([]);
  });

  it('todo el colegio sin quitar a nadie', () => {
    expect(avisosDeConfirmar({ pedido: pedido(), grupo: null, marcados: 148, enLaLista: 148 }))
      .toEqual(['Son todos los alumnos del colegio.']);
    // Si se quitó a alguien, o se marcaron a mano, ya no son «todos».
    expect(avisosDeConfirmar({ pedido: pedido(), grupo: null, marcados: 140, enLaLista: 148 })).toEqual([]);
    expect(avisosDeConfirmar({
      pedido: pedido({ aMano: true }), grupo: null, marcados: 148, enLaLista: 148,
    })).toEqual([]);
  });

  it('un año escolar que no es el que está en curso', () => {
    expect(avisosDeConfirmar({
      pedido: pedido({ anioEscolar: '2025-2026 de Mentira', anioEnCurso: false }),
      grupo: 'Sala de tareas de Mentira', marcados: 5, enLaLista: 5,
    })).toEqual(['Es del año escolar «2025-2026 de Mentira», que no es el que está en curso.']);
  });

  it('un monto de RD$10,000 o más', () => {
    expect(avisosDeConfirmar({
      pedido: pedido({}, { montoCentavos: 1_500_000 }),
      grupo: 'Sala de tareas de Mentira', marcados: 5, enLaLista: 5,
    })).toEqual(['Son RD$15,000.00 por alumno.']);
  });
});

describe('mensajeDeError: lo que se dice cuando el servidor dice que no', () => {
  it('el plan en solo lectura conserva el mensaje del servidor, detrás de «No se creó nada»', () => {
    expect(mensajeDeError('crear', 402, 'Tu plan de mentira está en solo lectura.')).toEqual({
      texto: 'No se creó nada. Tu plan de mentira está en solo lectura.', seSabeQueNoSeCreo: true,
    });
    // Sin mensaje no deja la frase a medias.
    expect(mensajeDeError('crear', 402, undefined).texto).toMatch(/^No se creó nada\. .+\.$/);
  });

  it('al crear: sesión, permiso, cobro y mes tienen su frase', () => {
    expect(mensajeDeError('crear', 401, 'No autorizado').texto)
      .toBe('No se creó nada: tu sesión se cerró. Entra otra vez y repite el cobro.');
    expect(mensajeDeError('crear', 403, 'Sin permiso').texto)
      .toBe('No se creó nada: no tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.');
    expect(mensajeDeError('crear', 404, 'Concepto no encontrado').texto)
      .toBe('No se creó nada: ese cobro ya no existe en tu colegio. Vuelve al paso 1 y elige otro.');
    expect(mensajeDeError('crear', 400, 'El mes seleccionado no pertenece al calendario de este período').texto)
      .toBe('No se creó nada: ese mes no es de este año escolar. Vuelve al paso 1 y elige otro mes.');
    expect(mensajeDeError('crear', 422, 'lo que sea').texto)
      .toBe('No se creó nada. Recarga la página y vuelve a intentarlo.');
  });

  it('al buscar a los alumnos: cada motivo con lo que hay que hacer', () => {
    expect(mensajeDeError('revisar', 0, null).texto)
      .toBe('No se pudo buscar a los alumnos. Revisa tu conexión y pulsa «Continuar» otra vez.');
    expect(mensajeDeError('revisar', 401, 'No autorizado').texto)
      .toBe('Tu sesión se cerró. Entra otra vez y repite el cobro.');
    expect(mensajeDeError('revisar', 403, 'Sin permiso').texto)
      .toBe('No tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.');
    expect(mensajeDeError('revisar', 404, 'Concepto no encontrado').texto)
      .toBe('Ese cobro ya no existe en tu colegio. Vuelve al paso 1 y elige otro.');
    expect(mensajeDeError('revisar', 404, 'Período no encontrado').texto)
      .toBe('Ese año escolar ya no existe. Recarga la página.');
    expect(mensajeDeError('revisar', 400, 'El mes seleccionado no pertenece al calendario de este período').texto)
      .toBe('Ese mes no es de este año escolar. Vuelve al paso 1 y elige otro mes.');
    expect(mensajeDeError('revisar', 500, 'boom').texto)
      .toBe('No se pudo buscar a los alumnos. Inténtalo otra vez.');
  });

  it('el texto crudo del servidor NUNCA sale tal cual', () => {
    const crudos = [
      'montoCentavos debe ser un entero positivo',
      'periodoId, conceptoId y anio son requeridos',
      'Período no encontrado',
      'Concepto no encontrado',
      'mes debe estar entre 1 y 12',
    ];
    for (const crudo of crudos) {
      for (const status of [400, 404, 500]) {
        expect(mensajeDeError('revisar', status, crudo).texto).not.toContain(crudo);
        expect(mensajeDeError('crear', status, crudo).texto).not.toContain(crudo);
      }
    }
    // Ni cuando lo que llega no es un texto.
    expect(mensajeDeError('crear', 400, { detalle: 'x' }).texto)
      .toBe('No se creó nada. Recarga la página y vuelve a intentarlo.');
  });

  it('sin respuesta o con un 5xx al crear NO se sabe si se creó: hay que volver a comprobar', () => {
    for (const status of [0, 200, 500, 502, 504]) {
      const fallo = mensajeDeError('crear', status, null);
      expect(fallo.seSabeQueNoSeCreo).toBe(false);
      expect(fallo.texto).toContain('no sabemos si los cargos se llegaron a crear');
      expect(fallo.texto).toContain('«Continuar»');
    }
  });

  it('un 4xx al crear garantiza que no se creó nada', () => {
    for (const status of [400, 401, 402, 403, 404, 409, 422]) {
      expect(mensajeDeError('crear', status, 'x').seSabeQueNoSeCreo).toBe(true);
    }
  });

  it('revisar solo lee: pase lo que pase, no se creó nada', () => {
    for (const status of [0, 400, 401, 403, 404, 500]) {
      expect(mensajeDeError('revisar', status, 'x').seSabeQueNoSeCreo).toBe(true);
    }
  });
});

/**
 * Lo que no se puede ejecutar sin navegador se comprueba leyendo el código,
 * como en `filtro-curso.test.ts`. Cada una de estas pruebas nombra el fallo que
 * cierra: si alguien cambia la línea, tiene que leer por qué estaba así.
 */
const raiz = join(__dirname, '..', '..');
const lee = (p: string) => readFileSync(join(raiz, p), 'utf8');

const pantalla = lee('app/escolar/cargos/lote/_page-client.tsx');
const DIR = 'components/administracion-escolar/cargo-lote';
const queSeCobra = lee(`${DIR}/QueSeCobra.tsx`);
const lista = lee(`${DIR}/ListaAlumnosLote.tsx`);
const dialogo = lee(`${DIR}/ConfirmarCobroDialog.tsx`);
const resultado = lee(`${DIR}/ResultadoLote.tsx`);
const paso = lee(`${DIR}/PasoLote.tsx`);
const filtroCurso = lee('components/administracion-escolar/FiltroCurso.tsx');

/** El texto de una función de la pantalla: desde su cabecera hasta la siguiente. */
function funcion(cabecera: string): string {
  const desde = pantalla.indexOf(cabecera);
  expect(desde, `no está «${cabecera}»`).toBeGreaterThan(-1);
  const resto = pantalla.slice(desde + cabecera.length);
  const siguiente = resto.search(/\n {2}(?:async )?function /);
  return siguiente === -1 ? pantalla.slice(desde) : pantalla.slice(desde, desde + cabecera.length + siguiente);
}

describe('lo que viaja al servidor', () => {
  it('el mes solo viaja con una mensualidad', () => {
    // El fallo del mes escondido: se elegía una mensualidad, luego «Excursión»,
    // y la excursión salía con el mes que se quedó guardado. Con mes, «ya lo
    // tiene» se decide distinto.
    expect(pantalla).toContain('mes: esMensualidad && form.mes ? Number.parseInt(form.mes) : null,');
    expect(pantalla).not.toContain('mes: form.mes ? Number.parseInt(form.mes) : null');
    // Y al cambiar de año escolar el mes solo se recoloca si se cobra una mensualidad.
    expect(pantalla).toContain('esMensualidad && !perteneceMes(');
  });

  it('el año ya no se teclea, y «hoy» es el de República Dominicana', () => {
    expect(pantalla).not.toContain('Año *');
    expect(pantalla).not.toContain('type="number"');
    // La fecha en UTC: a las ocho de la noche ya era mañana.
    expect(pantalla).not.toContain('toISOString()');
    expect(pantalla).toContain('fechaVencimiento: sumarDias(hoyRD(), 7)');
    expect(pantalla).toContain('hoyRD().slice(0, 4)');
  });

  it('se crea lo REVISADO y nunca con la lista vacía', () => {
    const crear = funcion('async function crear()');
    // Sin lista de marcados el servidor le cobra a todo el grupo.
    expect(crear).toContain('if (!revision || seleccion.size === 0) return;');
    expect(crear.indexOf('if (!revision || seleccion.size === 0) return;')).toBeLessThan(crear.indexOf('fetch('));
    expect(crear).toContain('...revision.pedido.cuerpo');
    expect(crear).toContain('dryRun: false');
    expect(crear).toContain('estudianteIds: [...seleccion]');
    // No vuelve a leer los campos: lo que se manda es lo que se preguntó.
    expect(crear).not.toContain('form.');
  });

  it('la revisión pregunta con el mismo pedido que guarda', () => {
    const revisar = funcion('async function revisar()');
    expect(revisar).toContain('const pedido = armarPedido();');
    expect(revisar).toContain('JSON.stringify({ ...pedido.cuerpo, dryRun: true })');
    expect(revisar).toContain('setRevision({ ...(data as Generacion), grupo: grupoNombre, pedido })');
  });

  it('un fallo sin respuesta al crear obliga a comprobar otra vez, no deja pulsar de nuevo', () => {
    const crear = funcion('async function crear()');
    const sabe = crear.indexOf('if (fallo.seSabeQueNoSeCreo)');
    const tira = crear.indexOf('limpiarRevision();', sabe);
    expect(sabe).toBeGreaterThan(-1);
    expect(tira).toBeGreaterThan(sabe);
    expect(crear.slice(sabe, tira + 80)).toContain('setPaso(2);');
  });

  it('…y apunta lo que se intentó, para poder contestar después si se creó', () => {
    const crear = funcion('async function crear()');
    const sabe = crear.indexOf('if (fallo.seSabeQueNoSeCreo)');
    const apunta = crear.indexOf('intentoSinRespuesta.current = {', sabe);
    const tira = crear.indexOf('limpiarRevision();', sabe);
    // Antes de tirar lo revisado: después ya no se sabría a quiénes se mandó.
    expect(apunta).toBeGreaterThan(sabe);
    expect(apunta).toBeLessThan(tira);
    expect(crear.slice(apunta, tira)).toContain('marcados.has(d.estudianteId)');
  });

  it('la revisión siguiente da el veredicto ANTES de pintar la lista', () => {
    // El fallo: tras un corte, si los cargos sí se habían creado salía el aviso
    // de «todos ya lo tienen» con un botón de «Crear un cobro nuevo». Con prisa
    // se creaba «Día de cine 2» y se les cobraba otra vez a los mismos.
    const revisar = funcion('async function revisar()');
    const comprueba = revisar.indexOf('comprobarIntento(');
    const listo = revisar.indexOf("if (comprobacion.veredicto === 'se-crearon') { darPorCreado(intento, comprobacion); return; }");
    const pinta = revisar.indexOf('setRevision({ ...(data as Generacion)');
    expect(comprueba).toBeGreaterThan(-1);
    expect(listo).toBeGreaterThan(comprueba);
    expect(pinta).toBeGreaterThan(listo);
    // Solo vale para la misma pregunta: otro grupo u otro cobro no contestan nada.
    expect(revisar).toContain('intento.pedido.clave === pedido.clave');
    // Si no estaba todo creado, la lista vuelve con lo que se mandó.
    expect(revisar).toContain('memoriaMarcas.current = { clave: pedido.clave, ids: enviados }');
    // Y el resultado comprobado es el «Listo» de siempre, dicho como comprobado.
    const dar = funcion('function darPorCreado(');
    expect(dar).toContain('comprobado: true,');
    expect(dar).toContain('setResultado({');
    expect(resultado).toContain('los cargos sí se crearon');
  });

  it('un cobro suelto se cruza con quien ya lo tiene guardado con mes, y sin ese cruce no hay lista', () => {
    const revisar = funcion('async function revisar()');
    // Solo los cobros que viajan sin mes: una mensualidad se decide por mes.
    expect(revisar).toMatch(/pedido\.cuerpo\.mes === null\s*\? alumnosConEseCobro\(pedido\.cuerpo\.conceptoId, pedido\.cuerpo\.periodoId\)/);
    const falla = revisar.indexOf('if (!Array.isArray(conEseCobro))');
    const cruza = revisar.indexOf('data = marcarLosQueYaLoTienen(data as Generacion, new Set(conEseCobro));');
    const pinta = revisar.indexOf('setRevision({ ...(data as Generacion)');
    expect(falla).toBeGreaterThan(-1);
    expect(cruza).toBeGreaterThan(falla);
    expect(pinta).toBeGreaterThan(cruza);
    // Si no se pudo saber, se dice y se sale: no se pinta una lista a medias.
    expect(revisar.slice(falla, cruza)).toContain('return;');
    // También esta espera puede quedarse vieja.
    expect(revisar.match(/if \(estaVez !== revisionPedida\.current\) return;/g)).toHaveLength(2);
    // Va por la ruta que ya lista los cargos de un cobro: no hay ruta nueva.
    expect(pantalla).toContain('/api/administracion-escolar/cargos?conceptoId=${conceptoId}&periodoId=${periodoId}&porPagina=200');
    expect(pantalla).toContain('alumnosConCargoVivo(');
  });
});

describe('nadie viene elegido y nada se cobra sin enterarse', () => {
  it('la pantalla se abre sin grupo elegido', () => {
    const vacio = pantalla.slice(pantalla.indexOf('function formVacio()'), pantalla.indexOf('function mesInicial('));
    expect(vacio).toContain('quien: null,');
  });

  it('«Continuar» sin haber dicho a quién no le pregunta al servidor', () => {
    const continuar = funcion('function continuarPaso2()');
    const sinElegir = continuar.indexOf('if (form.quien === null)');
    const pregunta = continuar.indexOf('revisar()');
    expect(sinElegir).toBeGreaterThan(-1);
    expect(pregunta).toBeGreaterThan(sinElegir);
  });

  it('«Solo algunos alumnos» también invalida la revisión y deja dicho que se marca a mano', () => {
    expect(pantalla).toMatch(/limpiarRevision\(\);\s*setForm\(\(f\) => \(\{ \.\.\.f, grupo: TODOS_LOS_CURSOS, quien: 'a-mano' \}\)\);/);
  });

  it('cambiar cualquier dato del paso 1 invalida lo revisado', () => {
    for (const cabecera of [
      'function elegirCobro(', 'function elegirCobroNuevo(', 'function cambiarMes(',
      'function cambiarMonto(', 'function cambiarFecha(', 'function usarMontoDeLaUltimaVez(',
      // Corregir el nombre del cobro también: el nombre va en la frase.
      'async function renombrarCobro(',
    ]) {
      expect(funcion(cabecera), cabecera).toContain('limpiarRevision();');
    }
  });

  it('una respuesta tardía no salta de paso por su cuenta', () => {
    // Si mientras viajaba la revisión se abrió el paso 1, no se saca de ahí.
    expect(funcion('async function revisar()')).toContain('setPaso((p) => (p === 2 ? 3 : p))');
  });

  it('volver del paso 3 sin cambiar nada no le pregunta otra vez al servidor', () => {
    const continuar = funcion('function continuarPaso2()');
    const reusa = continuar.indexOf('if (revision && revision.creados > 0) { setPaso(3); return; }');
    expect(reusa).toBeGreaterThan(-1);
    expect(continuar.indexOf('revisar()')).toBeGreaterThan(reusa);
  });

  it('las marcas se guardan con la pregunta a la que pertenecen', () => {
    expect(funcion('function guardarMarcas(')).toContain('clave: revision.pedido.clave');
    expect(funcion('async function revisar()'))
      .toContain('marcasTrasRevisar(');
    // Y al crear se olvidan: lo siguiente es otra pregunta.
    expect(funcion('async function crear()')).toContain('memoriaMarcas.current = null;');
  });

  it('sin nadie marcado no hay botón de cobrar apagado: hay una frase que dice qué falta', () => {
    expect(pantalla).toContain('No hay ningún alumno marcado. Marca al menos uno para poder cobrar.');
    expect(pantalla).toMatch(/\{frase\.principal && \(\s*<div className="mt-3 sm:mt-0 sm:shrink-0">/);
  });

  it('el botón de la barra abre la confirmación, no cobra', () => {
    expect(pantalla).toContain('onClick={() => { setErrorCrear(null); setConfirmando(true); }}');
    // Quien cobra es el «Sí» del diálogo.
    expect(pantalla).toContain('onConfirmar={() => void crear()}');
    expect(pantalla.match(/void crear\(\)/g)).toHaveLength(1);
  });
});

describe('nada aparece ni se guarda sin que la persona lo haya puesto', () => {
  it('el monto de la última vez no se escribe con el cursor dentro del campo', () => {
    // La consulta tarda lo que se tarda en ir del cobro al campo: si llegaba
    // entre el clic y la primera tecla, «75» quedaba como «5075».
    const guarda = pantalla.indexOf("if (document.activeElement?.id === 'lote-monto') return;");
    const escribe = pantalla.indexOf("? { ...f, monto: String(ultimo.montoCentavos / 100), origenMonto: 'ultima-vez' }");
    expect(guarda).toBeGreaterThan(-1);
    expect(escribe).toBeGreaterThan(guarda);
    // En ese caso se ofrece, con un botón.
    expect(queSeCobra).toContain('onClick={onUsarUltimaVez}>Usar ese monto</button>');
    expect(pantalla).toContain('onUsarUltimaVez={usarMontoDeLaUltimaVez}');
  });

  it('el cobro nuevo no se guarda dos veces si la primera vez no llegó respuesta', () => {
    const crear = funcion('async function crearConcepto()');
    // Tras un fallo que no es un «no» claro, se mira si se guardó…
    const noClaro = crear.indexOf('res.status >= 400 && res.status < 500');
    const mira = crear.indexOf('await buscarCobroGuardado(nombre)', noClaro);
    expect(noClaro).toBeGreaterThan(-1);
    expect(mira).toBeGreaterThan(noClaro);
    // …y si ni eso se pudo, se mira antes del intento siguiente, antes de guardar.
    expect(crear).toContain("if (guardado === 'no-se-pudo') dudaAlCrearCobro.current = true;");
    const antes = crear.indexOf('if (dudaAlCrearCobro.current)');
    expect(antes).toBeGreaterThan(-1);
    expect(antes).toBeLessThan(crear.indexOf("method: 'POST'"));
    // Solo se releen los cobros: recargar los catálogos movía el año escolar.
    expect(funcion('async function buscarCobroGuardado(')).not.toContain('cargarCatalogos');
  });

  it('el nombre del cobro recién creado se puede corregir, y la cabecera no promete de más', () => {
    // El cobro se guarda en el catálogo al pulsar «Continuar» del paso 1.
    expect(pantalla).not.toContain('no se crea nada hasta que confirmes');
    expect(pantalla).toContain('no se le cobra a nadie hasta que confirmes al final');
    const renombrar = funcion('async function renombrarCobro(');
    expect(renombrar).toContain("method: 'PATCH'");
    expect(renombrar).toContain('`/api/administracion-escolar/conceptos/${id}`');
    // Solo el de esta visita, y solo mientras no se haya cobrado con él.
    expect(funcion('async function continuarPaso1()')).toContain('conceptoSeleccionado.id === cobroDeEstaVisita');
    const crear = funcion('async function crear()');
    expect(crear).toContain('setCobroDeEstaVisita((id) => (id === pedido.cuerpo.conceptoId ? null : id));');
    expect(crear).toContain('setCobroDeEstaVisita(null);');
    expect(queSeCobra).toContain('c.id === cobroCorregibleId');
  });

  it('con un cobro elegido que no casa con lo buscado, la lista lo sigue enseñando', () => {
    expect(queSeCobra).toContain('cobrosALaVista(sueltos, { buscado: filtro, verTodos, cobroId, tope: COBROS_A_LA_VISTA })');
  });
});

describe('la pantalla dice lo que pasa', () => {
  it('los catálogos que fallan se dicen, y los permisos no parpadean', () => {
    // Un 500 se leía como «el colegio no tiene años escolares».
    expect(pantalla).toContain('if (!r.ok) throw');
    // Mientras llegan los permisos no se enseña «No tienes permiso».
    expect(pantalla).toContain('isLoading');
    expect(pantalla.indexOf('if (cargandoPermisos)')).toBeLessThan(pantalla.indexOf('if (!puedeGestionar)'));
    // El reintento no añade otra llamada: sube una cuenta de la que depende el efecto.
    expect(pantalla.match(/cargarCatalogos\(\)/g)).toHaveLength(1);
    expect(pantalla).toContain('[cargarCatalogos, intentoCarga]');
  });

  it('son tres pasos y solo uno abierto', () => {
    expect(pantalla.match(/<PasoLote numero=\{/g)).toHaveLength(3);
    expect(pantalla).toContain('titulo="Qué se cobra"');
    expect(pantalla).toContain('titulo="A quién se le cobra"');
    expect(pantalla).toContain('titulo="Revisa y confirma"');
    // Cada paso se anuncia al lector de pantalla y su título puede recibir el foco.
    expect(paso).toContain('Paso {numero} de 3: ');
    expect(paso).toContain('tabIndex={-1}');
    // El paso contestado es un botón de verdad; el pendiente no es un control.
    expect(paso).toContain('<button type="button" onClick={onCambiar}');
  });

  it('no queda jerga del sistema a la vista', () => {
    // Lo que se lee en pantalla, sin los comentarios: el texto entre etiquetas,
    // las frases entre comillas (las que tienen espacios: una ruta o un id no
    // los tienen) y los textos que van en atributos.
    const codigo = [pantalla, queSeCobra, lista, dialogo, resultado, paso, filtroCurso]
      .map((c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
      .join('\n');
    const textos = [
      // Entre etiquetas. Un trozo con `=` o `;` es código, no texto.
      ...[...codigo.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).filter((t) => !/[;=|&]/.test(t)),
      ...[...codigo.matchAll(/'([^'\n]* [^'\n]*)'/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/`([^`\n]* [^`\n]*)`/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/(?:placeholder|aria-label|titulo|detalle)="([^"]*)"/g)].map((m) => m[1]),
    ].join('\n');
    // La prueba tiene que estar mirando algo: estas frases SÍ están a la vista.
    expect(textos).toContain('¿Qué vas a cobrar?');
    expect(textos).toContain('Elige un grupo.');
    expect(textos).toContain('Buscar por nombre o curso…');
    for (const palabra of ['Período', 'Servicio', 'Grado', 'Concepto', 'Monto', 'Vencimiento', 'filtro', 'Filtro']) {
      expect(textos, palabra).not.toMatch(new RegExp(`(?<![\\p{L}\\p{N}_-])${palabra}(?![\\p{L}\\p{N}_-])`, 'u'));
    }
  });

  it('«todos ya lo tienen» sale del texto probado y, con una mensualidad, lleva a elegir otro mes', () => {
    expect(pantalla).toContain('revision.total, revision.grupo, revision.pedido.cobro, revision.pedido.mesTexto,');
    expect(pantalla).toContain('consejoTodosLoTienen({ mesTexto: revision.pedido.mesTexto, puedeCrear: puedeConfigurar })');
    expect(pantalla).toMatch(/consejoSinNadie\.accion === 'otro-mes'[\s\S]{0,260}focoPendiente\.current = 'lote-mes';/);
    // El botón de crear un cobro nuevo solo sale cuando el consejo lo dice.
    expect(pantalla).toMatch(/consejoSinNadie\.accion === 'cobro-nuevo' && \(/);
  });

  it('una mensualidad en un año escolar sin fechas no deja «Continuar» mudo', () => {
    // No hay selector de mes donde poner el cursor: va al párrafo que lo explica.
    expect(queSeCobra).toContain('id="lote-mes-sin-fechas" tabIndex={-1}');
    expect(pantalla).toContain("faltan.mes && mesesForm.length === 0 ? '#lote-mes-sin-fechas'");
  });

  it('marcando uno por uno se ven los nombres en la barra y en el diálogo, y se pueden ver solo los marcados', () => {
    expect(pantalla).toContain('fraseDeMarcados(nombresMarcados(revision.detalles, seleccion), topeMarcados)');
    expect(pantalla).toContain('notas={notasDeLaFrase(12)}');
    expect(dialogo).toContain('{notas.map((nota) => (');
    expect(lista).toContain('Ver solo los marcados (');
    expect(lista).toContain('aria-pressed={soloEstos !== null}');
  });

  it('el resultado manda a la ficha del alumno, que es donde se anula un cargo', () => {
    expect(resultado).toContain('href={`/escolar/estudiantes/${d.estudianteId}`}');
    expect(resultado).toContain('en su ficha puedes anular el cargo');
    expect(resultado).toContain('id="lote-resultado"');
  });
});

describe('reglas de construcción: lo que no se puede ver pintado', () => {
  it('el monto es un campo de texto con teclado numérico, no un campo numérico', () => {
    // El campo numérico cambia el monto con la rueda del ratón y no deja
    // escribir «1,100».
    expect(queSeCobra).toContain('inputMode="decimal"');
    expect(queSeCobra).not.toContain('type="number"');
    // El «RD$» va fuera del campo, no montado encima.
    expect(queSeCobra).toMatch(/<span aria-hidden className="[^"]*">RD\$<\/span>\s*<div className="w-40">/);
  });

  it('radios y casillas son nativos y llevan el color de la app', () => {
    expect(lista).toContain('type="checkbox"');
    expect(lista).toContain('accent-zero-600');
    expect(filtroCurso).toContain('accent-zero-600');
    expect(queSeCobra).toContain('type="radio"');
    expect(queSeCobra).toContain('accent-zero-600');
  });

  it('el diálogo se arma con las piezas que el contenedor reconoce', () => {
    expect(dialogo).toContain('<DialogHeader>');
    // El pie lleva ahora una clase (apila los botones en el teléfono), pero
    // sigue siendo la pieza que el contenedor reconoce y deja fija abajo.
    expect(dialogo).toMatch(/<DialogFooter[ >]/);
    expect(dialogo).not.toContain('ModalHeader');
    // Ningún botón recibe el foco al abrirse: un Enter de más no cobra.
    expect(dialogo).not.toContain('autoFocus');
    // Mientras se crea no se cierra.
    expect(dialogo).toContain('if (!o && !creando) onCerrar();');
  });

  it('en el teléfono los botones del diálogo van apilados y la barra no lleva todo pegado', () => {
    // En fila, «Sí, cobrar a 12 alumnos» no cabía junto a «No, volver».
    expect(dialogo).toContain('<DialogFooter className="flex-col-reverse sm:flex-row">');
    expect(dialogo.match(/w-full sm:w-auto/g)).toHaveLength(2);
    // El plazo y las notas van fuera de la zona pegada por debajo de `sm`…
    expect(pantalla).toContain('<div className="space-y-1 px-4 pt-3 text-sm text-gray-600 sm:hidden">');
    // …y dentro de la barra desde `sm`.
    expect(pantalla).toContain('<span className="hidden sm:inline">');
    expect(pantalla).toContain('<p className="mt-0.5 hidden break-words text-sm text-gray-600 sm:block">');
  });

  it('con teclado, la casilla enfocada no queda debajo de las barras pegadas', () => {
    expect(lista).toMatch(/const CASILLA = '[^']*scroll-mb-\d+ sm:scroll-mb-\d+ sm:scroll-mt-\d+'/);
  });

  it('el cursor pasa al nombre del cobro nuevo al tocar la FILA, no solo el circulito', () => {
    // El clic que el navegador reenvía de la etiqueta al radio llega con
    // detail 0, igual que el de las flechas: se escucha en la etiqueta.
    expect(queSeCobra).toMatch(/<label className=\{`\$\{FILA\} \$\{fondo\(nombreNuevo !== null\)\}`\}\s*onClick=\{\(e\) => \{\s*if \(e\.detail > 0\)/);
    expect(queSeCobra).not.toMatch(/checked=\{nombreNuevo !== null\} onChange=\{onElegirNuevo\}\s*(\/\/[^\n]*\s*)*onClick=/);
  });

  it('ningún componente nuevo usa la píldora de la app, que no respeta el color por clase', () => {
    for (const codigo of [queSeCobra, lista, dialogo, resultado, paso, pantalla]) {
      expect(codigo).not.toMatch(/import[^;]*\bBadge\b/);
      expect(codigo).not.toContain('@/components/ui/badge');
    }
  });

  it('los botones de marcar actúan solo sobre lo que se ve', () => {
    expect(lista).toContain('onMarcarVarios(idsALaVista, true)');
    expect(lista).toContain('onMarcarVarios(idsALaVista, false)');
    // Marcando a mano y sin buscar, «Marcar a todos» no existe.
    expect(lista).toContain('(hayBusqueda || !aMano)');
  });

  it('la pantalla no nombra la sección por su id: el cruce con matrículas vive en lib', () => {
    expect(pantalla).not.toMatch(/\bcursoId:/);
    expect(pantalla).toContain('contarAlumnos(');
    expect(pantalla).toContain('cursoDeCadaAlumno(');
  });
});
