// tests/unit/facturar-lote.test.ts
import { describe, it, expect } from 'vitest';
import {
  FACTURAS_POR_TANDA,
  MAX_ALUMNOS_POR_PETICION,
  MAX_CONCEPTOS_POR_PETICION,
  PAGO_UNICO,
  SIN_FILTRO,
  agruparOmitidos,
  crearPorTandas,
  dividirEnTandas,
  estadoDeLaCasilla,
  facturasEnLetras,
  filtrarAlumnos,
  leerPeticionLote,
  marcarVarios,
  conceptosDelMes,
  describirCalendario,
  finDeMes,
  hastaParaMeses,
  listaDeMeses,
  mesDeCuota,
  mesDelCargo,
  mesesParaElegir,
  resumenPorMes,
  opcionesDeGrado,
  opcionesDeSeccion,
  periodoDeLinea,
  planearFacturasPorLote,
  textoCrear,
  type AlumnoCatalogo,
  type AlumnoLote,
  type CargoLote,
  type EnvioTanda,
  type FacturaCreada,
  type FacturaPlan,
  type OpcionesLote,
} from '@/lib/administracion-escolar/facturar-lote';

/**
 * El planificador decide cuántas facturas salen y de quién. Es lo que la
 * secretaria lee en la vista previa Y lo que el servidor entrega al constructor
 * de facturas, así que un error aquí es una factura de más o de menos.
 */

const alumno = (id: number, nombre: string, clienteId: number | null = id * 10, responsable: string | null = `Familia ${nombre}`): AlumnoLote =>
  ({ id, nombre, clienteId, responsable });

let n = 0;
const cargo = (estudianteId: number, extra: Partial<CargoLote> = {}): CargoLote => ({
  id: ++n,
  estudianteId,
  conceptoId: 1,
  conceptoNombre: 'Colegiatura',
  mes: 10,
  anio: 2026,
  estado: 'pendiente',
  saldoCentavos: 500000,
  fechaVencimiento: '2026-10-05',
  fechaEmision: '2026-10-01',
  ecfDocumentId: null,
  ...extra,
});

const ana = alumno(1, 'Ana Pérez', 100, 'Madre de Ana');
const luis = alumno(2, 'Luis Pérez', 100, 'Madre de Ana'); // hermano de Ana
const eva = alumno(3, 'Eva Gómez', 300, 'Padre de Eva');

const opciones = (extra: Partial<OpcionesLote> = {}): OpcionesLote => ({
  alumnos: [ana, luis, eva],
  conceptoIds: [1],
  hasta: '2026-10-22',
  juntarHermanos: false,
  ...extra,
});

describe('una factura por alumno (lo que pidió el colegio)', () => {
  it('tres alumnos, tres facturas, aunque dos sean hermanos', () => {
    const plan = planearFacturasPorLote([cargo(1), cargo(2), cargo(3)], opciones());

    expect(plan.facturas).toHaveLength(3);
    expect(plan.facturas.map((f) => f.estudiantes.map((e) => e.nombre))).toEqual([
      ['Ana Pérez'], ['Eva Gómez'], ['Luis Pérez'],
    ]);
    // Ana y Luis comparten responsable: cada uno lleva su factura, a su nombre.
    expect(plan.facturas.filter((f) => f.clienteId === 100)).toHaveLength(2);
  });

  it('cada factura lleva todos los cargos de ese alumno', () => {
    const a1 = cargo(1, { mes: 9 });
    const a2 = cargo(1, { mes: 10 });
    const plan = planearFacturasPorLote([a1, a2, cargo(3)], opciones());

    const deAna = plan.facturas.find((f) => f.estudiantes[0].id === 1)!;
    expect(deAna.cargoIds).toEqual([a1.id, a2.id]);
    expect(deAna.lineas).toHaveLength(2);
    expect(deAna.totalCentavos).toBe(1000000);
    expect(plan.totalCargos).toBe(3);
    expect(plan.totalCentavos).toBe(1500000);
  });

  it('las líneas van en orden de fecha y lo que no tiene mes, al final', () => {
    const inscripcion = cargo(1, { mes: null, conceptoNombre: 'Inscripción', conceptoId: 2 });
    const octubre = cargo(1, { mes: 10 });
    const septiembre = cargo(1, { mes: 9 });
    const plan = planearFacturasPorLote([inscripcion, octubre, septiembre], opciones({ conceptoIds: [1, 2] }));

    expect(plan.facturas[0].lineas.map((l) => l.concepto + (l.mes ?? ''))).toEqual([
      'Colegiatura9', 'Colegiatura10', 'Inscripción',
    ]);
  });
});

describe('«Juntar hermanos»: una factura por responsable, como el cron', () => {
  it('Ana y Luis (mismo responsable) salen en UNA factura de dos líneas', () => {
    const plan = planearFacturasPorLote([cargo(1), cargo(2), cargo(3)], opciones({ juntarHermanos: true }));

    expect(plan.facturas).toHaveLength(2);
    const familia = plan.facturas.find((f) => f.clienteId === 100)!;
    expect(familia.clave).toBe('r:100');
    expect(familia.estudiantes.map((e) => e.id)).toEqual([1, 2]);
    expect(familia.lineas.map((l) => l.estudiante)).toEqual(['Ana Pérez', 'Luis Pérez']);
    expect(familia.responsable).toBe('Madre de Ana');
  });

  it('si el hermano no tiene nada que facturar, la factura de la familia lo deja fuera', () => {
    const plan = planearFacturasPorLote([cargo(1), cargo(2, { ecfDocumentId: 9 })], opciones({ juntarHermanos: true }));

    expect(plan.facturas).toHaveLength(1);
    expect(plan.facturas[0].estudiantes.map((e) => e.id)).toEqual([1]);
    expect(plan.omitidos.map((o) => o.estudianteId)).toContain(2);
  });

  it('las claves distinguen los dos modos', () => {
    const porAlumno = planearFacturasPorLote([cargo(1)], opciones());
    const porFamilia = planearFacturasPorLote([cargo(1)], opciones({ juntarHermanos: true }));
    expect(porAlumno.facturas[0].clave).toBe('e:1');
    expect(porFamilia.facturas[0].clave).toBe('r:100');
  });
});

describe('qué cargos entran', () => {
  it('solo los de los conceptos elegidos', () => {
    const colegiatura = cargo(1, { conceptoId: 1 });
    const uniforme = cargo(1, { conceptoId: 7, conceptoNombre: 'Uniforme' });
    const plan = planearFacturasPorLote([colegiatura, uniforme], opciones({ conceptoIds: [1] }));

    expect(plan.facturas[0].cargoIds).toEqual([colegiatura.id]);
  });

  it('un cargo que ya tiene factura NO entra: no se factura dos veces', () => {
    const plan = planearFacturasPorLote([cargo(1, { ecfDocumentId: 55 })], opciones());

    expect(plan.facturas).toHaveLength(0);
    expect(plan.omitidos[0]).toMatchObject({ estudianteId: 1, motivo: 'ya-facturado' });
  });

  it('un cargo anulado no cuenta ni para el motivo', () => {
    const plan = planearFacturasPorLote([cargo(1, { estado: 'anulado' })], opciones({ alumnos: [ana] }));

    expect(plan.facturas).toHaveLength(0);
    expect(plan.omitidos[0]).toMatchObject({ estudianteId: 1, motivo: 'sin-cargos' });
  });

  it('un cargo ya pagado no se factura', () => {
    const plan = planearFacturasPorLote([cargo(1, { estado: 'pagado', saldoCentavos: 0 })], opciones({ alumnos: [ana] }));

    expect(plan.facturas).toHaveLength(0);
    expect(plan.omitidos[0].motivo).toBe('ya-facturado');
  });

  it('parcial y vencido sí se facturan: son deuda viva', () => {
    const plan = planearFacturasPorLote(
      [cargo(1, { estado: 'parcial' }), cargo(1, { estado: 'vencido' })],
      opciones({ alumnos: [ana] }),
    );
    expect(plan.facturas[0].cargoIds).toHaveLength(2);
  });
});

describe('«cuotas emitidas hasta»', () => {
  it('lo emitido el mismo día del corte entra (el corte es inclusivo)', () => {
    const plan = planearFacturasPorLote([cargo(1, { fechaEmision: '2026-10-22' })], opciones());
    expect(plan.facturas).toHaveLength(1);
  });

  it('lo que se emite después del corte no entra, y el motivo dice cuándo vuelve', () => {
    const plan = planearFacturasPorLote(
      [cargo(1, { fechaEmision: '2026-11-01' }), cargo(1, { fechaEmision: '2026-12-01' })],
      opciones({ alumnos: [ana] }),
    );

    expect(plan.facturas).toHaveLength(0);
    expect(plan.omitidos[0]).toMatchObject({ motivo: 'despues-del-corte' });
    // La PRÓXIMA, no la última.
    expect(plan.omitidos[0].detalle).toContain('01/11/2026');
  });

  it('un alumno con una cuota ya emitida y otra futura: factura la emitida y calla la otra', () => {
    const hoy = cargo(1, { fechaEmision: '2026-10-01' });
    const futura = cargo(1, { fechaEmision: '2026-11-01' });
    const plan = planearFacturasPorLote([hoy, futura], opciones({ alumnos: [ana] }));

    expect(plan.facturas[0].cargoIds).toEqual([hoy.id]);
    expect(plan.omitidos).toHaveLength(0);
  });

  it('subir el corte mete lo que antes quedaba fuera', () => {
    const futura = cargo(1, { fechaEmision: '2026-11-01' });
    expect(planearFacturasPorLote([futura], opciones({ hasta: '2026-10-31' })).facturas).toHaveLength(0);
    expect(planearFacturasPorLote([futura], opciones({ hasta: '2026-11-01' })).facturas).toHaveLength(1);
  });
});

describe('los meses que se eligen: facturar solo algunos', () => {
  const ago = () => cargo(1, { mes: 8, fechaEmision: '2026-08-01' });
  const sep = () => cargo(1, { mes: 9, fechaEmision: '2026-09-01' });
  const oct = () => cargo(1, { mes: 10, fechaEmision: '2026-10-01' });
  const nov = () => cargo(1, { mes: 11, fechaEmision: '2026-11-01' });

  it('sin meses entra todo lo pendiente, también lo atrasado (como siempre)', () => {
    const plan = planearFacturasPorLote([ago(), sep(), oct(), nov()], opciones({ alumnos: [ana], hasta: '2026-11-30' }));
    expect(plan.facturas[0].lineas.map((l) => l.mes)).toEqual([8, 9, 10, 11]);
  });

  it('octubre y noviembre: una factura con los dos; agosto y septiembre esperan', () => {
    const plan = planearFacturasPorLote([ago(), sep(), oct(), nov()],
      opciones({ alumnos: [ana], hasta: '2026-11-30', meses: ['2026-10', '2026-11'] }));
    expect(plan.facturas).toHaveLength(1);
    expect(plan.facturas[0].lineas.map((l) => l.mes)).toEqual([10, 11]);
    expect(plan.omitidos).toHaveLength(0);
  });

  it('meses sueltos también: solo septiembre', () => {
    const plan = planearFacturasPorLote([ago(), sep(), oct()], opciones({ alumnos: [ana], meses: ['2026-09'] }));
    expect(plan.facturas[0].lineas.map((l) => l.mes)).toEqual([9]);
  });

  it('la cuota cuenta por SU mes, no por el día en que se emite', () => {
    // La de octubre de un colegio que la emite el 25 de septiembre sigue siendo «octubre».
    const octTemprana = cargo(1, { mes: 10, fechaEmision: '2026-09-25' });
    const plan = planearFacturasPorLote([octTemprana], opciones({ alumnos: [ana], meses: ['2026-10'] }));
    expect(plan.facturas[0].cargoIds).toEqual([octTemprana.id]);
  });

  it('un cargo sin mes cuenta por el mes en que se emitió', () => {
    expect(mesDelCargo({ mes: null, anio: 2026, fechaEmision: '2026-09-14' })).toBe('2026-09');
    expect(mesDelCargo({ mes: 1, anio: 2027, fechaEmision: '2026-12-25' })).toBe('2027-01');
    const inscripcion = cargo(1, { mes: null, fechaEmision: '2026-08-10' });
    const plan = planearFacturasPorLote([inscripcion, oct()], opciones({ alumnos: [ana], meses: ['2026-10'] }));
    expect(plan.facturas[0].lineas.map((l) => l.mes)).toEqual([10]);
  });

  it('un pago único (sin mes ni calendario) no cuenta por el mes en que se creó: va aparte', () => {
    // Inscrito el 1 de agosto, matriculado en octubre: la inscripción se creó en octubre.
    const inscripcion = cargo(1, { mes: null, fechaEmision: '2026-10-16', pagoUnico: true });
    const conUnicos = planearFacturasPorLote([inscripcion, ago(), sep()],
      opciones({ alumnos: [ana], meses: ['2026-08', '2026-09'], conPagosUnicos: true }));
    expect(conUnicos.facturas[0].cargoIds).toContain(inscripcion.id);
    expect(conUnicos.facturas[0].lineas.map((l) => l.mes)).toEqual([8, 9, null]);

    // Sin «Pago único» no entra aunque se marque octubre.
    const sinUnicos = planearFacturasPorLote([inscripcion, oct()], opciones({ alumnos: [ana], meses: ['2026-10'] }));
    expect(sinUnicos.facturas[0].cargoIds).not.toContain(inscripcion.id);

    // Solo los pagos únicos, sin ningún mes.
    const solo = planearFacturasPorLote([inscripcion, ago()], opciones({ alumnos: [ana], meses: [], conPagosUnicos: true }));
    expect(solo.facturas[0].cargoIds).toEqual([inscripcion.id]);

    // Todo lo pendiente: entra como siempre.
    expect(planearFacturasPorLote([inscripcion], opciones({ alumnos: [ana] })).facturas[0].cargoIds).toEqual([inscripcion.id]);

    // Si es lo único que debe, se dice.
    const fuera = planearFacturasPorLote([inscripcion], opciones({ alumnos: [ana], meses: ['2026-09'] }));
    expect(fuera.omitidos[0]).toMatchObject({ motivo: 'otros-meses' });
    expect(fuera.omitidos[0].detalle).toContain('los pagos únicos');
  });

  it('un cargo sin mes PERO con calendario sigue contando por el mes de su cuota', () => {
    const conCuota = cargo(1, { mes: null, fechaEmision: '2026-10-01', pagoUnico: false });
    const plan = planearFacturasPorLote([conCuota], opciones({ alumnos: [ana], meses: ['2026-10'] }));
    expect(plan.facturas[0].cargoIds).toEqual([conCuota.id]);
  });

  it('si todo lo que debe es de otros meses, se dice cuáles', () => {
    const plan = planearFacturasPorLote([ago(), sep()], opciones({ alumnos: [ana], meses: ['2026-10'] }));
    expect(plan.facturas).toHaveLength(0);
    expect(plan.omitidos[0]).toMatchObject({ motivo: 'otros-meses' });
    expect(plan.omitidos[0].detalle).toContain('agosto y septiembre 2026');
  });

  it('los meses que se ofrecen son los del año escolar', () => {
    const meses = mesesParaElegir({ fechaInicio: '2026-08-01', fechaFin: '2027-06-30' }, '2026-10-24');
    expect(meses[0]).toEqual({ valor: '2026-08', texto: 'agosto 2026' });
    expect(meses.at(-1)).toEqual({ valor: '2027-06', texto: 'junio 2027' });
    expect(meses).toHaveLength(11);
    const sinFechas = mesesParaElegir({}, '2026-10-24');
    expect(sinFechas).toHaveLength(12);
    expect(sinFechas.at(-1)?.valor).toBe('2027-01');
  });

  it('los meses en una frase, el corte que les toca y lo pendiente de cada mes', () => {
    expect(listaDeMeses(['2026-11', '2026-10'])).toBe('octubre y noviembre 2026');
    expect(listaDeMeses(['2026-12', '2027-01'])).toBe('diciembre 2026 y enero 2027');
    expect(listaDeMeses(['2026-08', '2026-09', '2026-10'])).toBe('agosto, septiembre y octubre 2026');
    expect(finDeMes('2026-11')).toBe('2026-11-30');
    expect(finDeMes('2028-02')).toBe('2028-02-29');
    // Noviembre por adelantado: el corte es su último día. Solo meses pasados: el corte es hoy.
    expect(hastaParaMeses(['2026-10', '2026-11'], '2026-10-24')).toBe('2026-11-30');
    expect(hastaParaMeses(['2026-08'], '2026-10-24')).toBe('2026-10-24');
    // «Pago único» no es un mes: ni mueve el corte ni sale como mes en la frase.
    expect(hastaParaMeses(['2026-10', PAGO_UNICO], '2026-10-24')).toBe('2026-10-31');
    expect(hastaParaMeses([PAGO_UNICO], '2026-10-24')).toBe('2026-10-24');
    expect(listaDeMeses(['2026-09', PAGO_UNICO, '2026-08'])).toBe('agosto y septiembre 2026 y los pagos únicos');
    expect(listaDeMeses([PAGO_UNICO])).toBe('los pagos únicos');
    const pend = [
      { e: 1, c: 1, m: '2026-10', n: 2, centavos: 600000 },
      { e: 2, c: 1, m: '2026-10', n: 1, centavos: 300000 },
      { e: 1, c: 2, m: '2026-10', n: 1, centavos: 100000 },
    ];
    expect(resumenPorMes(pend, new Set([1]), new Set([1])).get('2026-10')).toEqual({ cargos: 2, centavos: 600000 });
    expect(resumenPorMes(pend, new Set([1, 2]), new Set([1, 2])).get('2026-10')).toEqual({ cargos: 4, centavos: 1000000 });
  });
});

describe('el calendario de cada concepto', () => {
  it('la cuota de enero que se emite en diciembre es del año siguiente', () => {
    expect(mesDeCuota(1, '2026-12-25')).toBe('2027-01');
    expect(mesDeCuota(10, '2026-09-25')).toBe('2026-10');
    expect(mesDeCuota(12, '2026-12-01')).toBe('2026-12');
    // Un cargo con su año bien puesto lo conserva.
    expect(mesDeCuota(9, '2027-03-10', 2026)).toBe('2026-09');
  });

  it('dice cómo cobra cada concepto', () => {
    const q = (m: string) => ({ c: 1, m, etiqueta: m });
    expect(describirCalendario(['2026-08', '2026-09', '2026-10', '2026-11'].map(q))).toBe('4 cuotas · agosto 2026 a noviembre 2026');
    expect(describirCalendario(['2026-11', '2027-05'].map(q))).toBe('2 cuotas · noviembre 2026 y mayo 2027');
    expect(describirCalendario([q('2026-10')])).toBe('Pago único · octubre 2026');
    expect(describirCalendario([])).toBe('Sin calendario: se cobra cuando se crea el cargo');
  });

  it('en un mes, lo de cada concepto marcado: sus cargos pendientes o la cuota de su calendario', () => {
    const pend = [{ e: 1, c: 1, m: '2026-10', n: 1, centavos: 500000 }, { e: 2, c: 1, m: '2026-10', n: 1, centavos: 500000 }];
    const cal = [{ c: 1, m: '2026-10', etiqueta: 'Oct' }, { c: 2, m: '2026-11', etiqueta: 'Brazalete 1' }];
    expect(conceptosDelMes('2026-10', pend, cal, new Set([1]), new Set([1, 2])))
      .toEqual([{ conceptoId: 1, cargos: 1, centavos: 500000, cuota: true }]);
    expect(conceptosDelMes('2026-11', pend, cal, new Set([1]), new Set([1, 2])))
      .toEqual([{ conceptoId: 2, cargos: 0, centavos: 0, cuota: true }]);
    // Un concepto no marcado no cuenta.
    expect(conceptosDelMes('2026-11', pend, cal, new Set([1]), new Set([1]))).toEqual([]);
  });
});

describe('a quién se deja fuera, y por qué', () => {
  it('sin responsable de pago: no hay a quién facturarle, y lo dice con el conteo', () => {
    const sinPadre = alumno(4, 'Zoe Sola', null, null);
    const c1 = cargo(4);
    const c2 = cargo(4, { mes: 9 });
    const plan = planearFacturasPorLote([c1, c2, cargo(3)], opciones({ alumnos: [sinPadre, eva] }));

    expect(plan.facturas).toHaveLength(1);
    expect(plan.omitidos).toEqual([
      expect.objectContaining({
        estudianteId: 4, motivo: 'sin-responsable', cargoIds: [c1.id, c2.id],
        detalle: expect.stringContaining('2 cargos'),
      }),
    ]);
  });

  it('un alumno sin responsable y sin nada pendiente NO se reporta como sin responsable', () => {
    const sinPadre = alumno(4, 'Zoe Sola', null, null);
    const plan = planearFacturasPorLote([], opciones({ alumnos: [sinPadre] }));
    expect(plan.omitidos[0].motivo).toBe('sin-cargos');
  });

  it('el becado al 100% no estrena una factura de RD$0', () => {
    const plan = planearFacturasPorLote([cargo(1, { saldoCentavos: 0 })], opciones({ alumnos: [ana] }));

    expect(plan.facturas).toHaveLength(0);
    expect(plan.omitidos[0].motivo).toBe('sin-saldo');
  });

  it('el becado con hermanos no mete una línea de cero en la factura de la familia', () => {
    const plan = planearFacturasPorLote(
      [cargo(1, { saldoCentavos: 0 }), cargo(2)],
      opciones({ alumnos: [ana, luis], juntarHermanos: true }),
    );

    expect(plan.facturas).toHaveLength(1);
    expect(plan.facturas[0].lineas.map((l) => l.estudianteId)).toEqual([2]);
  });

  it('un alumno marcado sin ningún cargo de esos conceptos aparece, no se pierde', () => {
    const plan = planearFacturasPorLote([cargo(1)], opciones());

    expect(plan.facturas).toHaveLength(1);
    // Eva y Luis, en orden alfabético: Ana ya tiene su factura.
    expect(plan.omitidos.map((o) => [o.estudianteId, o.motivo])).toEqual([
      [3, 'sin-cargos'],
      [2, 'sin-cargos'],
    ]);
  });

  it('cuotas futuras mandan sobre «ya facturado» para explicar por qué hoy no sale nada', () => {
    const plan = planearFacturasPorLote(
      [cargo(1, { ecfDocumentId: 5 }), cargo(1, { fechaEmision: '2026-11-01' })],
      opciones({ alumnos: [ana] }),
    );
    expect(plan.omitidos[0].motivo).toBe('despues-del-corte');
  });

  it('los omitidos salen en orden alfabético', () => {
    const plan = planearFacturasPorLote([], opciones());
    expect(plan.omitidos.map((o) => o.nombre)).toEqual(['Ana Pérez', 'Eva Gómez', 'Luis Pérez']);
  });
});

describe('robustez', () => {
  it('el mismo alumno dos veces en la lista no se factura dos veces', () => {
    const plan = planearFacturasPorLote([cargo(1)], opciones({ alumnos: [ana, ana] }));
    expect(plan.facturas).toHaveLength(1);
    expect(plan.totalCargos).toBe(1);
  });

  it('cargos de alumnos que no están en la lista se ignoran', () => {
    const plan = planearFacturasPorLote([cargo(99)], opciones({ alumnos: [ana] }));
    expect(plan.facturas).toHaveLength(0);
  });

  it('cada cargo va en UNA sola factura', () => {
    const cargos = [cargo(1), cargo(2), cargo(3), cargo(3, { mes: 9 })];
    for (const juntarHermanos of [false, true]) {
      const plan = planearFacturasPorLote(cargos, opciones({ juntarHermanos }));
      const todos = plan.facturas.flatMap((f) => f.cargoIds);
      expect(new Set(todos).size).toBe(todos.length);
      expect(todos).toHaveLength(4);
    }
  });

  it('sin alumnos o sin conceptos, no hay nada que hacer', () => {
    expect(planearFacturasPorLote([cargo(1)], opciones({ alumnos: [] })).facturas).toHaveLength(0);
    expect(planearFacturasPorLote([cargo(1)], opciones({ conceptoIds: [] })).facturas).toHaveLength(0);
  });

  it('el plan lleva el vencimiento de cada línea: de ahí sale el plazo de la factura', () => {
    const plan = planearFacturasPorLote([cargo(1, { fechaVencimiento: '2026-10-20' })], opciones({ alumnos: [ana] }));
    expect(plan.facturas[0].lineas[0].fechaVencimiento).toBe('2026-10-20');
  });
});

describe('leerPeticionLote', () => {
  const hoy = '2026-10-22';
  const buena = { estudianteIds: [1, 2], conceptoIds: [3] };

  it('lo mínimo: sin fecha corta en hoy, por alumno y en vista previa', () => {
    const r = leerPeticionLote(buena, hoy);
    expect(r).toEqual({
      ok: true,
      datos: {
        periodoId: null, estudianteIds: [1, 2], conceptoIds: [3],
        hasta: hoy, meses: null, conPagosUnicos: false, juntarHermanos: false, confirmar: false,
      },
    });
  });

  it('los meses son AAAA-MM, sin repetir, y ninguno después del corte', () => {
    expect(leerPeticionLote({ ...buena, meses: null }, hoy)).toMatchObject({ ok: true, datos: { meses: null } });
    expect(leerPeticionLote({ ...buena, meses: ['2026-10', '2026-09', '2026-10'] }, hoy))
      .toMatchObject({ ok: true, datos: { meses: ['2026-09', '2026-10'] } });
    expect(leerPeticionLote({ ...buena, meses: ['2026-13'] }, hoy)).toEqual({ ok: false, error: 'Los meses deben venir como AAAA-MM.' });
    expect(leerPeticionLote({ ...buena, meses: [] }, hoy)).toEqual({ ok: false, error: 'Elige al menos un mes.' });
    // Ningún mes pero con los pagos únicos: es facturar solo esos.
    expect(leerPeticionLote({ ...buena, meses: [], conPagosUnicos: true }, hoy))
      .toMatchObject({ ok: true, datos: { meses: [], conPagosUnicos: true } });
    expect(leerPeticionLote({ ...buena, meses: ['2026-12'] }, hoy))
      .toEqual({ ok: false, error: 'Hay un mes elegido después de la fecha de corte.' });
  });

  it('solo `true` de verdad confirma o junta: un texto «true» no', () => {
    const r = leerPeticionLote({ ...buena, confirmar: 'true', juntarHermanos: 1 }, hoy);
    expect(r.ok && r.datos.confirmar).toBe(false);
    expect(r.ok && r.datos.juntarHermanos).toBe(false);
    const s = leerPeticionLote({ ...buena, confirmar: true, juntarHermanos: true }, hoy);
    expect(s.ok && s.datos.confirmar).toBe(true);
    expect(s.ok && s.datos.juntarHermanos).toBe(true);
  });

  it('quita ids repetidos', () => {
    const r = leerPeticionLote({ estudianteIds: [1, 1, 2], conceptoIds: [3, 3] }, hoy);
    expect(r.ok && r.datos.estudianteIds).toEqual([1, 2]);
    expect(r.ok && r.datos.conceptoIds).toEqual([3]);
  });

  it('una lista vacía NO es «todos»: se rechaza', () => {
    expect(leerPeticionLote({ ...buena, estudianteIds: [] }, hoy)).toMatchObject({ ok: false });
    expect(leerPeticionLote({ ...buena, conceptoIds: [] }, hoy)).toMatchObject({ ok: false });
  });

  it('ids que no son enteros positivos se rechazan', () => {
    for (const malo of [null, 'a', [0], [-1], [1.5], ['x'], [null], 'todos']) {
      expect(leerPeticionLote({ ...buena, estudianteIds: malo }, hoy)).toMatchObject({ ok: false });
      expect(leerPeticionLote({ ...buena, conceptoIds: malo }, hoy)).toMatchObject({ ok: false });
    }
  });

  it('un cuerpo que no es un objeto se rechaza sin reventar', () => {
    for (const cuerpo of [null, undefined, 'x', 5, []]) {
      expect(leerPeticionLote(cuerpo, hoy)).toMatchObject({ ok: false });
    }
  });

  it('la fecha de corte tiene que ser un día del calendario', () => {
    expect(leerPeticionLote({ ...buena, hasta: '2026-11-05' }, hoy)).toMatchObject({ ok: true });
    for (const mala of ['2026-02-30', '05/11/2026', 'mañana', 20261105, '2026-13-01']) {
      expect(leerPeticionLote({ ...buena, hasta: mala }, hoy)).toMatchObject({ ok: false });
    }
  });

  it('el año escolar, si viene, es un entero positivo', () => {
    expect(leerPeticionLote({ ...buena, periodoId: 4 }, hoy)).toMatchObject({ ok: true, datos: { periodoId: 4 } });
    expect(leerPeticionLote({ ...buena, periodoId: 'x' }, hoy)).toMatchObject({ ok: false });
    expect(leerPeticionLote({ ...buena, periodoId: -2 }, hoy)).toMatchObject({ ok: false });
  });

  it('tiene tope de alumnos y de conceptos', () => {
    const muchos = Array.from({ length: MAX_ALUMNOS_POR_PETICION + 1 }, (_, i) => i + 1);
    expect(leerPeticionLote({ ...buena, estudianteIds: muchos }, hoy)).toMatchObject({ ok: false });
    const conceptos = Array.from({ length: MAX_CONCEPTOS_POR_PETICION + 1 }, (_, i) => i + 1);
    expect(leerPeticionLote({ ...buena, conceptoIds: conceptos }, hoy)).toMatchObject({ ok: false });
  });
});

describe('las frases y las tandas', () => {
  it('el botón dice cuántas facturas crea y que son borradores', () => {
    expect(textoCrear(1)).toBe('Crear 1 factura en borrador');
    expect(textoCrear(87)).toBe('Crear 87 facturas en borrador');
    expect(facturasEnLetras(0)).toBe('0 facturas');
  });

  it('las tandas parten la lista sin perder ni repetir nada', () => {
    const lista = Array.from({ length: 60 }, (_, i) => i);
    const tandas = dividirEnTandas(lista);
    expect(tandas.map((t) => t.length)).toEqual([FACTURAS_POR_TANDA, FACTURAS_POR_TANDA, 10]);
    expect(tandas.flat()).toEqual(lista);
    expect(dividirEnTandas([])).toEqual([]);
    expect(dividirEnTandas([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('una línea se rotula con su mes, o solo con el año si no tiene', () => {
    expect(periodoDeLinea(9, 2026)).toBe('septiembre 2026');
    expect(periodoDeLinea(null, 2026)).toBe('2026');
  });
});

/**
 * Los filtros del paso 1. Si se equivocan, «seleccionar todos los filtrados»
 * marca a quien no se veía — y de ahí sale una factura que nadie pidió.
 */
describe('elegir alumnos: filtros y casillas', () => {
  const cat = (id: number, nombre: string, extra: Partial<AlumnoCatalogo> = {}): AlumnoCatalogo => ({
    estudianteId: id, nombre, codigo: null,
    servicioId: 1, servicio: 'Primaria · Matutina',
    gradoId: 10, grado: 'Primero', cursoId: 100, seccion: 'A',
    responsableId: 5, responsable: 'Rosa Gómez',
    sinFactura: 2, sinFacturaCentavos: 1000000,
    ...extra,
  });
  const todos = [
    cat(1, 'José Pérez', { codigo: 'A-001' }),
    cat(2, 'Ana Díaz', { cursoId: 101, seccion: 'B', responsable: 'Pedro Díaz' }),
    cat(3, 'Eva Ruiz', { gradoId: 11, grado: 'Segundo', cursoId: 110, seccion: 'A', sinFactura: 0, sinFacturaCentavos: 0 }),
  ];

  it('sin filtros se ven todos', () => {
    expect(filtrarAlumnos(todos, SIN_FILTRO)).toHaveLength(3);
  });

  it('por grado y por sección', () => {
    expect(filtrarAlumnos(todos, { ...SIN_FILTRO, gradoId: 10 }).map((a) => a.estudianteId)).toEqual([1, 2]);
    expect(filtrarAlumnos(todos, { ...SIN_FILTRO, gradoId: 10, cursoId: 101 }).map((a) => a.estudianteId)).toEqual([2]);
  });

  it('la búsqueda ignora tildes y mayúsculas, y mira nombre, código y responsable', () => {
    const ver = (texto: string) => filtrarAlumnos(todos, { ...SIN_FILTRO, texto }).map((a) => a.estudianteId);
    expect(ver('jose')).toEqual([1]);
    expect(ver('DIAZ')).toEqual([2]);     // por nombre y por responsable
    expect(ver('a-001')).toEqual([1]);    // por código
    expect(ver('gomez')).toEqual([1, 3]);  // por responsable (Rosa Gómez)
    expect(ver('nadie')).toEqual([]);
  });

  it('«solo con pendientes» esconde a los que no tienen nada sin factura', () => {
    expect(filtrarAlumnos(todos, { ...SIN_FILTRO, soloConPendientes: true }).map((a) => a.estudianteId)).toEqual([1, 2]);
  });

  it('los filtros se suman', () => {
    expect(filtrarAlumnos(todos, { gradoId: 10, cursoId: null, texto: 'ana', soloConPendientes: true })).toHaveLength(1);
  });

  it('las opciones de grado salen de los alumnos, sin repetir, y sin servicio si hay uno solo', () => {
    expect(opcionesDeGrado(todos)).toEqual([
      { id: 10, etiqueta: 'Primero' },
      { id: 11, etiqueta: 'Segundo' },
    ]);
  });

  it('con más de un servicio, el grado dice cuál (Primero de Primaria ≠ Primero de Secundaria)', () => {
    const dos = [...todos, cat(4, 'Luz Mena', { servicioId: 2, servicio: 'Secundaria', gradoId: 20, grado: 'Primero', cursoId: 200 })];
    expect(opcionesDeGrado(dos).map((o) => o.etiqueta)).toEqual([
      'Primero · Primaria · Matutina',
      'Primero · Secundaria',
      'Segundo · Primaria · Matutina',
    ]);
  });

  it('las secciones son las del grado elegido; sin grado, ninguna', () => {
    expect(opcionesDeSeccion(todos, null)).toEqual([]);
    expect(opcionesDeSeccion(todos, 10)).toEqual([{ id: 100, etiqueta: 'A' }, { id: 101, etiqueta: 'B' }]);
  });

  it('marcar y desmarcar varios no toca a los demás y no muta el original', () => {
    const antes = new Set([9]);
    const marcados = marcarVarios(antes, [1, 2], true);
    expect([...marcados].sort()).toEqual([1, 2, 9]);
    expect([...antes]).toEqual([9]);
    expect([...marcarVarios(marcados, [1], false)].sort()).toEqual([2, 9]);
  });

  it('la casilla de «todos los filtrados» mira solo lo que se ve', () => {
    const vistos = [{ estudianteId: 1 }, { estudianteId: 2 }];
    expect(estadoDeLaCasilla(vistos, new Set())).toBe('ninguno');
    expect(estadoDeLaCasilla(vistos, new Set([1]))).toBe('algunos');
    expect(estadoDeLaCasilla(vistos, new Set([1, 2, 99]))).toBe('todos');
    expect(estadoDeLaCasilla([], new Set([1]))).toBe('ninguno');
  });
});

describe('agruparOmitidos', () => {
  it('junta por motivo, con lo urgente primero, y no inventa grupos vacíos', () => {
    const plan = planearFacturasPorLote(
      [cargo(1, { ecfDocumentId: 3 }), cargo(4)],
      opciones({ alumnos: [ana, luis, alumno(4, 'Zoe Sola', null, null)] }),
    );
    const grupos = agruparOmitidos(plan.omitidos);

    expect(grupos.map((g) => [g.motivo, g.alumnos.length])).toEqual([
      ['sin-responsable', 1],
      ['ya-facturado', 1],
      ['sin-cargos', 1],
    ]);
    expect(agruparOmitidos([])).toEqual([]);
  });
});

/**
 * El envío de tanda en tanda. Es lo que impide que 80 facturas dependan de una
 * sola petición, y lo que decide qué se le dice a la secretaria cuando una se
 * pierde a la mitad.
 */
describe('crearPorTandas', () => {
  const planDe = (n: number, hermanos = false): FacturaPlan[] => {
    const alumnos = Array.from({ length: n }, (_, i) => alumno(i + 1, `Alumno ${i + 1}`, 100 + (hermanos ? Math.floor(i / 2) : i)));
    return planearFacturasPorLote(
      alumnos.map((a) => cargo(a.id)),
      opciones({ alumnos, juntarHermanos: hermanos }),
    ).facturas;
  };
  const creadaDe = (f: FacturaPlan): FacturaCreada => ({
    clave: f.clave, documentoId: f.cargoIds[0], codigo: `FA-${f.cargoIds[0]}`, montoCentavos: f.totalCentavos,
    estudiantes: f.estudiantes, responsable: f.responsable, cargos: f.cargoIds.length,
  });
  /** Un servidor que crea todo lo que se le pide. */
  const servidorBueno = (facturas: FacturaPlan[]) => async (ids: number[]): Promise<EnvioTanda> => ({
    ok: true,
    creadas: facturas.filter((f) => f.estudiantes.every((e) => ids.includes(e.id))).map(creadaDe),
    fallidas: [],
  });

  it('60 facturas salen en 3 peticiones (25 + 25 + 10), cada una con SUS alumnos', async () => {
    const facturas = planDe(60);
    const pedidos: number[][] = [];
    const r = await crearPorTandas({
      facturas, debeDetenerse: () => false,
      enviar: async (ids) => { pedidos.push(ids); return servidorBueno(facturas)(ids); },
    });

    expect(pedidos.map((p) => p.length)).toEqual([25, 25, 10]);
    expect(pedidos.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(r.creadas).toHaveLength(60);
    expect(r.procesadas).toBe(60);
    expect(r.interrumpido).toBeNull();
  });

  it('juntando hermanos, los dos de una factura viajan en la MISMA tanda', async () => {
    const facturas = planDe(6, true); // 3 familias de 2 hijos
    const pedidos: number[][] = [];
    await crearPorTandas({
      facturas, tanda: 2, debeDetenerse: () => false,
      enviar: async (ids) => { pedidos.push(ids); return servidorBueno(facturas)(ids); },
    });

    expect(pedidos).toEqual([[1, 2, 3, 4], [5, 6]]);
  });

  it('avisa del avance: 0, y luego tras cada tanda', async () => {
    const facturas = planDe(7);
    const avances: [number, number][] = [];
    await crearPorTandas({
      facturas, tanda: 3, debeDetenerse: () => false, alAvanzar: (h, t) => avances.push([h, t]),
      enviar: servidorBueno(facturas),
    });
    expect(avances).toEqual([[0, 7], [3, 7], [6, 7], [7, 7]]);
  });

  it('si una tanda se pierde, se para ahí y se conserva lo ya creado', async () => {
    const facturas = planDe(6);
    let llamada = 0;
    const r = await crearPorTandas({
      facturas, tanda: 2, debeDetenerse: () => false,
      enviar: async (ids) => {
        llamada += 1;
        return llamada === 2 ? { ok: false, error: 'Servidor caído' } : servidorBueno(facturas)(ids);
      },
    });

    expect(llamada).toBe(2);               // no insiste con la tercera
    expect(r.creadas).toHaveLength(2);     // la primera tanda se conserva
    expect(r.procesadas).toBe(2);
    expect(r.interrumpido).toBe('Servidor caído');
  });

  it('una petición que revienta (sin red) se trata como tanda perdida, no como un error sin atrapar', async () => {
    const r = await crearPorTandas({
      facturas: planDe(3), debeDetenerse: () => false,
      enviar: async () => { throw new Error('fetch failed'); },
    });

    expect(r.creadas).toEqual([]);
    expect(r.procesadas).toBe(0);
    expect(r.interrumpido).toContain('no se duplica');
  });

  it('«Detener» para entre tandas, nunca a mitad de una, y dice cuántas faltan', async () => {
    const facturas = planDe(8);
    let llamadas = 0;
    const r = await crearPorTandas({
      facturas, tanda: 3,
      debeDetenerse: () => llamadas >= 1,
      enviar: async (ids) => { llamadas += 1; return servidorBueno(facturas)(ids); },
    });

    expect(llamadas).toBe(1);
    expect(r.creadas).toHaveLength(3);
    expect(r.interrumpido).toContain('faltan 5 facturas');
  });

  it('acumula también lo que falló, tanda tras tanda', async () => {
    const facturas = planDe(4);
    const fallida = { clave: 'e:2', estudiantes: [], responsable: null, motivo: 'error', detalle: 'x', yaFacturados: true };
    const r = await crearPorTandas({
      facturas, tanda: 2, debeDetenerse: () => false,
      enviar: async (ids): Promise<EnvioTanda> => ({ ok: true, creadas: [], fallidas: ids.includes(2) ? [fallida] : [] }),
    });

    expect(r.fallidas).toEqual([fallida]);
    expect(r.interrumpido).toBeNull();
  });

  it('sin facturas no manda nada', async () => {
    let llamadas = 0;
    const r = await crearPorTandas({
      facturas: [], debeDetenerse: () => false,
      enviar: async () => { llamadas += 1; return { ok: true, creadas: [], fallidas: [] }; },
    });
    expect(llamadas).toBe(0);
    expect(r).toEqual({ creadas: [], fallidas: [], procesadas: 0, interrumpido: null });
  });
});
