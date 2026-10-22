import { describe, expect, it } from 'vitest';
import {
  claveAviso,
  clasificarLinea,
  hayMontoQueContar,
  inicioDiaRD,
  lineasDeLaCorrida,
  llaveDeEnvio,
  modoDeCorrida,
  objetivosDeAviso,
  resumirCorrida,
  sinRepetidos,
  yaSeEnvio,
  type CargoCorrida,
  type ContextoColegio,
  type LineaCorrida,
  type MatriculaCorrida,
} from '@/lib/administracion-escolar/corrida-avisos';
import { fechaRD } from '@/lib/utils/format';

/**
 * El simulacro de la corrida tiene que decir lo mismo que la corrida.
 *
 * El error caro no es un correo feo: es uno que promete «57 facturas» y a las
 * 3:00 a. m. salen 50, o que callaba que 7 alumnos no tienen a quién facturarle.
 * Estas pruebas fijan las reglas copiadas de `devengarPeriodo`, `armarPlanDeCobro`
 * y `facturarCuotasEmitidas`; si una cambia allá, rompe aquí.
 */

// ─── Las fechas de los tres avisos ───────────────────────────────────────────

describe('objetivosDeAviso', () => {
  it('mira hoy+5, hoy+2 y hoy', () => {
    expect(objetivosDeAviso('2026-10-21')).toEqual([
      { tipo: 'aviso-5', fecha: '2026-10-26' },
      { tipo: 'aviso-2', fecha: '2026-10-23' },
      { tipo: 'resultado', fecha: '2026-10-21' },
    ]);
  });

  it('cruza el fin de mes y el fin de año sin romperse', () => {
    expect(objetivosDeAviso('2026-10-28').map((o) => o.fecha)).toEqual(['2026-11-02', '2026-10-30', '2026-10-28']);
    expect(objetivosDeAviso('2026-12-29').map((o) => o.fecha)).toEqual(['2027-01-03', '2026-12-31', '2026-12-29']);
  });

  it('respeta febrero bisiesto', () => {
    expect(objetivosDeAviso('2028-02-26').map((o) => o.fecha)).toEqual(['2028-03-02', '2028-02-28', '2028-02-26']);
  });

  it('usa el día de la República Dominicana, no el de UTC', () => {
    // 22:00 RD del 21 es la 02:00 UTC del 22: «hoy» sigue siendo 21.
    const noche = new Date('2026-10-22T02:00:00Z');
    expect(noche.toISOString().slice(0, 10)).toBe('2026-10-22');
    expect(objetivosDeAviso(fechaRD(noche)).map((o) => o.fecha)).toEqual(['2026-10-26', '2026-10-23', '2026-10-21']);

    // A las 8:00 a. m. RD (12:00 UTC), la hora del cron, los dos días coinciden.
    const cron = new Date('2026-10-21T12:00:00Z');
    expect(fechaRD(cron)).toBe('2026-10-21');
  });
});

describe('inicioDiaRD', () => {
  it('el día RD arranca a las 04:00 UTC', () => {
    expect(inicioDiaRD('2026-10-21').toISOString()).toBe('2026-10-21T04:00:00.000Z');
  });
});

describe('modoDeCorrida', () => {
  it('automático desde la línea de corte en adelante', () => {
    expect(modoDeCorrida('2026-09-01', '2026-10-25')).toBe('automatico');
    expect(modoDeCorrida('2026-10-25', '2026-10-25')).toBe('automatico');
  });

  it('manual si no la encendió o si la emisión es anterior a la línea de corte', () => {
    expect(modoDeCorrida(null, '2026-10-25')).toBe('manual');
    expect(modoDeCorrida(undefined, '2026-10-25')).toBe('manual');
    expect(modoDeCorrida('2026-11-01', '2026-10-25')).toBe('manual');
  });
});

// ─── Idempotencia ────────────────────────────────────────────────────────────

describe('la llave de idempotencia', () => {
  it('lleva el tipo y la fecha de EMISIÓN, no la de envío', () => {
    expect(claveAviso('aviso-5', '2026-10-30')).toBe('aviso-5:2026-10-30');
    expect(claveAviso('aviso-2', '2026-10-30')).toBe('aviso-2:2026-10-30');
    expect(claveAviso('resultado', '2026-10-30')).toBe('resultado:2026-10-30');
  });

  it('cada aviso del mismo colegio y fecha tiene su propia llave', () => {
    const claves = new Set(['aviso-5', 'aviso-2', 'resultado'].map((t) => claveAviso(t as never, '2026-10-30')));
    expect(claves.size).toBe(3);
  });

  it('un envío anotado a una persona no tapa a las demás', () => {
    const enviados = new Set([llaveDeEnvio(1, 'aviso-5:2026-10-30', 7)]);
    expect(yaSeEnvio(enviados, 1, 'aviso-5:2026-10-30', 7)).toBe(true);
    expect(yaSeEnvio(enviados, 1, 'aviso-5:2026-10-30', 8)).toBe(false);
    expect(yaSeEnvio(enviados, 2, 'aviso-5:2026-10-30', 7)).toBe(false);
    expect(yaSeEnvio(enviados, 1, 'aviso-2:2026-10-30', 7)).toBe(false);
  });

  it('una fila sin usuario cuenta como enviado a todo el colegio', () => {
    const enviados = new Set([llaveDeEnvio(1, 'resultado:2026-10-30', null)]);
    expect(yaSeEnvio(enviados, 1, 'resultado:2026-10-30', 7)).toBe(true);
    expect(yaSeEnvio(enviados, 1, 'resultado:2026-10-30', 99)).toBe(true);
  });
});

describe('sinRepetidos', () => {
  it('un correo, una vez, sin importar mayúsculas ni espacios', () => {
    expect(sinRepetidos([
      { userId: 1, email: 'Dueno@Colegio.do' },
      { userId: 2, email: ' dueno@colegio.do ' },
      { userId: 3, email: 'secretaria@colegio.do' },
    ])).toEqual([
      { userId: 1, email: 'Dueno@Colegio.do' },
      { userId: 3, email: 'secretaria@colegio.do' },
    ]);
  });

  it('descarta las filas sin correo', () => {
    expect(sinRepetidos([{ userId: 1, email: '' }, { userId: 2, email: '  ' }])).toEqual([]);
  });
});

// ─── El simulacro ────────────────────────────────────────────────────────────

const FECHA = '2026-10-25';

/**
 * Un colegio de juguete: dos conceptos con calendario y una sola tarifa por
 * servicio. La colegiatura (mensualidad) cobra la tarifa ENTERA en cada cuota;
 * la evaluación (actividad) toma la tarifa como el total del año y la reparte.
 */
function colegio(over: Partial<ContextoColegio> = {}): ContextoColegio {
  return {
    teamId: 1,
    periodoId: 10,
    conceptos: [
      { id: 1, nombre: 'Colegiatura', tipo: 'mensualidad', admiteBeca: true, productId: null, activo: true },
      { id: 2, nombre: 'Evaluación', tipo: 'actividad', admiteBeca: false, productId: null, activo: true },
    ],
    cuotas: [
      { id: 100, conceptoId: 1, numero: 1, mes: 9, fechaEmision: '2026-09-25', porcentajeMilesimas: 33_334 },
      { id: 101, conceptoId: 1, numero: 2, mes: 10, fechaEmision: FECHA, porcentajeMilesimas: 33_333 },
      { id: 102, conceptoId: 1, numero: 3, mes: 11, fechaEmision: '2026-11-25', porcentajeMilesimas: 33_333 },
      { id: 201, conceptoId: 2, numero: 1, mes: 10, fechaEmision: FECHA, porcentajeMilesimas: 50_000 },
      { id: 202, conceptoId: 2, numero: 2, mes: 12, fechaEmision: '2026-12-15', porcentajeMilesimas: 50_000 },
    ],
    precios: [
      { conceptoId: 1, objetivoTipo: 'servicio', objetivoId: 7, montoCentavos: 500_000, productId: 900 },
      { conceptoId: 2, objetivoTipo: 'servicio', objetivoId: 7, montoCentavos: 300_000, productId: null },
    ],
    matriculas: [matricula(1, 1, 50), matricula(2, 2, 50)],
    cargos: [],
    ...over,
  };
}

function matricula(id: number, estudianteId: number, clienteId: number | null, over: Partial<MatriculaCorrida> = {}): MatriculaCorrida {
  return {
    id, estudianteId, clienteId,
    cursoId: 3, gradoId: 5, servicioId: 7,
    estado: 'activa',
    fechaInscripcion: '2026-08-15',
    becaTipo: null, becaValor: null,
    conceptosIds: [1, 2],
    conceptoMensualidadId: 1,
    conPlanActivo: false,
    ...over,
  };
}

function cargo(over: Partial<CargoCorrida>): CargoCorrida {
  return {
    id: 1, matriculaId: 1, conceptoId: 1, cuotaId: 101, mes: 10, anio: 2026,
    montoCentavos: 500_000, saldoCentavos: 500_000, estado: 'pendiente', ecfDocumentId: null,
    cuotaFechaEmision: FECHA, cuotaPorcentajeMilesimas: 33_333,
    ...over,
  };
}

const opciones = { tipo: 'aviso-5', modo: 'automatico', conPlanes: false } as const;

describe('lineasDeLaCorrida — lo que el devengo todavía va a crear', () => {
  it('estima una línea por matrícula activa y cuota que se emite ese día', () => {
    const { lineas, sinTarifa } = lineasDeLaCorrida(colegio(), FECHA);
    expect(sinTarifa).toEqual([]);
    expect(lineas).toHaveLength(4); // 2 matrículas × (colegiatura + evaluación)
    expect(lineas.every((l) => l.origen === 'estimado' && l.cargoId === null)).toBe(true);
  });

  it('la mensualidad cobra la tarifa entera y lo demás reparte el total entre las cuotas', () => {
    const { lineas } = lineasDeLaCorrida(colegio(), FECHA);
    const m1 = lineas.filter((l) => l.matriculaId === 1);
    expect(m1.find((l) => l.conceptoId === 1)?.montoCentavos).toBe(500_000);
    // 300,000 repartidos 50/50 entre dos cuotas.
    expect(m1.find((l) => l.conceptoId === 2)?.montoCentavos).toBe(150_000);
  });

  it('no hay nada que contar si ese día no se emite ninguna cuota', () => {
    expect(lineasDeLaCorrida(colegio(), '2026-10-26')).toEqual({ lineas: [], sinTarifa: [] });
  });

  it('la beca por porcentaje rebaja solo lo que admite beca', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { becaTipo: 'porcentaje', becaValor: 50 })] });
    const { lineas } = lineasDeLaCorrida(ctx, FECHA);
    expect(lineas.find((l) => l.conceptoId === 1)?.montoCentavos).toBe(250_000);
    expect(lineas.find((l) => l.conceptoId === 2)?.montoCentavos).toBe(150_000);
  });

  it('la beca total deja la línea en cero', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { becaTipo: 'porcentaje', becaValor: 100 })] });
    const { lineas } = lineasDeLaCorrida(ctx, FECHA);
    expect(lineas.find((l) => l.conceptoId === 1)?.montoCentavos).toBe(0);
  });

  it('no estima lo que el alumno no eligió al matricular', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })] });
    const { lineas } = lineasDeLaCorrida(ctx, FECHA);
    expect(lineas.map((l) => l.conceptoId)).toEqual([1]);
  });

  it('no estima la cuota que salió antes de que el alumno entrara', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { fechaInscripcion: '2026-10-26' })] });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas).toEqual([]);
  });

  it('solo las matrículas activas devengan', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { estado: 'retirada' })] });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas).toEqual([]);
  });

  it('si el cargo de la cuota ya existe, no se estima otro', () => {
    const ctx = colegio({ cargos: [cargo({ id: 5, matriculaId: 1, conceptoId: 1, cuotaId: 101 })] });
    const { lineas } = lineasDeLaCorrida(ctx, FECHA);
    const colegiatura1 = lineas.filter((l) => l.matriculaId === 1 && l.conceptoId === 1);
    expect(colegiatura1).toHaveLength(1);
    expect(colegiatura1[0].origen).toBe('cargo');
    expect(colegiatura1[0].cargoId).toBe(5);
  });

  it('un cargo manual del mismo concepto y mes tampoco se duplica', () => {
    const ctx = colegio({
      cargos: [cargo({ id: 6, matriculaId: 1, conceptoId: 1, cuotaId: null, mes: 10, anio: 2026, cuotaFechaEmision: null, cuotaPorcentajeMilesimas: null })],
    });
    const { lineas } = lineasDeLaCorrida(ctx, FECHA);
    expect(lineas.filter((l) => l.matriculaId === 1 && l.conceptoId === 1)).toEqual([]);
  });

  it('un concepto sin tarifa para la sección no se cobra, y se cuenta', () => {
    const ctx = colegio({ precios: colegio().precios.filter((p) => p.conceptoId === 1) });
    const { lineas, sinTarifa } = lineasDeLaCorrida(ctx, FECHA);
    expect(lineas.every((l) => l.conceptoId === 1)).toBe(true);
    expect(sinTarifa).toEqual([
      { matriculaId: 1, conceptoId: 2 },
      { matriculaId: 2, conceptoId: 2 },
    ]);
  });

  it('el producto de la tarifa manda; el del concepto es el respaldo', () => {
    const base = colegio();
    const { lineas } = lineasDeLaCorrida(base, FECHA);
    expect(lineas.find((l) => l.conceptoId === 1)?.sinProducto).toBe(false); // la tarifa fija 900
    expect(lineas.find((l) => l.conceptoId === 2)?.sinProducto).toBe(true);  // ni tarifa ni concepto

    const conRespaldo = colegio({
      conceptos: base.conceptos.map((c) => (c.id === 2 ? { ...c, productId: 321 } : c)),
    });
    expect(lineasDeLaCorrida(conRespaldo, FECHA).lineas.find((l) => l.conceptoId === 2)?.sinProducto).toBe(false);
  });
});

describe('lineasDeLaCorrida — los cargos que ya existen', () => {
  it('toma el saldo del cargo, no la tarifa', () => {
    const ctx = colegio({
      matriculas: [matricula(1, 1, 50)],
      cargos: [cargo({ id: 5, montoCentavos: 500_000, saldoCentavos: 200_000, estado: 'parcial' })],
    });
    const l = lineasDeLaCorrida(ctx, FECHA).lineas.find((x) => x.cargoId === 5)!;
    expect(l.montoCentavos).toBe(200_000);
  });

  it('un cargo pagado o anulado sin factura no es de la corrida', () => {
    const ctx = colegio({
      matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })],
      cargos: [cargo({ id: 5, estado: 'pagado' })],
    });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas).toEqual([]);
    const anulado = colegio({
      matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })],
      cargos: [cargo({ id: 5, estado: 'anulado' })],
    });
    expect(lineasDeLaCorrida(anulado, FECHA).lineas).toEqual([]);
  });

  it('un cargo de un alumno retirado sí se factura: ya existe', () => {
    const ctx = colegio({
      matriculas: [matricula(1, 1, 50, { estado: 'retirada' })],
      cargos: [cargo({ id: 5 })],
    });
    const { lineas } = lineasDeLaCorrida(ctx, FECHA);
    expect(lineas.map((l) => l.cargoId)).toEqual([5]);
  });

  it('marca la factura que ya tiene', () => {
    const ctx = colegio({
      matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })],
      cargos: [cargo({ id: 5, ecfDocumentId: 777 })],
    });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas[0].ecfDocumentId).toBe(777);
  });
});

describe('lineasDeLaCorrida — contra la cuota anterior', () => {
  const septiembre = (monto: number) => cargo({
    id: 90, cuotaId: 100, mes: 9, montoCentavos: monto, saldoCentavos: monto,
    cuotaFechaEmision: '2026-09-25', cuotaPorcentajeMilesimas: 33_334, estado: 'pagado',
  });

  it('trae el monto de la cuota anterior de la mensualidad', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })], cargos: [septiembre(450_000)] });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas[0].anteriorCentavos).toBe(450_000);
  });

  it('sin cuota anterior no hay con qué comparar', () => {
    const ctx = colegio({ matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })] });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas[0].anteriorCentavos).toBeNull();
  });

  it('un cargo anulado no cuenta como la cuota anterior', () => {
    const ctx = colegio({
      matriculas: [matricula(1, 1, 50, { conceptosIds: [1] })],
      cargos: [{ ...septiembre(450_000), estado: 'anulado' }],
    });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas[0].anteriorCentavos).toBeNull();
  });

  it('fuera de la mensualidad solo se compara con una cuota que pesa lo mismo', () => {
    // Evaluación 70/30: la segunda cuota no debe parecerse a la primera.
    const ctx = colegio({
      cuotas: colegio().cuotas.map((q) => (q.id === 201 ? { ...q, porcentajeMilesimas: 30_000 } : q.id === 202 ? { ...q, porcentajeMilesimas: 70_000 } : q)),
      matriculas: [matricula(1, 1, 50, { conceptosIds: [2] })],
      cargos: [cargo({
        id: 91, conceptoId: 2, cuotaId: 200, montoCentavos: 90_000, saldoCentavos: 90_000,
        cuotaFechaEmision: '2026-09-10', cuotaPorcentajeMilesimas: 70_000, estado: 'pagado',
      })],
    });
    expect(lineasDeLaCorrida(ctx, FECHA).lineas[0].anteriorCentavos).toBeNull();
  });
});

// ─── El resumen ──────────────────────────────────────────────────────────────

function linea(over: Partial<LineaCorrida> = {}): LineaCorrida {
  return {
    matriculaId: 1, estudianteId: 1, clienteId: 50,
    conceptoId: 1, concepto: 'Colegiatura', conceptoTipo: 'mensualidad',
    cuotaId: 101, montoCentavos: 500_000, origen: 'estimado', cargoId: null,
    ecfDocumentId: null, sinProducto: false, anteriorCentavos: null,
    ...over,
  };
}

describe('resumirCorrida', () => {
  it('una factura por responsable de pago: los hermanos caen en la misma', () => {
    const r = resumirCorrida([
      linea({ estudianteId: 1, clienteId: 50 }),
      linea({ estudianteId: 2, clienteId: 50 }),
      linea({ estudianteId: 3, clienteId: 51 }),
    ], 0, opciones);
    expect(r.familias).toBe(2);
    expect(r.lineas).toBe(3);
    expect(r.totalCentavos).toBe(1_500_000);
  });

  it('desglosa por concepto, el de más monto primero', () => {
    const r = resumirCorrida([
      linea({ conceptoId: 1, concepto: 'Colegiatura', montoCentavos: 500_000 }),
      linea({ conceptoId: 1, concepto: 'Colegiatura', montoCentavos: 500_000, clienteId: 51, estudianteId: 2 }),
      linea({ conceptoId: 2, concepto: 'Evaluación', conceptoTipo: 'actividad', montoCentavos: 150_000 }),
    ], 0, opciones);
    expect(r.porConcepto).toEqual([
      { conceptoId: 1, concepto: 'Colegiatura', lineas: 2, totalCentavos: 1_000_000 },
      { conceptoId: 2, concepto: 'Evaluación', lineas: 1, totalCentavos: 150_000 },
    ]);
  });

  it('el alumno sin responsable no genera factura y se cuenta por alumno', () => {
    const r = resumirCorrida([
      linea({ estudianteId: 1, clienteId: 50 }),
      linea({ estudianteId: 9, clienteId: null }),
      linea({ estudianteId: 9, clienteId: null, conceptoId: 2, concepto: 'Evaluación', conceptoTipo: 'actividad' }),
    ], 0, opciones);
    expect(r.familias).toBe(1);
    expect(r.totalCentavos).toBe(500_000);
    expect(r.revisar).toContainEqual({ codigo: 'sin-responsable', cantidad: 1 });
  });

  it('la beca total no se factura pero se avisa', () => {
    const r = resumirCorrida([linea(), linea({ estudianteId: 2, montoCentavos: 0 })], 0, opciones);
    expect(r.familias).toBe(1);
    expect(r.revisar).toContainEqual({ codigo: 'sin-saldo', cantidad: 1 });
  });

  it('con planes recurrentes la colegiatura no sale por calendario, y lo demás sí', () => {
    const r = resumirCorrida([
      linea(),
      linea({ conceptoId: 2, concepto: 'Evaluación', conceptoTipo: 'actividad', montoCentavos: 150_000 }),
    ], 0, { ...opciones, conPlanes: true });
    expect(r.totalCentavos).toBe(150_000);
    expect(r.porConcepto.map((c) => c.concepto)).toEqual(['Evaluación']);
    expect(r.revisar).toContainEqual({ codigo: 'planes', cantidad: 1 });
  });

  it('sin planes no avisa de planes', () => {
    const r = resumirCorrida([linea()], 0, opciones);
    expect(r.revisar.some((p) => p.codigo === 'planes')).toBe(false);
  });

  it('cuenta las líneas sin producto y las cobranzas sin tarifa', () => {
    const r = resumirCorrida([linea({ sinProducto: true }), linea({ estudianteId: 2 })], 2, opciones);
    expect(r.revisar).toContainEqual({ codigo: 'sin-producto', cantidad: 1 });
    expect(r.revisar).toContainEqual({ codigo: 'sin-tarifa', cantidad: 2 });
  });

  it('avisa de los montos distintos al mes anterior, con el salto si es el mismo', () => {
    const r = resumirCorrida([
      linea({ estudianteId: 1, anteriorCentavos: 450_000 }),
      linea({ estudianteId: 2, anteriorCentavos: 450_000 }),
      linea({ estudianteId: 3, anteriorCentavos: 500_000 }), // igual: no cuenta
    ], 0, opciones);
    expect(r.revisar).toContainEqual({
      codigo: 'monto-distinto', cantidad: 2, concepto: 'Colegiatura', de: 450_000, a: 500_000,
    });
  });

  it('una diferencia de centavos por el reparto no llama la atención', () => {
    const r = resumirCorrida([linea({ anteriorCentavos: 499_950 })], 0, opciones);
    expect(r.revisar.some((p) => p.codigo === 'monto-distinto')).toBe(false);
  });

  it('si los saltos son distintos solo dice cuántos', () => {
    const r = resumirCorrida([
      linea({ estudianteId: 1, anteriorCentavos: 450_000 }),
      linea({ estudianteId: 2, anteriorCentavos: 400_000 }),
    ], 0, opciones);
    const p = r.revisar.find((x) => x.codigo === 'monto-distinto')!;
    expect(p.cantidad).toBe(2);
    expect(p.de).toBeUndefined();
  });

  it('los avisos nunca llevan el nombre de un alumno', () => {
    const r = resumirCorrida([linea({ clienteId: null })], 0, opciones);
    expect(JSON.stringify(r)).not.toMatch(/nombres|apellidos/i);
  });
});

describe('resumirCorrida — el resultado del día', () => {
  const hoy = { tipo: 'resultado', modo: 'automatico', conPlanes: false } as const;

  it('separa lo que se facturó hoy de lo que venía facturado de antes', () => {
    const r = resumirCorrida([
      linea({ origen: 'cargo', cargoId: 1, ecfDocumentId: 500 }),
      linea({ origen: 'cargo', cargoId: 2, ecfDocumentId: 500, estudianteId: 2 }), // hermanos: misma factura
      linea({ origen: 'cargo', cargoId: 3, ecfDocumentId: 501, estudianteId: 3, clienteId: 51 }),
      linea({ origen: 'cargo', cargoId: 4, ecfDocumentId: 99, estudianteId: 4, clienteId: 52 }), // de antes
    ], 0, { ...hoy, facturasDeHoy: new Set([500, 501]) });
    expect(r.facturadasHoy).toEqual({ facturas: 2, lineas: 3, totalCentavos: 1_500_000 });
    expect(r.yaFacturadas).toBe(1);
    expect(r.familias).toBe(0);
    expect(r.totalCentavos).toBe(0);
  });

  it('lo que tenía cargo y no se facturó queda como pendiente, y se avisa', () => {
    const r = resumirCorrida([
      linea({ origen: 'cargo', cargoId: 1, ecfDocumentId: 500 }),
      linea({ origen: 'cargo', cargoId: 2, estudianteId: 2, clienteId: 51 }),
    ], 0, { ...hoy, facturasDeHoy: new Set([500]) });
    expect(r.familias).toBe(1);
    expect(r.revisar).toContainEqual({ codigo: 'sin-factura', cantidad: 1 });
  });

  it('en un colegio manual esas mismas familias son lo esperado y no una falla', () => {
    const r = resumirCorrida([linea({ origen: 'cargo', cargoId: 2 })], 0, { ...hoy, modo: 'manual' });
    expect(r.familias).toBe(1);
    expect(r.revisar.some((p) => p.codigo === 'sin-factura')).toBe(false);
  });

  it('un cargo que debió existir hoy y no existe se cuenta aparte, no como factura pendiente', () => {
    const r = resumirCorrida([linea({ origen: 'estimado' })], 0, hoy);
    expect(r.familias).toBe(0);
    expect(r.totalCentavos).toBe(0);
    expect(r.sinCargo).toEqual({ familias: 1, lineas: 1, totalCentavos: 500_000 });
    expect(r.revisar).toContainEqual({ codigo: 'sin-cargo', cantidad: 1 });
  });

  it('y esa falla SÍ vale un correo: es justo el día que el colegio espera su facturación', () => {
    const r = resumirCorrida([linea({ origen: 'estimado' })], 0, hoy);
    expect(hayMontoQueContar(r)).toBe(true);
  });

  it('el mismo estimado, antes de la fecha, es simplemente lo que va a salir', () => {
    const r = resumirCorrida([linea({ origen: 'estimado' })], 0, opciones);
    expect(r.familias).toBe(1);
  });
});

describe('clasificarLinea', () => {
  const o = { tipo: 'aviso-5', modo: 'automatico', conPlanes: false } as const;

  it('sigue el orden de la facturación: planes, luego saldo, luego responsable', () => {
    // Colegiatura de alguien sin responsable y sin saldo en un colegio con planes: manda «planes».
    expect(clasificarLinea(linea({ montoCentavos: 0, clienteId: null }), { ...o, conPlanes: true })).toBe('planes');
    expect(clasificarLinea(linea({ montoCentavos: 0, clienteId: null }), o)).toBe('sin-saldo');
    expect(clasificarLinea(linea({ clienteId: null }), o)).toBe('sin-responsable');
    expect(clasificarLinea(linea(), o)).toBe('facturable');
  });
});

describe('hayMontoQueContar', () => {
  it('una corrida en cero no vale un correo', () => {
    const r = resumirCorrida([linea({ montoCentavos: 0 })], 0, opciones);
    expect(hayMontoQueContar(r)).toBe(false);
  });

  it('cuenta lo que hay por facturar o lo ya facturado hoy', () => {
    expect(hayMontoQueContar(resumirCorrida([linea()], 0, opciones))).toBe(true);
    const hecho = resumirCorrida(
      [linea({ origen: 'cargo', ecfDocumentId: 5 })], 0,
      { tipo: 'resultado', modo: 'automatico', conPlanes: false, facturasDeHoy: new Set([5]) },
    );
    expect(hayMontoQueContar(hecho)).toBe(true);
  });
});
