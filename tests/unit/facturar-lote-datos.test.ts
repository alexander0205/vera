// tests/unit/facturar-lote-datos.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * La capa que lee y entrega: sin base de datos, con las filas que cada consulta
 * devolvería. Lo que se prueba es lo que esta capa DECIDE — de qué día es un
 * cargo sin calendario, qué conceptos se ofrecen, cómo se emparejan las
 * facturas creadas con el plan, qué se le dice al usuario cuando algo falla.
 *
 * El SQL en sí se comprobó imprimiéndolo (sin ejecutarlo): cada consulta va
 * acotada al colegio y, las de cargos, al año escolar.
 */

/** Qué filas devuelve cada consulta, según los campos que pide el `select`. */
let respuesta: (campos: Record<string, unknown>) => unknown[] = () => [];

vi.mock('@/lib/db/drizzle', () => {
  const crear = (campos: Record<string, unknown>) => {
    const cadena: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy', 'limit']) {
      cadena[m] = () => cadena;
    }
    cadena.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(respuesta(campos)).then(res, rej);
    return cadena;
  };
  return { db: { select: (campos: Record<string, unknown>) => crear(campos) } };
});

vi.mock('@/lib/administracion-escolar/facturar-emision', () => ({ facturarGrupos: vi.fn() }));

const datos = await import('@/lib/administracion-escolar/facturar-lote-datos');
const { facturarGrupos } = await import('@/lib/administracion-escolar/facturar-emision');
type Plan = Parameters<typeof datos.crearFacturasDelPlan>[2];

beforeEach(() => {
  respuesta = () => [];
  vi.mocked(facturarGrupos).mockReset();
});

describe('cargarDatosDelLote', () => {
  it('un cargo con calendario se emite el día de su cuota', async () => {
    respuesta = (c) => 'conceptoNombre' in c ? [{
      id: 1, estudianteId: 5, conceptoId: 2, conceptoNombre: 'Colegiatura', mes: 10, anio: 2026,
      estado: 'pendiente', saldoCentavos: 500000, fechaVencimiento: '2026-10-05',
      emisionDeLaCuota: '2026-10-01', creadoEn: new Date('2026-09-15T12:00:00Z'), ecfDocumentId: null,
    }] : [];
    const { cargos } = await datos.cargarDatosDelLote(1, 1, [5], [2]);
    expect(cargos[0].fechaEmision).toBe('2026-10-01');
  });

  /**
   * Un cargo sin calendario (el paseo, la inscripción a mano) se emite el día en
   * que se creó. Y ese día es el de República Dominicana: a las 10:30 p. m. del
   * 22 la hora UTC ya es el 23, y con el corte en «hoy» (22) el cargo de esta
   * noche habría quedado «para mañana».
   */
  it('un cargo sin calendario se emite el día en que se creó, en hora de República Dominicana', async () => {
    respuesta = (c) => 'conceptoNombre' in c ? [{
      id: 2, estudianteId: 5, conceptoId: 3, conceptoNombre: 'Paseo', mes: null, anio: 2026,
      estado: 'pendiente', saldoCentavos: 15000, fechaVencimiento: null,
      emisionDeLaCuota: null, creadoEn: new Date('2026-10-23T02:30:00Z'), ecfDocumentId: null,
    }] : [];
    const { cargos } = await datos.cargarDatosDelLote(1, 1, [5], [3]);
    expect(cargos[0].fechaEmision).toBe('2026-10-22');
    expect(cargos[0].fechaVencimiento).toBeNull();
  });

  it('junta nombre y apellido, y lleva el responsable de cada alumno', async () => {
    respuesta = (c) => 'clienteId' in c ? [
      { id: 5, nombres: 'Ana', apellidos: 'Pérez', clienteId: 40, responsable: 'Rosa Gómez' },
      { id: 6, nombres: 'Luis', apellidos: 'Pérez', clienteId: null, responsable: null },
    ] : [];
    const { alumnos } = await datos.cargarDatosDelLote(1, 1, [5, 6], [2]);
    expect(alumnos).toEqual([
      { id: 5, nombre: 'Ana Pérez', clienteId: 40, responsable: 'Rosa Gómez' },
      { id: 6, nombre: 'Luis Pérez', clienteId: null, responsable: null },
    ]);
  });
});

describe('catalogoDelLote', () => {
  const matricula = (id: number, extra: Record<string, unknown> = {}) => ({
    estudianteId: id, nombres: 'Ana', apellidos: `Pérez ${id}`, codigo: null,
    servicioId: 1, servicio: 'Primaria', tanda: 'Matutina',
    gradoId: 10, grado: 'Primero', cursoId: 100, seccion: 'A',
    responsableId: 40, responsable: 'Rosa Gómez', ...extra,
  });

  it('cada alumno trae cuánto tiene sin factura, y solo se ofrecen los conceptos con algo pendiente', async () => {
    respuesta = (c) => {
      if ('nombres' in c) return [matricula(1), matricula(2)];
      if ('n' in c) return [
        { estudianteId: 1, conceptoId: 7, n: 2, centavos: 1000000 },
        { estudianteId: 1, conceptoId: 8, n: 1, centavos: 250000 },
      ];
      if ('tipo' in c) return [
        { id: 8, nombre: 'Uniforme', tipo: 'uniforme' },
        { id: 7, nombre: 'Colegiatura', tipo: 'mensualidad' },
      ];
      return [];
    };
    const r = await datos.catalogoDelLote(1, 1);

    expect(r.alumnos.map((a) => [a.estudianteId, a.sinFactura, a.sinFacturaCentavos])).toEqual([[1, 3, 1250000], [2, 0, 0]]);
    // Por nombre, y con lo que suma cada uno.
    expect(r.conceptos.map((c) => [c.nombre, c.sinFactura, c.sinFacturaCentavos])).toEqual([
      ['Colegiatura', 2, 1000000],
      ['Uniforme', 1, 250000],
    ]);
  });

  it('los pendientes de alguien que no se puede marcar (un retirado) no inflan los conceptos', async () => {
    respuesta = (c) => {
      if ('nombres' in c) return [matricula(1)];
      if ('n' in c) return [
        { estudianteId: 1, conceptoId: 7, n: 2, centavos: 1000000 },
        { estudianteId: 99, conceptoId: 7, n: 5, centavos: 9000000 },
      ];
      if ('tipo' in c) return [{ id: 7, nombre: 'Colegiatura', tipo: 'mensualidad' }];
      return [];
    };
    const r = await datos.catalogoDelLote(1, 1);

    expect(r.alumnos).toHaveLength(1);
    expect(r.conceptos[0]).toMatchObject({ sinFactura: 2, sinFacturaCentavos: 1000000 });
  });

  it('el servicio lleva su tanda, y un alumno con dos filas de matrícula sale una vez', async () => {
    respuesta = (c) => 'nombres' in c ? [matricula(1), matricula(1)] : [];
    const r = await datos.catalogoDelLote(1, 1);

    expect(r.alumnos).toHaveLength(1);
    expect(r.alumnos[0].servicio).toBe('Primaria · Matutina');
    expect(r.alumnos[0].nombre).toBe('Ana Pérez 1');
  });

  it('sin nada pendiente no hay conceptos que ofrecer (ni consulta de conceptos)', async () => {
    let pidioConceptos = false;
    respuesta = (c) => {
      if ('tipo' in c) pidioConceptos = true;
      return 'nombres' in c ? [matricula(1)] : [];
    };
    const r = await datos.catalogoDelLote(1, 1);

    expect(r.conceptos).toEqual([]);
    expect(pidioConceptos).toBe(false);
  });

  it('un alumno sin curso ni responsable no rompe nada', async () => {
    respuesta = (c) => 'nombres' in c ? [matricula(3, {
      servicioId: null, servicio: null, tanda: null, gradoId: null, grado: null,
      cursoId: null, seccion: null, responsableId: null, responsable: null,
    })] : [];
    const [a] = (await datos.catalogoDelLote(1, 1)).alumnos;
    expect(a).toMatchObject({ servicio: null, grado: null, seccion: null, responsableId: null });
  });
});

describe('crearFacturasDelPlan', () => {
  const linea = (cargoId: number, estudianteId: number, venc: string | null = '2026-10-05') => ({
    cargoId, estudianteId, estudiante: `Alumno ${estudianteId}`, concepto: 'Colegiatura',
    mes: 10, anio: 2026, saldoCentavos: 100000, fechaVencimiento: venc,
  });
  const factura = (clave: string, clienteId: number, lineas: ReturnType<typeof linea>[]): Plan[number] => ({
    clave, clienteId, responsable: `Familia ${clienteId}`,
    estudiantes: [...new Set(lineas.map((l) => l.estudianteId))].map((id) => ({ id, nombre: `Alumno ${id}` })),
    lineas, cargoIds: lineas.map((l) => l.cargoId), totalCentavos: lineas.length * 100000,
  });

  it('entrega los grupos tal cual los armó el plan, a nombre de quien lo pidió', async () => {
    vi.mocked(facturarGrupos).mockResolvedValue({ facturas: [], diagnostico: [] });
    await datos.crearFacturasDelPlan(9, 77, [
      factura('e:1', 40, [linea(10, 1), linea(11, 1, '2026-10-20')]),
      factura('e:2', 40, [linea(12, 2, null)]),
    ]);

    expect(facturarGrupos).toHaveBeenCalledWith(
      9,
      [
        { clienteId: 40, cargos: [
          { id: 10, saldoCentavos: 100000, fechaVencimiento: '2026-10-05' },
          { id: 11, saldoCentavos: 100000, fechaVencimiento: '2026-10-20' },
        ] },
        { clienteId: 40, cargos: [{ id: 12, saldoCentavos: 100000, fechaVencimiento: null }] },
      ],
      { userId: 77 },
    );
  });

  it('empareja cada factura creada con su fila del plan', async () => {
    vi.mocked(facturarGrupos).mockResolvedValue({
      facturas: [
        { documentoId: 900, codigo: 'FA-1', clienteId: 40, cargoIds: [12], montoCentavos: 118000 },
        { documentoId: 901, codigo: 'FA-2', clienteId: 41, cargoIds: [10, 11], montoCentavos: 200000 },
      ],
      diagnostico: [],
    });
    const r = await datos.crearFacturasDelPlan(9, 77, [
      factura('e:1', 41, [linea(10, 1), linea(11, 1)]),
      factura('e:2', 40, [linea(12, 2)]),
    ]);

    expect(r.creadas).toEqual([
      { clave: 'e:2', documentoId: 900, codigo: 'FA-1', montoCentavos: 118000, estudiantes: [{ id: 2, nombre: 'Alumno 2' }], responsable: 'Familia 40', cargos: 1 },
      { clave: 'e:1', documentoId: 901, codigo: 'FA-2', montoCentavos: 200000, estudiantes: [{ id: 1, nombre: 'Alumno 1' }], responsable: 'Familia 41', cargos: 2 },
    ]);
    expect(r.fallidas).toEqual([]);
  });

  it('perder la carrera contra otra corrida se cuenta como «ya facturado», no como un fallo', async () => {
    vi.mocked(facturarGrupos).mockResolvedValue({
      facturas: [],
      diagnostico: [{ motivo: 'error', detalle: 'Se iban a facturar 1 cargo(s) y solo 0 seguían sin factura', cargoIds: [10], yaFacturados: true }],
    });
    const r = await datos.crearFacturasDelPlan(9, 77, [factura('e:1', 40, [linea(10, 1)])]);

    expect(r.fallidas[0]).toMatchObject({ clave: 'e:1', yaFacturados: true });
    expect(r.fallidas[0].detalle).toContain('No se creó nada duplicado');
  });

  it('un rechazo en español de la ficha se muestra tal cual', async () => {
    vi.mocked(facturarGrupos).mockResolvedValue({
      facturas: [],
      diagnostico: [{ motivo: 'prefill-rechazado', detalle: 'Ningún tutor del alumno está vinculado a un contacto.', cargoIds: [10] }],
    });
    const r = await datos.crearFacturasDelPlan(9, 77, [factura('e:1', 40, [linea(10, 1)])]);

    expect(r.fallidas[0].detalle).toBe('Ningún tutor del alumno está vinculado a un contacto.');
    expect(r.fallidas[0].yaFacturados).toBe(false);
  });

  it('un error de la base NO llega al usuario con su texto: se dice en palabras de la oficina y queda en el log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(facturarGrupos).mockResolvedValue({
      facturas: [],
      diagnostico: [{ motivo: 'error', detalle: 'insert into "ecf_documents" … violates foreign key', cargoIds: [10] }],
    });
    const r = await datos.crearFacturasDelPlan(9, 77, [factura('e:1', 40, [linea(10, 1)])]);

    expect(r.fallidas[0].detalle).not.toContain('ecf_documents');
    expect(r.fallidas[0].detalle).toContain('No se pudo crear esta factura');
    expect(log).toHaveBeenCalledWith('[facturar-lote] factura no creada', expect.objectContaining({ detalle: expect.stringContaining('ecf_documents') }));
    log.mockRestore();
  });
});
