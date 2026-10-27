/**
 * «Editar matrícula»: lo que se le cobra, un renglón por concepto.
 *
 * La pantalla enseñaba dos listas —arriba los conceptos que el sistema le carga
 * por su cuenta, abajo los trece cargos del año, mes por mes— y el dueño del
 * producto las leyó como la misma cosa contada dos veces. Pidió dejar solo los
 * conceptos, y poder desde ahí cambiar el precio, quitar o agregar.
 *
 * Lo que se fija aquí:
 *   1. Las reglas de esa lista: qué renglones salen, qué precio enseña cada
 *      uno, a qué cargos alcanza un cambio de precio, qué se puede quitar y
 *      cómo entra un concepto nuevo.
 *   2. Que solo se toca lo que NO tiene factura, con las rutas que ya existían
 *      y sus guardas: aquí no hay ruta nueva.
 *   3. Que lo que los textos afirman siga siendo verdad en el servidor.
 *
 * Los conceptos y los cargos de abajo son inventados.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  alQuitarConcepto,
  cadaCuanto,
  conceptosParaAgregar,
  conceptosPorClase,
  cuantos,
  filasDeConceptos,
  listaEfectiva,
  otraMensualidadQueYaTiene,
  precioCambiable,
  resumenDeConcepto,
  seAgregaComo,
  type CargoDeMatricula,
} from '@/lib/administracion-escolar/cobros-matricula';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

// Un catálogo de mentira, en el orden en que lo tendría puesto el colegio.
const COLEGIATURA = { id: 901, nombre: 'Colegiatura de prueba',    tipo: 'mensualidad', frecuencia: 'mensual' };
const INSCRIPCION = { id: 902, nombre: 'Inscripción de prueba',    tipo: 'inscripcion', frecuencia: 'unico' };
const SALA_TAREAS = { id: 903, nombre: 'Sala de tareas de prueba', tipo: 'mensualidad', frecuencia: 'mensual' };
const SEGURO      = { id: 904, nombre: 'Seguro de prueba',         tipo: 'otro',        frecuencia: 'semestral' };
const DIA_DE_CINE = { id: 905, nombre: 'Día de cine de prueba',    tipo: 'otro',        frecuencia: 'unico' };
const VIEJO       = { id: 906, nombre: 'Concepto viejo de prueba', tipo: 'otro',        frecuencia: 'unico', activo: false };
const CATALOGO = [COLEGIATURA, INSCRIPCION, SALA_TAREAS, SEGURO, DIA_DE_CINE, VIEJO];

let siguiente = 1;
function cargo(conceptoId: number | null, monto: number, extra: Partial<CargoDeMatricula> = {}): CargoDeMatricula {
  const c = CATALOGO.find((x) => x.id === conceptoId);
  return {
    id: siguiente++, concepto: c?.nombre ?? null, conceptoId,
    montoCentavos: monto, saldoCentavos: monto, estado: 'pendiente', ecfDocumentId: null,
    ...extra,
  };
}

/** El alumno de la queja: diez colegiaturas (una ya facturada y pagada), la inscripción pagada y un día de cine suelto. */
function cuentaDeEjemplo(): CargoDeMatricula[] {
  return [
    cargo(INSCRIPCION.id, 500000, { ecfDocumentId: 70, saldoCentavos: 0, estado: 'pagado' }),
    cargo(COLEGIATURA.id, 330000, { ecfDocumentId: 71, saldoCentavos: 0, estado: 'pagado' }),
    ...Array.from({ length: 9 }, () => cargo(COLEGIATURA.id, 330000)),
    cargo(DIA_DE_CINE.id, 15000),
  ];
}

describe('cadaCuanto — el ritmo que va en la línea gris de cada concepto', () => {
  it('dice el ritmo en minúscula, listo para ir detrás de «se le cobra»', () => {
    expect(cadaCuanto('mensual')).toBe('cada mes');
    expect(cadaCuanto('trimestral')).toBe('cada tres meses');
    expect(cadaCuanto('semestral')).toBe('cada seis meses');
    expect(cadaCuanto('unico')).toBe('una sola vez');
  });

  it('se calla cuando no sabe: no inventa «cada mes» de un concepto sin frecuencia', () => {
    expect(cadaCuanto(undefined)).toBeNull();
    expect(cadaCuanto(null)).toBeNull();
    expect(cadaCuanto('anual')).toBeNull();
    // El `tipo` del concepto no es su frecuencia: «mensualidad» no vale.
    expect(cadaCuanto('mensualidad')).toBeNull();
  });
});

describe('cuantos — los contadores', () => {
  it('singular y plural de verdad, sin «(s)»', () => {
    expect(cuantos(1, 'concepto', 'conceptos')).toBe('1 concepto');
    expect(cuantos(13, 'cargo', 'cargos')).toBe('13 cargos');
    expect(cuantos(0, 'concepto', 'conceptos')).toBe('0 conceptos');
  });
});

describe('filasDeConceptos — un renglón por concepto, no uno por mes', () => {
  it('las diez colegiaturas son UN renglón, con sus cargos contados', () => {
    const filas = filasDeConceptos(cuentaDeEjemplo(), [COLEGIATURA.id], CATALOGO);
    expect(filas.map((f) => f.nombre)).toEqual([
      'Colegiatura de prueba', 'Inscripción de prueba', 'Día de cine de prueba',
    ]);
    const colegiatura = filas[0];
    expect(colegiatura.cargos).toBe(10);
    expect(colegiatura.facturados).toBe(1);
    expect(colegiatura.conAbono).toBe(0);
    expect(colegiatura.libresIds).toHaveLength(9);
    expect(colegiatura.debeCentavos).toBe(9 * 330000);
    expect(colegiatura.tipo).toBe('mensualidad');
    expect(colegiatura.automatico).toBe(true);
    expect(colegiatura.frecuencia).toBe('mensual');
  });

  it('primero lo que el sistema le carga por su cuenta, después lo demás por orden de llegada', () => {
    const cargos = [cargo(DIA_DE_CINE.id, 15000), cargo(INSCRIPCION.id, 500000), cargo(COLEGIATURA.id, 330000)];
    const filas = filasDeConceptos(cargos, [SALA_TAREAS.id, COLEGIATURA.id], CATALOGO);
    expect(filas.map((f) => f.conceptoId)).toEqual([SALA_TAREAS.id, COLEGIATURA.id, DIA_DE_CINE.id, INSCRIPCION.id]);
  });

  it('un concepto automático que aún no generó nada sale igual, sin precio', () => {
    const [sala] = filasDeConceptos([], [SALA_TAREAS.id], CATALOGO);
    expect(sala).toMatchObject({ cargos: 0, facturados: 0, libresIds: [], debeCentavos: 0, precio: null, pendienteCentavos: 0 });
  });

  it('lo anulado no cuenta: quitar un concepto lo saca de la lista', () => {
    const cargos = [cargo(DIA_DE_CINE.id, 15000, { estado: 'anulado', saldoCentavos: 0 })];
    expect(filasDeConceptos(cargos, [], CATALOGO)).toEqual([]);
  });

  it('el precio lo dicen los cargos que todavía se pueden cambiar', () => {
    // Septiembre se facturó a 3,300; los nueve meses que quedan ya van a 3,000.
    const cargos = [
      cargo(COLEGIATURA.id, 330000, { ecfDocumentId: 71, saldoCentavos: 0, estado: 'pagado' }),
      ...Array.from({ length: 9 }, () => cargo(COLEGIATURA.id, 300000)),
    ];
    const [f] = filasDeConceptos(cargos, [COLEGIATURA.id], CATALOGO);
    expect(f.precio).toEqual({ clase: 'uno', centavos: 300000 });
  });

  it('con todo facturado enseña el de la factura, para no quedarse sin cifra', () => {
    const [f] = filasDeConceptos([cargo(INSCRIPCION.id, 500000, { ecfDocumentId: 70 })], [], CATALOGO);
    expect(f.precio).toEqual({ clase: 'uno', centavos: 500000 });
    expect(f.libresIds).toEqual([]);
  });

  it('si los cargos por cambiar no valen lo mismo, no elige uno: dice que hay varios', () => {
    const cargos = [cargo(COLEGIATURA.id, 330000), cargo(COLEGIATURA.id, 330100)];
    const [f] = filasDeConceptos(cargos, [COLEGIATURA.id], CATALOGO);
    expect(f.precio).toEqual({ clase: 'varios' });
    // Y los enseña, de menor a mayor, para que el editor los diga antes de igualarlos.
    expect(f.montosLibres).toEqual([330000, 330100]);
  });

  it('un cargo sin factura pero con pagos NO es libre: ni se le cambia el monto ni se quita', () => {
    // Pasa al desvincular un cargo de una factura ya cobrada: se queda sin
    // factura, con su dinero aplicado. Subirle el monto le reabriría deuda y
    // anularlo borraría un cobro.
    const cargos = [
      cargo(COLEGIATURA.id, 330000, { saldoCentavos: 130000, estado: 'parcial' }),
      cargo(COLEGIATURA.id, 330000, { saldoCentavos: 0, estado: 'pagado' }),
      cargo(COLEGIATURA.id, 330000),
      cargo(COLEGIATURA.id, 330000, { estado: 'vencido' }),
    ];
    const [f] = filasDeConceptos(cargos, [COLEGIATURA.id], CATALOGO);
    expect(f.conAbono).toBe(2);
    expect(f.libresIds).toHaveLength(2);
    // Lo que se perdonaría al quitar es solo lo de los libres.
    expect(f.debeCentavos).toBe(2 * 330000);
    expect(f.pendienteCentavos).toBe(130000 + 2 * 330000);
  });

  it('recuerda que ya se le quitaron cargos de un concepto: esos no vuelven a salir solos', () => {
    const cargos = [cargo(SALA_TAREAS.id, 150000, { estado: 'anulado', saldoCentavos: 0 }), cargo(SALA_TAREAS.id, 150000)];
    const [f] = filasDeConceptos(cargos, [SALA_TAREAS.id], CATALOGO);
    expect(f.cargos).toBe(1);
    expect(f.tieneAnulados).toBe(true);
    expect(filasDeConceptos([cargo(SALA_TAREAS.id, 150000)], [SALA_TAREAS.id], CATALOGO)[0].tieneAnulados).toBe(false);
  });

  it('lo pendiente es el saldo, no el monto', () => {
    const filas = filasDeConceptos(cuentaDeEjemplo(), [COLEGIATURA.id], CATALOGO);
    expect(filas[0].pendienteCentavos).toBe(9 * 330000);
    expect(filas[1].pendienteCentavos).toBe(0);
    expect(filas.reduce((s, f) => s + f.pendienteCentavos, 0)).toBe(9 * 330000 + 15000);
  });

  it('un cargo sin concepto tiene su renglón y no se pierde', () => {
    const [f] = filasDeConceptos([cargo(null, 20000)], [], CATALOGO);
    expect(f).toMatchObject({ conceptoId: 0, nombre: 'Sin concepto', cargos: 1 });
  });

  it('un concepto que ya no está en el catálogo se llama como lo llama su cargo', () => {
    const [f] = filasDeConceptos([{ ...cargo(null, 20000), conceptoId: 999, concepto: 'Uniforme de prueba' }], [], CATALOGO);
    expect(f.nombre).toBe('Uniforme de prueba');
    expect(f.frecuencia).toBeNull();
  });

  it('avisa del concepto dado de baja en el colegio', () => {
    const [f] = filasDeConceptos([cargo(VIEJO.id, 20000)], [], CATALOGO);
    expect(f.deBaja).toBe(true);
  });
});

describe('resumenDeConcepto — la línea gris', () => {
  it('dice cuántos cargos hay y en qué están', () => {
    expect(resumenDeConcepto({ cargos: 0, facturados: 0, conAbono: 0 })).toBe('todavía sin cargos');
    expect(resumenDeConcepto({ cargos: 1, facturados: 0, conAbono: 0 })).toBe('1 cargo sin factura');
    expect(resumenDeConcepto({ cargos: 9, facturados: 0, conAbono: 0 })).toBe('9 cargos sin factura');
    expect(resumenDeConcepto({ cargos: 1, facturados: 1, conAbono: 0 })).toBe('1 cargo con factura');
    expect(resumenDeConcepto({ cargos: 3, facturados: 3, conAbono: 0 })).toBe('3 cargos con factura');
    expect(resumenDeConcepto({ cargos: 2, facturados: 0, conAbono: 2 })).toBe('2 cargos con pagos');
    expect(resumenDeConcepto({ cargos: 10, facturados: 1, conAbono: 0 })).toBe('10 cargos: 1 con factura, 9 sin factura');
    expect(resumenDeConcepto({ cargos: 10, facturados: 2, conAbono: 1 })).toBe('10 cargos: 2 con factura, 1 con pagos, 7 sin factura');
  });
});

describe('listaEfectiva — lo que el sistema le carga DE VERDAD', () => {
  it('con lista guardada, es esa', () => {
    expect(listaEfectiva([COLEGIATURA.id, SALA_TAREAS.id], cuentaDeEjemplo())).toEqual([COLEGIATURA.id, SALA_TAREAS.id]);
  });

  it('con la lista vacía, son los conceptos de los cargos nacidos de una cuota (también los anulados)', () => {
    // La matrícula antigua: sin lista, pero el sistema le sigue cargando lo que
    // ya tenía cuotas. Si la pantalla no lo supiera, agregarle un concepto
    // apagaría la colegiatura.
    const cargos = [
      cargo(COLEGIATURA.id, 330000, { cuotaId: 11 }),
      cargo(SALA_TAREAS.id, 150000, { cuotaId: 21, estado: 'anulado', saldoCentavos: 0 }),
      cargo(DIA_DE_CINE.id, 15000),               // puesto a mano: sin cuota
      cargo(INSCRIPCION.id, 500000, { cuotaId: 0 }), // el pago único: cuota 0 no es cuota
    ];
    expect(listaEfectiva([], cargos)).toEqual([COLEGIATURA.id, SALA_TAREAS.id]);
  });

  it('sin lista y sin cuotas, de verdad no le carga nada', () => {
    expect(listaEfectiva([], [cargo(DIA_DE_CINE.id, 15000)])).toEqual([]);
  });
});

describe('precioCambiable — a qué se le cambia el precio', () => {
  it('solo si queda algún cargo sin factura, y con permiso', () => {
    expect(precioCambiable({ libresIds: [1, 2] }, true)).toBe(true);
    expect(precioCambiable({ libresIds: [] }, true)).toBe(false);
    expect(precioCambiable({ libresIds: [1, 2] }, false)).toBe(false);
  });
});

describe('alQuitarConcepto — dejar de cobrárselo y perdonarle lo que debe son dos cosas', () => {
  const base = { conAbono: 0 };

  it('un cobro suelto sin factura: quitarlo es perdonarle ese dinero, y se dice cuánto', () => {
    const cine = { ...base, automatico: false, libresIds: [5], debeCentavos: 15000, facturados: 0 };
    expect(alQuitarConcepto(cine, [COLEGIATURA.id], true))
      .toEqual({ se: 'puede', dejaDeCargarse: false, anula: 1, perdona: 15000, seQueda: 0 });
  });

  it('el transporte que deja en noviembre debiendo dos meses: se puede dejar de cobrar SIN perdonarlos', () => {
    const transporte = { ...base, automatico: true, libresIds: [1, 2], debeCentavos: 740000, facturados: 1 };
    const plan = alQuitarConcepto(transporte, [COLEGIATURA.id, SALA_TAREAS.id], true);
    expect(plan).toEqual({ se: 'puede', dejaDeCargarse: true, anula: 2, perdona: 740000, seQueda: 1 });
  });

  it('lo que tiene factura o pagos se queda pase lo que pase', () => {
    const sala = { automatico: true, libresIds: [1], debeCentavos: 150000, facturados: 2, conAbono: 1 };
    expect(alQuitarConcepto(sala, [COLEGIATURA.id, SALA_TAREAS.id], true))
      .toMatchObject({ se: 'puede', anula: 1, seQueda: 3 });
  });

  it('uno automático sin nada que deber todavía se puede dejar de cargar', () => {
    const sala = { ...base, automatico: true, libresIds: [], debeCentavos: 0, facturados: 0 };
    expect(alQuitarConcepto(sala, [COLEGIATURA.id, SALA_TAREAS.id], true))
      .toEqual({ se: 'puede', dejaDeCargarse: true, anula: 0, perdona: 0, seQueda: 0 });
  });

  it('un cobro suelto con todo facturado o pagado no tiene nada que quitar desde aquí', () => {
    const inscripcion = { ...base, automatico: false, libresIds: [], debeCentavos: 0, facturados: 1 };
    expect(alQuitarConcepto(inscripcion, [COLEGIATURA.id], true)).toEqual({ se: 'no', porque: 'nada-que-quitar' });
  });

  it('el ÚNICO que el sistema le carga no se quita: el servidor no deja la matrícula sin ninguno', () => {
    const colegiatura = { ...base, automatico: true, libresIds: [1, 2, 3], debeCentavos: 990000, facturados: 1 };
    expect(alQuitarConcepto(colegiatura, [COLEGIATURA.id], true)).toEqual({ se: 'no', porque: 'ultimo-automatico' });
  });

  it('sin permiso de gestionar no se quita nada', () => {
    const cine = { ...base, automatico: false, libresIds: [5], debeCentavos: 15000, facturados: 0 };
    expect(alQuitarConcepto(cine, [], false)).toEqual({ se: 'no', porque: 'sin-permiso' });
  });
});

describe('seAgregaComo — cómo entra un concepto nuevo', () => {
  it('lo que se repite entra a lo que el sistema le carga; lo de una vez, como un cargo ahora', () => {
    expect(seAgregaComo(SALA_TAREAS)).toBe('automatico');
    expect(seAgregaComo(SEGURO)).toBe('automatico');
    expect(seAgregaComo(DIA_DE_CINE)).toBe('cargo');
    expect(seAgregaComo(INSCRIPCION)).toBe('cargo');
  });

  it('una mensualidad va siempre por la lista, aunque no traiga frecuencia', () => {
    // Un cargo suelto de mensualidad pide además de qué mes es.
    expect(seAgregaComo({ tipo: 'mensualidad' })).toBe('automatico');
    expect(seAgregaComo({ tipo: 'mensualidad', frecuencia: 'unico' })).toBe('automatico');
  });

  it('sin frecuencia y sin ser mensualidad, es un cargo de una vez', () => {
    expect(seAgregaComo({ tipo: 'otro' })).toBe('cargo');
  });
});

describe('conceptosParaAgregar — el desplegable «Agregar un concepto»', () => {
  const filas = filasDeConceptos(cuentaDeEjemplo(), [COLEGIATURA.id], CATALOGO);

  it('dos montones: lo que se repite y lo de una sola vez', () => {
    // A quien todavía no tiene nada se le ofrece todo, en sus dos montones.
    const grupos = conceptosParaAgregar(CATALOGO, []);
    expect(grupos.map((g) => g.titulo)).toEqual([
      'Se cobra todos los meses o cada cierto tiempo', 'Se cobra una sola vez',
    ]);
  });

  it('no ofrece lo que ya tiene: ni lo que el sistema ya le carga, ni un cobro de una vez que ya está en su cuenta', () => {
    const grupos = conceptosParaAgregar(CATALOGO, filas);
    // Inscripción y día de cine ya los tiene y el viejo está dado de baja: el
    // montón de «una sola vez» se queda vacío y ni siquiera sale.
    expect(grupos.map((g) => g.titulo)).toEqual(['Se cobra todos los meses o cada cierto tiempo']);
    expect(grupos[0].conceptos.map((c) => c.id)).toEqual([SALA_TAREAS.id, SEGURO.id]);
  });

  it('un cobro de una sola vez que el sistema YA le va a cargar no se ofrece: serían dos', () => {
    // «Graduación» está en su lista, con fecha para mayo, y todavía no ha
    // salido. Agregarla a mano en octubre y esperar a mayo son dos cargos.
    const filas2 = filasDeConceptos([], [COLEGIATURA.id, INSCRIPCION.id], CATALOGO);
    const ids = conceptosParaAgregar(CATALOGO, filas2).flatMap((g) => g.conceptos.map((c) => c.id));
    expect(ids).not.toContain(INSCRIPCION.id);
    expect(ids).toContain(DIA_DE_CINE.id);
  });

  it('lo dado de baja no se ofrece', () => {
    const ids = conceptosParaAgregar(CATALOGO, []).flatMap((g) => g.conceptos.map((c) => c.id));
    expect(ids).not.toContain(VIEJO.id);
    expect(ids).toEqual([COLEGIATURA.id, SALA_TAREAS.id, SEGURO.id, INSCRIPCION.id, DIA_DE_CINE.id]);
  });

  it('un concepto quitado (sus cargos anulados) se puede volver a agregar', () => {
    const cargos = [cargo(DIA_DE_CINE.id, 15000, { estado: 'anulado', saldoCentavos: 0 })];
    const grupos = conceptosParaAgregar(CATALOGO, filasDeConceptos(cargos, [], CATALOGO));
    expect(grupos.flatMap((g) => g.conceptos.map((c) => c.id))).toContain(DIA_DE_CINE.id);
  });
});

describe('otraMensualidadQueYaTiene — dos colegiaturas a la vez', () => {
  const filas = filasDeConceptos(cuentaDeEjemplo(), [COLEGIATURA.id], CATALOGO);

  it('avisa con el nombre de la que ya se le carga', () => {
    expect(otraMensualidadQueYaTiene(SALA_TAREAS, filas)).toBe('Colegiatura de prueba');
  });

  it('no avisa si lo nuevo no es una mensualidad, ni si no tenía ninguna', () => {
    expect(otraMensualidadQueYaTiene(SEGURO, filas)).toBeNull();
    expect(otraMensualidadQueYaTiene(SALA_TAREAS, filasDeConceptos([], [SEGURO.id], CATALOGO))).toBeNull();
  });

  it('una mensualidad que ya no se le carga (solo quedan sus cargos) no cuenta', () => {
    const sueltas = filasDeConceptos([cargo(COLEGIATURA.id, 330000)], [SEGURO.id], CATALOGO);
    expect(otraMensualidadQueYaTiene(SALA_TAREAS, sueltas)).toBeNull();
  });
});

describe('conceptosPorClase — el desplegable de «Agregar cargo» de la ficha', () => {
  const lista = [
    { id: 1, nombre: 'Inscripción', tipo: 'inscripcion' },
    { id: 2, nombre: 'Colegiatura', tipo: 'mensualidad' },
    { id: 3, nombre: 'Día de cine', tipo: 'otro' },
    { id: 4, nombre: 'Sala de tareas', tipo: 'mensualidad' },
  ];

  it('separa las mensualidades de los demás cargos, con los nombres de las pestañas', () => {
    const grupos = conceptosPorClase(lista);
    expect(grupos.map((g) => g.titulo)).toEqual(['Mensualidades', 'Otros cargos']);
    expect(grupos[0].conceptos.map((c) => c.id)).toEqual([2, 4]);
    expect(grupos[1].conceptos.map((c) => c.id)).toEqual([1, 3]);
  });

  it('no pierde ni repite ninguno', () => {
    const ids = conceptosPorClase(lista).flatMap((g) => g.conceptos.map((c) => c.id)).sort();
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('un grupo vacío no sale', () => {
    expect(conceptosPorClase(lista.filter((c) => c.tipo !== 'mensualidad')).map((g) => g.titulo)).toEqual(['Otros cargos']);
    expect(conceptosPorClase(lista.filter((c) => c.tipo === 'mensualidad')).map((g) => g.titulo)).toEqual(['Mensualidades']);
    expect(conceptosPorClase([])).toEqual([]);
  });
});

describe('la pantalla usa esas reglas y no enseña ya los cargos mes por mes', () => {
  const formulario = lee('components/administracion-escolar/MatriculaFormulario.tsx');
  const lista      = lee('components/administracion-escolar/ConceptosDeLaMatricula.tsx');

  it('al editar monta UNA lista por concepto; las dos tarjetas de antes ya no están', () => {
    expect(formulario).toContain('<ConceptosDeLaMatricula');
    expect(formulario).not.toContain('ConceptosRecurrentes');
    expect(formulario).not.toContain('CargosDeLaMatricula');
    // Los títulos de las dos tarjetas viejas, tal como se pintaban.
    expect(lista).not.toContain('>Lo que ya tiene en su cuenta<');
    expect(lista).not.toContain('>Cobros automáticos<');
    // Ni el vencimiento de cada cargo: eso es el mes por mes, y vive en la ficha.
    expect(lista).not.toContain('c.fechaVencimiento');
  });

  it('renglones, montos y permisos salen de las funciones probadas arriba, sobre la lista EFECTIVA', () => {
    expect(lista).toContain('const efectivos = useMemo(() => listaEfectiva(automaticos, cargos), [automaticos, cargos]);');
    expect(lista).toContain('filasDeConceptos(cargos, efectivos, catalogo)');
    expect(lista).toContain('conceptosParaAgregar(catalogo, filas)');
    expect(lista).toContain('precioCambiable(f, editable)');
    expect(lista).toContain('alQuitarConcepto(f, efectivos, editable)');
    expect(lista).toContain('otraMensualidadQueYaTiene(nuevo, filas)');
  });

  it('trabaja sobre la matrícula GUARDADA, y dice de quién es', () => {
    expect(formulario).toContain('periodoId={matricula.periodoId}');
    expect(formulario).toContain('inscritoDesde={matricula.fechaInscripcion}');
    expect(formulario).toContain('estado={matricula.estado}');
    expect(formulario).toContain('alumno={nombreFijo}');
    expect(lista).toContain('Lo que se le cobra{aQuien}');
    // …también dentro de lo que confirma: con dos hermanos abiertos es fácil equivocarse.
    expect(lista).toContain('Quitar «{f.nombre}»{deQuien}');
  });

  it('dice que se aplica en el momento, y manda a la ficha para tocar UN solo mes', () => {
    expect(lista).toContain('Todo se aplica en el momento, no al pulsar «Guardar cambios».');
    expect(lista).toContain('Para cambiar o quitar un solo mes,');
    expect(lista).toContain('<Link href={fichaDelAlumno} target="_blank"');
  });
});

describe('las cuatro formas de perder dinero que encontró la revisión', () => {
  const lista = lee('components/administracion-escolar/ConceptosDeLaMatricula.tsx');
  const formulario = lee('components/administracion-escolar/MatriculaFormulario.tsx');

  it('quitar no perdona deuda por sí solo: son dos botones, y el que perdona dice cuánto', () => {
    expect(lista).toContain('onClick={() => quitar(f, false)}>Solo dejar de cobrárselo</BotonGris>');
    expect(lista).toContain('onClick={() => quitar(f, true)}');
    expect(lista).toContain('`Dejar de cobrárselo y perdonarle ${fmtDOP(plan.perdona)}`');
    expect(lista).toContain('`Quitarlo: se le perdonan ${fmtDOP(plan.perdona)}`');
    // Solo se anula si se eligió perdonar.
    const quitar = lista.slice(lista.indexOf('function quitar('), lista.indexOf('function agregar('));
    expect(quitar).toContain('if (perdonar) {');
    expect(quitar.indexOf("{ method: 'DELETE' }")).toBeGreaterThan(quitar.indexOf('if (perdonar) {'));
  });

  it('un Enter repetido no manda la acción dos veces', () => {
    // La guarda es una ref: el estado no llega a tiempo entre dos teclas.
    expect(lista).toContain('if (enMarcha.current) return;');
    expect(lista).toContain("if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) confirmar(); }");
    for (const accion of ['cambiarPrecio', 'quitar', 'agregar']) {
      const desde = lista.indexOf(`function ${accion}(`);
      expect(lista.slice(desde, desde + 1500), accion).toContain('void unaALaVez(async () => {');
    }
    // Y los dos campos se apagan mientras hay una acción en marcha.
    expect(lista.split('disabled={ocupado}').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('no promete un precio para lo que el sistema genere después', () => {
    expect(lista).toContain('Esto cambia los cargos que ya tiene. Los que el sistema genere más adelante saldrán al');
    expect(lista).toContain('Monto de CADA cargo de «{f.nombre}»{deQuien}');
    // La cuenta hecha antes de guardar: N × monto = total.
    expect(lista).toContain('{f.libresIds.length} × {fmtDOP(nuevoMonto)} = <b>{fmtDOP(nuevoMonto * f.libresIds.length)}</b>');
    // Y si hoy no valen lo mismo, los dice antes de igualarlos.
    expect(lista).toContain('Hoy no valen todos lo mismo ({f.montosLibres.map((m) => fmtDOP(m)).join');
  });

  it('«Guardar cambios» ya no vuelve a mandar la lista de conceptos: no pisa lo que cambió otra pestaña', () => {
    expect(formulario).toContain('...(editando ? { estado: form.estado } : { conceptos }),');
    expect(formulario).not.toContain('conceptosIds: conceptosMatricula');
  });
});

describe('solo usa las rutas que ya existían, y por sus mismas guardas', () => {
  const lista = lee('components/administracion-escolar/ConceptosDeLaMatricula.tsx');
  const formulario = lee('components/administracion-escolar/MatriculaFormulario.tsx');
  const cargoPorId = lee('app/api/administracion-escolar/cargos/[id]/route.ts');
  const matricula  = lee('app/api/administracion-escolar/matriculas/[id]/route.ts');

  it('el monto se cambia cargo por cargo, solo en los libres', () => {
    expect(lista).toContain('for (const id of f.libresIds) {');
    expect(lista).toContain("method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ montoCentavos: centavos }),");
    // Y si alguno se colara, el servidor lo para.
    expect(cargoPorId).toContain("if (cargo.estado === 'anulado') {");
    expect(cargoPorId).toContain('if (cargo.ecfDocumentId != null) {');
  });

  it('perdonar ANULA, no borra, y tampoco toca lo facturado', () => {
    expect(lista).toContain("{ method: 'DELETE' }, 'No se pudo quitar el cargo');");
    expect(cargoPorId).toContain(".set({ estado: 'anulado', saldoCentavos: 0, updatedAt: new Date() })");
    expect(cargoPorId).toContain("'El cargo tiene una factura vinculada. Desvincula o anula la factura antes de anular el cargo.'");
  });

  it('primero deja de cargárselo y después anula: si falla a medias no queda generándose', () => {
    const quitar = lista.slice(lista.indexOf('function quitar('), lista.indexOf('function agregar('));
    const sacar  = quitar.indexOf('if (f.automatico) await guardarLista(efectivos.filter(');
    const anular = quitar.indexOf("{ method: 'DELETE' }");
    expect(sacar).toBeGreaterThan(-1);
    expect(anular).toBeGreaterThan(sacar);
  });

  it('la lista se guarda sola y ENTERA: la primera escritura sobre una lista vacía no apaga lo demás', () => {
    expect(lista).toContain("method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ conceptosIds: ids }),");
    expect(lista).toContain('await guardarLista([...efectivos, c.id]);');
    // El servidor solo cambia lo que le llega: lo demás va con `!== undefined`.
    expect(matricula).toContain('...(cursoId !== undefined ? { cursoId: Number(cursoId) } : {}),');
    expect(matricula).toContain('...(estado !== undefined && ESTADOS.includes(estado) ? { estado } : {}),');
  });

  it('«no se puede quitar lo único que el sistema le carga»: lo rechaza el servidor', () => {
    expect(matricula).toContain('if (pedidos.length === 0 && (actual.conceptosIds ?? []).length > 0) {');
  });

  it('un concepto de una sola vez entra como cargo, con el plazo del concepto y el monto del colegio si no se escribe', () => {
    const crear = lee('app/api/administracion-escolar/cargos/route.ts');
    expect(lista).toContain("await pedir('/api/administracion-escolar/cargos', {");
    expect(lista).toContain('...(centavos != null ? { montoCentavos: centavos } : {}),');
    expect(lista).toContain('fechaVencimiento: vencimientoDe(ancla, c.diasParaPago ?? null),');
    // La inscripción se fecha en la inscripción; los demás pagos únicos, hoy.
    expect(lista).toContain("const ancla = c.tipo === 'inscripcion' && inscritoDesde ? inscritoDesde : hoyRD();");
    expect(crear).toContain('const tarifa = await resolverTarifa(teamId, refs.ids.matricula!, refs.ids.concepto!);');
  });

  it('después de cada acción se vuelve a pedir la cuenta, TAMBIÉN si falló', () => {
    // Un cargo pudo crearse y perderse la respuesta: sin volver a pedir, el
    // concepto seguiría ofrecido y el reintento lo duplicaría.
    expect(lista.split('await recargarCargos();').length - 1).toBeGreaterThanOrEqual(3);
    const agregar = lista.slice(lista.indexOf('function agregar('));
    expect(agregar.indexOf('await recargarCargos();')).toBeGreaterThan(agregar.indexOf('} catch (e: unknown) {'));
  });

  it('con más cargos de los que llegan, o sin catálogo, la tarjeta no opera a ciegas', () => {
    expect(formulario).toContain('setCargosIncompletos(Number(data.total ?? lista.length) > lista.length);');
    expect(formulario).toContain("setConceptosCarga(m.matricula != null && c != null ? 'lista' : 'fallo');");
    expect(lista).toContain(') : cargosIncompletos ? (');
  });

  it('en una matrícula que no está activa no se ofrece agregar lo que se repite', () => {
    expect(lista).toContain('{activa && <BotonAgregar ocupado={ocupado} onClick={() => agregar(nuevo)} />}');
    expect(lista).toContain('Esta matrícula no está activa, y el sistema solo le carga a las activas');
  });
});

describe('lo que el formulario sigue guardando con «Guardar cambios»', () => {
  const formulario = lee('components/administracion-escolar/MatriculaFormulario.tsx');

  it('si los cargos no se pueden volver a pedir, no se vacía la cuenta', () => {
    expect(formulario).toContain('if (!res.ok) return;');
    expect(formulario).toContain("} catch { /* se queda lo que había */ }");
  });

  it('la tarjeta avisa al formulario de la lista que dejó guardada', () => {
    expect(formulario).toContain('onAutomaticos={setConceptosMatricula}');
  });
});

describe('lo que los textos afirman sigue siendo verdad en el servidor', () => {
  const plan     = lee('lib/administracion-escolar/plan-cobro.ts');
  const devengo  = lee('lib/administracion-escolar/devengar.ts');
  const cron     = lee('app/api/cron/escolar-devengo/route.ts');
  const guardado = lee('app/api/administracion-escolar/matriculas/[id]/route.ts');

  it('«No se le pone nada en este momento»: guardar la lista de la matrícula no genera cargos', () => {
    expect(guardado).not.toContain('devengarPeriodo');
    expect(guardado).not.toContain('adminEscolarCargos).values');
  });

  it('se le carga mientras la matrícula esté activa y sea del año escolar activo', () => {
    expect(devengo).toContain("eq(adminEscolarMatriculas.estado, 'activa')");
    expect(cron).toContain('.where(eq(adminEscolarPeriodos.activo, true))');
  });

  it('«le cargará también lo que ya salió desde su inscripción»: el plan se arma desde esa fecha', () => {
    expect(devengo).toContain('const desde = m.fechaInscripcion ?? hasta;');
    expect(devengo).toContain('const plan = await armarPlanDeCobro(teamId, ctx, String(desde));');
  });

  it('por qué existe `listaEfectiva`: con la lista vacía el sistema sigue con lo que ya tenía cuotas', () => {
    expect(devengo).toContain('|| (elegidos.size === 0 && l.cuotas.some((c) => yaUsados.has(c.cuotaId))))');
  });

  it('«saldrán al precio del colegio»: el cargo que genera el sistema nace con el monto de la tarifa', () => {
    expect(plan).toContain('if (!tarifa) continue;');
    expect(devengo).toContain('montoCentavos: cuota.montoCentavos,');
  });

  it('«sin precio no sale nada»: un concepto sin tarifa se salta entero', () => {
    expect(plan).toContain('if (!tarifa) continue;');
  });

  it('«esos cargos no regresan solos»: el devengo cuenta también los anulados como ya hechos', () => {
    // Si solo mirara los vivos, quitar un mes lo traería de vuelta al día
    // siguiente. La consulta de «qué cuotas ya tiene» no filtra por estado.
    const consulta = devengo.slice(devengo.indexOf('const yaHechos = await tx'), devengo.indexOf('const existentes = new Set(yaHechos'));
    expect(consulta.length).toBeGreaterThan(0);
    expect(consulta).not.toContain('estado');
  });
});
