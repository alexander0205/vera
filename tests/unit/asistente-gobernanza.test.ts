import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gobernanza por el chat: las acciones del colegio pasan por proponer →
 * confirmar y, al confirmar, llaman a las MISMAS rutas que la pantalla.
 * Sin base de datos ni modelo: la API es `apiFalsa`.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/drizzle', () => ({ db: {} }));
const usos = vi.hoisted(() => new Set<string>());
vi.mock('@/lib/rate-limit', () => ({
  rateLimitDb: vi.fn(async (k: string) => {
    if (usos.has(k)) return { allowed: false, remaining: 0, resetAt: new Date() };
    usos.add(k);
    return { allowed: true, remaining: 0, resetAt: new Date() };
  }),
}));

import { apiFalsa, type ParamsApi } from '@/lib/asistente/api';
import { contextoDePrueba } from '@/lib/asistente/contexto';
import { confirmarAccion, limpiarAcciones, proponerAccion } from '@/lib/asistente/acciones';
import { asegurarAccionesEscolares, calendarioDeConcepto } from '@/lib/asistente/acciones-escolar';

const AE = '/api/administracion-escolar';
const PERIODO = { id: 3, nombre: '2026-2027', activo: true, fechaInicio: '2026-08-24', fechaFin: '2027-06-30' };

beforeEach(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-para-tokens';
  usos.clear();
  limpiarAcciones();
  asegurarAccionesEscolares();
});

/** Propone y confirma, como lo haría la persona con el botón. */
async function proponerYConfirmar(ctx: ReturnType<typeof contextoDePrueba>, nombre: string, args: unknown) {
  const p = await proponerAccion(ctx, 5, nombre, args);
  if (!('token' in p)) throw new Error(`No se propuso: ${JSON.stringify(p)}`);
  return { propuesta: p, resultado: await confirmarAccion(ctx, 5, p.token) };
}

describe('calendario de un concepto', () => {
  it('mensual de agosto a mayo: 10 cuotas el día 24 que suman el 100 %', () => {
    const c = calendarioDeConcepto({ nombre: 'Mensualidad', frecuencia: 'mensual', diaEmision: 24, periodo: PERIODO, meses: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] });
    expect(c).toHaveLength(10);
    expect(c[0]).toMatchObject({ mes: 8, fechaEmision: '2026-08-24' });
    expect(c[9]).toMatchObject({ mes: 5, fechaEmision: '2027-05-24' });
    expect(c.reduce((s, x) => s + x.porcentajeMilesimas, 0)).toBe(100_000);
  });

  it('fechas sueltas (brazalete en noviembre y mayo) reemplazan a los meses', () => {
    const c = calendarioDeConcepto({ nombre: 'Brazalete', frecuencia: 'mensual', diaEmision: 1, periodo: PERIODO, fechas: ['2027-05-24', '2026-11-24'] });
    expect(c.map((x) => x.fechaEmision)).toEqual(['2026-11-24', '2027-05-24']);
    expect(c.map((x) => x.etiqueta)).toEqual(['Brazalete — noviembre', 'Brazalete — mayo']);
  });

  it('un pago único sin fecha no lleva calendario: se cobra al matricular', () => {
    expect(calendarioDeConcepto({ nombre: 'Avance', frecuencia: 'unico', diaEmision: 1, periodo: PERIODO })).toEqual([]);
  });
});

describe('acciones de Gobernanza', () => {
  it('crear un concepto mensual lo guarda por cuota y le pone su calendario del año', async () => {
    const { api, llamadas } = apiFalsa({
      [`${AE}/periodos`]: { periodos: [PERIODO] },
      [`POST ${AE}/conceptos`]: { concepto: { id: 40 } },
      [`PUT ${AE}/conceptos/40/cuotas`]: { ok: true },
    });
    const { propuesta, resultado } = await proponerYConfirmar(contextoDePrueba(1, { api }), 'crear_concepto', {
      nombre: 'Servicio de almuerzo', tipo: 'otro', opcional: true, frecuencia: 'mensual', diaEmision: 24, diasParaPago: 5,
      cobraMora: false, avisoAlEmitir: true, meses: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
    });
    expect(propuesta.resumen).toMatch(/10 cuotas, del 2026-08-24 al 2027-05-24/);
    expect(resultado).toMatchObject({ ok: true });
    const alta = llamadas.find((l) => l.metodo === 'POST' && l.ruta === `${AE}/conceptos`)!.cuerpo as Record<string, unknown>;
    // El almuerzo se escribe por mes: si no, 5,000 se reparten en 10 y sale 500.
    expect(alta).toMatchObject({ opcional: true, precioPorCuota: true, frecuencia: 'mensual', diaEmision: 24, diasParaPago: 5, cobraMora: false, avisosActivos: true, avisoDiaEmision: true });
    const cuotas = llamadas.find((l) => l.metodo === 'PUT')!.cuerpo as { periodoId: number; cuotas: unknown[] };
    expect(cuotas.periodoId).toBe(3);
    expect(cuotas.cuotas).toHaveLength(10);
  });

  it('la primera tarifa de un concepto sin producto lo crea y se lo deja al concepto', async () => {
    const { api, llamadas } = apiFalsa({
      [`${AE}/periodos`]: { periodos: [PERIODO] },
      [`${AE}/conceptos`]: { conceptos: [{ id: 40, nombre: 'Mensualidad', tipo: 'mensualidad', frecuencia: 'mensual', productId: null, opcional: false }] },
      [`${AE}/concepto-precios`]: { servicios: [], grados: [{ id: 7, nombre: 'Primero' }, { id: 8, nombre: 'Segundo' }], secciones: [] },
      [`POST ${AE}/concepto-precios`]: (_p: ParamsApi, cuerpo?: unknown) => ({
        cargosCreados: 0, producto: (cuerpo as { nuevoProducto?: unknown }).nuevoProducto ? { id: 900 } : null,
      }),
      [`PATCH ${AE}/conceptos/40`]: { ok: true },
    });
    const { propuesta, resultado } = await proponerYConfirmar(contextoDePrueba(1, { api }), 'poner_tarifa', {
      conceptoId: 40, aplicaA: 'grado', objetivoIds: [7, 8], monto: 15000,
    });
    expect(propuesta.resumen).toMatch(/«Mensualidad» a RD\$\s?15,000\.00 por cuota en: Primero, Segundo/);
    expect(resultado).toMatchObject({ ok: true });
    const tarifas = llamadas.filter((l) => l.metodo === 'POST' && l.ruta === `${AE}/concepto-precios`).map((l) => l.cuerpo as Record<string, unknown>);
    expect(tarifas[0]).toMatchObject({ objetivoTipo: 'grado', objetivoId: 7, monto: 15000, nuevoProducto: { nombre: 'Mensualidad', precio: 15000 } });
    // La segunda ya usa el producto que creó la primera.
    expect(tarifas[1].nuevoProducto).toBeUndefined();
    expect(llamadas.find((l) => l.metodo === 'PATCH')!.cuerpo).toEqual({ productId: 900 });
  });

  it('matricular con fecha pasada: la tarjeta nombra a quién y dónde, cuenta lo salido hasta hoy y al confirmar lo deja al día', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T15:00:00Z'));
    try {
      const resultados = [
        { estudianteId: 1, nombre: 'Ana Pérez', codigo: null, resultado: 'crear' },
        { estudianteId: 2, nombre: 'Luis Pérez', codigo: null, resultado: 'conflicto' },
      ];
      const lote = vi.fn((_p: ParamsApi, cuerpo?: unknown) => (cuerpo as { dryRun: boolean }).dryRun
        ? { resumen: { total: 2, crear: 1, conflicto: 1, invalido: 0, error: 0 }, cargoTotalCentavos: 2_350_000, cargoCount: 2, resultados }
        : { resumen: { total: 2, crear: 1, conflicto: 1, invalido: 0, error: 0 }, cargoTotalCentavos: 2_350_000, cargoCount: 2, resultados });
      // Avance (una vez, 24-ago) + mensualidad de agosto a mayo: hasta hoy salieron agosto, septiembre y octubre.
      const mensual = ['2026-08-24', '2026-09-24', '2026-10-24', '2026-11-24'].map((f) => ({ omitida: false, fechaEmision: f, montoCentavos: 850_000 }));
      const { api, llamadas } = apiFalsa({
        [`${AE}/periodos`]: { periodos: [PERIODO] },
        [`${AE}/paquetes`]: { paquetes: [{ id: 2, conceptosIds: [40, 41] }] },
        [`${AE}/matriculas/plan-cobro`]: { lineas: [
          { conceptoId: 40, cuotas: [{ omitida: false, fechaEmision: '2026-08-24', montoCentavos: 1_500_000 }] },
          { conceptoId: 41, cuotas: mensual },
        ] },
        [`${AE}/concepto-precios`]: { servicios: [], grados: [{ id: 7, nombre: 'Pre-Kinder' }], secciones: [{ id: 11, nombre: 'A', gradoId: 7 }] },
        [`POST ${AE}/matriculas/lote`]: lote,
        [`POST ${AE}/cargos/devengar`]: { cargosCreados: 2 },
      });
      const ctx = contextoDePrueba(1, { api });
      const p = await proponerAccion(ctx, 5, 'matricular', { cursoId: 11, estudianteIds: [1, 2], paqueteId: 2, fechaInscripcion: '2026-08-24' });
      expect(p).toMatchObject({ resumen: expect.stringMatching(/en Pre-Kinder A con fecha 2026-08-24 a Ana Pérez: 4 cargo\(s\).*40,500\.00.*1 ya tenían matrícula/) });
      expect(llamadas.some((l) => l.ruta === `${AE}/cargos/devengar`)).toBe(false);
      const r = await confirmarAccion(ctx, 5, (p as { token: string }).token);
      // El lote carga lo del 24 de agosto; el devengo, septiembre y octubre.
      expect(r).toMatchObject({ ok: true, mensaje: expect.stringMatching(/Matriculados: 1, con 4 cargo/) });
      expect((lote.mock.calls[1][1] as { dryRun: boolean; conceptos: number[] })).toMatchObject({ dryRun: false, conceptos: [40, 41] });
      expect(llamadas.filter((l) => l.metodo === 'POST' && l.ruta === `${AE}/cargos/devengar`)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('las tarjetas dicen a quién: servicios, baja y facturas por mes', async () => {
    const { api } = apiFalsa({
      [`${AE}/periodos`]: { periodos: [PERIODO] },
      [`${AE}/matriculas/servicios`]: {
        conceptos: [{ id: 66, nombre: 'Mensualidad' }, { id: 67, nombre: 'Almuerzo' }],
        filas: [{ matriculaId: 834, nombre: 'Ana Pérez', conceptosIds: [66, 67] }, { matriculaId: 836, nombre: 'Carla Rodríguez', conceptosIds: [66] }],
      },
      [`${AE}/estudiantes/635`]: { estudiante: { nombres: 'Miguel', apellidos: 'Santos' } },
      [`${AE}/estudiantes/635/estado`]: { cargosPosteriores: [], deudaQueSeQuedaCentavos: 4_350_000 },
      [`POST ${AE}/cargos/facturar-lote`]: { plan: {
        facturas: [{ responsable: 'María Gómez', estudiantes: [{ id: 1, nombre: 'Ana Pérez' }, { id: 2, nombre: 'Luis Pérez' }], totalCentavos: 2_400_000 }],
        omitidos: [], totalCargos: 2, totalCentavos: 2_400_000,
      } },
    });
    const ctx = contextoDePrueba(1, { api });
    const servicios = await proponerAccion(ctx, 5, 'cambiar_servicios', { cambios: [{ matriculaId: 834, quitar: [67] }, { matriculaId: 836, agregar: [67] }] });
    expect(servicios).toMatchObject({ resumen: expect.stringMatching(/Ana Pérez: quitar Almuerzo.*Carla Rodríguez: agregar Almuerzo/) });
    const baja = await proponerAccion(ctx, 5, 'dar_de_baja', { estudianteId: 635, estado: 'retirado', fecha: '2026-10-27' });
    expect(baja).toMatchObject({ resumen: expect.stringMatching(/Dar de baja a Miguel Santos \(retirado\).*43,500\.00/) });
    const facturas = await proponerAccion(ctx, 5, 'facturar_cargos', { estudianteIds: [1, 2], conceptoIds: [66], meses: ['2026-09'] });
    expect(facturas).toMatchObject({ resumen: expect.stringMatching(/de septiembre 2026: María Gómez \(Ana, Luis\)/) });
    // Ya lleva eso: no hay tarjeta.
    expect(await proponerAccion(ctx, 5, 'cambiar_servicios', { cambios: [{ matriculaId: 836, quitar: [67] }] })).toMatchObject({ error: expect.stringMatching(/nada que cambiar/) });
  });

  it('un dato mal puesto le dice al modelo qué campo corregir', async () => {
    const r = await proponerAccion(contextoDePrueba(1, { api: apiFalsa({}).api }), 5, 'crear_ano_escolar', { nombre: '2026-2027', fechaInicio: '24/08/2026', fechaFin: '2027-06-30' });
    expect(r).toMatchObject({ error: expect.stringMatching(/fechaInicio/) });
  });

  it('un tutor con dos hijos en la lista se crea una sola vez', async () => {
    const { api, llamadas } = apiFalsa({
      [`POST /api/clientes`]: { cliente: { id: 70 } },
      [`POST ${AE}/tutores`]: { tutor: { id: 80 } },
      [`POST ${AE}/estudiantes`]: { estudiante: { id: 1 } },
    });
    const tutor = { nombre: 'Mayra Esther', cedula: '00112345678', relacion: 'madre', celular: '8095551234' };
    const { resultado } = await proponerYConfirmar(contextoDePrueba(1, { api }), 'crear_estudiantes', {
      estudiantes: [{ nombres: 'Ana', apellidos: 'Pérez', tutor }, { nombres: 'Luis', apellidos: 'Pérez', tutor }],
    });
    expect(resultado).toMatchObject({ ok: true, mensaje: expect.stringMatching(/Estudiantes creados: 2/) });
    expect(llamadas.filter((l) => l.ruta === '/api/clientes')).toHaveLength(1);
    expect(llamadas.filter((l) => l.ruta === `${AE}/tutores`)).toHaveLength(1);
    const altas = llamadas.filter((l) => l.ruta === `${AE}/estudiantes`).map((l) => l.cuerpo as Record<string, unknown>);
    expect(altas[1]).toMatchObject({ facturarAClientId: 70, tutores: [{ tutorId: 80, relacion: 'madre', responsablePago: true }] });
  });

  it('si la API se niega al confirmar, la persona lee el motivo de Zero', async () => {
    const { api } = apiFalsa({
      [`${AE}/periodos`]: { periodos: [PERIODO] },
      [`POST ${AE}/periodos`]: () => { throw Object.assign(new Error('Ya hay un año escolar con ese nombre'), { name: 'ErrorApi', status: 409, ruta: '' }); },
    });
    const { resultado } = await proponerYConfirmar(contextoDePrueba(1, { api }), 'crear_ano_escolar', { nombre: '2026-2027', fechaInicio: '2026-08-24', fechaFin: '2027-06-30' });
    expect(resultado).toEqual({ ok: false, error: 'Ya hay un año escolar con ese nombre', status: 400 });
  });

  it('sin año escolar activo no se propone nada que lo necesite', async () => {
    const { api } = apiFalsa({ [`${AE}/periodos`]: { periodos: [] } });
    const p = await proponerAccion(contextoDePrueba(1, { api }), 5, 'crear_concepto', { nombre: 'Mensualidad', tipo: 'mensualidad' });
    expect(p).toMatchObject({ error: expect.stringMatching(/año escolar activo/) });
  });

  it('quien no puede configurar el colegio no recibe las acciones de configuración', async () => {
    const ctx = contextoDePrueba(1, { permisos: ['administracion-escolar:ver', 'administracion-escolar:gestionar'] });
    expect(await proponerAccion(ctx, 5, 'poner_tarifa', { conceptoId: 1, aplicaA: 'grado', objetivoIds: [1], monto: 10 }))
      .toMatchObject({ error: expect.stringMatching(/permiso/) });
  });

  it('el asistente no puede escribir en sus propias rutas, crons ni el panel de plataforma', async () => {
    const { crearClienteApi } = await import('@/lib/asistente/api');
    const api = crearClienteApi({ origen: 'http://localhost', cookie: null });
    for (const ruta of ['/api/asistente/confirmar', '/api/cron/escolar-devengo', '/api/admin/empresas']) {
      await expect(api.enviar('POST', ruta, {})).rejects.toMatchObject({ status: 403 });
    }
  });
});
