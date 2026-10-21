import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  claveAviso,
  llaveDeEnvio,
  type ContextoColegio,
  type MatriculaCorrida,
} from '@/lib/administracion-escolar/corrida-avisos';
import { procesarAvisosCorrida, type DepsCorrida } from '@/lib/administracion-escolar/corrida-proceso';
import type { CorridaCandidata } from '@/lib/administracion-escolar/corrida-datos';

/**
 * El recorrido del cron con dependencias falsas: ni base ni Resend.
 *
 * Lo que tiene que ser verdad pase lo que pase: un aviso no sale dos veces, el
 * interruptor apagado no manda ni anota nada, y un colegio roto no deja sin
 * aviso a los demás.
 */

const HOY = '2026-10-25';
const EN_5 = '2026-10-30';
const EN_2 = '2026-10-27';

function matricula(id: number, clienteId: number | null, over: Partial<MatriculaCorrida> = {}): MatriculaCorrida {
  return {
    id, estudianteId: id, clienteId, cursoId: 3, gradoId: 5, servicioId: 7,
    estado: 'activa', fechaInscripcion: '2026-08-15', becaTipo: null, becaValor: null,
    conceptosIds: [1], conceptoMensualidadId: 1, conPlanActivo: false,
    ...over,
  };
}

/** Un colegio con una colegiatura que se emite el 30, el 27 y hoy (tres cuotas). */
function contexto(over: Partial<ContextoColegio> = {}): ContextoColegio {
  return {
    teamId: 1, periodoId: 10,
    conceptos: [{ id: 1, nombre: 'Colegiatura', tipo: 'mensualidad', admiteBeca: true, productId: 900, activo: true }],
    cuotas: [
      { id: 1, conceptoId: 1, numero: 1, mes: 10, fechaEmision: HOY, porcentajeMilesimas: 33_334 },
      { id: 2, conceptoId: 1, numero: 2, mes: 10, fechaEmision: EN_2, porcentajeMilesimas: 33_333 },
      { id: 3, conceptoId: 1, numero: 3, mes: 10, fechaEmision: EN_5, porcentajeMilesimas: 33_333 },
    ],
    precios: [{ conceptoId: 1, objetivoTipo: 'servicio', objetivoId: 7, montoCentavos: 500_000, productId: 900 }],
    matriculas: [matricula(1, 50), matricula(2, 51)],
    cargos: [],
    ...over,
  };
}

const candidato = (over: Partial<CorridaCandidata> = {}): CorridaCandidata => ({
  teamId: 1, periodoId: 10, nombre: 'Colegio Ejemplo', facturarDesde: '2026-09-01',
  fechas: [HOY, EN_2, EN_5], ...over,
});

let candidatos: CorridaCandidata[];
let contextos: Map<number, ContextoColegio>;
let destinatarios: Map<number, { userId: number; email: string }[]>;
let yaEnviados: Set<string>;

let enviar: Mock<DepsCorrida['enviar']>;
let registrar: Mock<DepsCorrida['registrar']>;
let cargarContexto: Mock<DepsCorrida['cargarContexto']>;
let deps: DepsCorrida;

beforeEach(() => {
  candidatos = [candidato()];
  contextos = new Map([[1, contexto()]]);
  destinatarios = new Map([[1, [{ userId: 7, email: 'dueno@colegio.do' }, { userId: 8, email: 'admin@colegio.do' }]]]);
  yaEnviados = new Set();

  enviar = vi.fn<DepsCorrida['enviar']>(async () => {});
  registrar = vi.fn<DepsCorrida['registrar']>(async () => {});
  cargarContexto = vi.fn<DepsCorrida['cargarContexto']>(async (c) => contextos.get(c.teamId)!);

  deps = {
    descubrir: async () => candidatos,
    destinatarios: async () => destinatarios,
    yaEnviados: async () => yaEnviados,
    cargarContexto,
    facturasCreadasEl: async () => new Set(),
    asunto: (d) => `asunto ${d.tipo}`,
    enviar,
    registrar,
  };
});

describe('procesarAvisosCorrida', () => {
  it('manda los tres avisos a cada owner/admin y anota cada envío', async () => {
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });

    expect(r.avisos.map((a) => a.tipo).sort()).toEqual(['aviso-2', 'aviso-5', 'resultado']);
    expect(r.enviados).toBe(6); // 3 avisos × 2 destinatarios
    expect(enviar).toHaveBeenCalledTimes(6);
    expect(registrar).toHaveBeenCalledTimes(6);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 1, userId: 7, clave: claveAviso('aviso-5', EN_5),
    }));
  });

  it('el modo sale de la línea de corte de cada fecha', async () => {
    candidatos = [candidato({ facturarDesde: '2026-10-28' })];
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: true });
    const modo = (t: string) => r.avisos.find((a) => a.tipo === t)!.modo;
    expect(modo('resultado')).toBe('manual');  // hoy (25) es anterior a la línea
    expect(modo('aviso-2')).toBe('manual');    // 27 también
    expect(modo('aviso-5')).toBe('automatico'); // 30 ya cae dentro
  });

  it('con los avisos manuales apagados, el colegio manual no recibe nada y el automático sí', async () => {
    candidatos = [candidato({ facturarDesde: '2026-10-28' })];
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false, incluirManual: false });
    // 25 y 27 caen antes de la línea de corte (manual): se omiten; el 30 es automático y sale.
    expect(r.avisos.map((x) => x.tipo)).toEqual(['aviso-5']);
    expect(r.omitidos.filter((o) => o.motivo === 'manual-apagado').map((o) => o.tipo).sort()).toEqual(['aviso-2', 'resultado']);
    // Un solo aviso (el de 5 días) a sus dos destinatarios.
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('nunca repite un aviso que ya salió', async () => {
    yaEnviados = new Set([
      llaveDeEnvio(1, claveAviso('aviso-5', EN_5), 7),
      llaveDeEnvio(1, claveAviso('aviso-5', EN_5), 8),
    ]);
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });

    expect(r.avisos.map((a) => a.tipo).sort()).toEqual(['aviso-2', 'resultado']);
    expect(r.omitidos).toContainEqual({ teamId: 1, tipo: 'aviso-5', fecha: EN_5, motivo: 'ya-enviado' });
    expect(enviar).toHaveBeenCalledTimes(4);
  });

  it('si todo ya salió, ni siquiera lee el colegio', async () => {
    yaEnviados = new Set(
      [['aviso-5', EN_5], ['aviso-2', EN_2], ['resultado', HOY]].flatMap(([t, f]) =>
        [7, 8].map((u) => llaveDeEnvio(1, claveAviso(t as never, f), u))),
    );
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(cargarContexto).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
    expect(r.omitidos).toHaveLength(3);
  });

  it('correrlo dos veces seguidas no manda nada la segunda', async () => {
    // Un `registrar` que de verdad deja la marca donde `yaEnviados` la lee.
    registrar.mockImplementation(async (x) => {
      yaEnviados.add(llaveDeEnvio(x.teamId, x.clave, x.userId));
    });
    await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(enviar).toHaveBeenCalledTimes(6);

    enviar.mockClear();
    const otra = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(enviar).not.toHaveBeenCalled();
    expect(otra.enviados).toBe(0);
  });

  it('si el envío a uno falla, el otro lo recibe y el reintento solo repite al que falló', async () => {
    registrar.mockImplementation(async (x) => {
      yaEnviados.add(llaveDeEnvio(x.teamId, x.clave, x.userId));
    });
    enviar.mockImplementation(async (email) => {
      if (email === 'admin@colegio.do') throw new Error('Resend falló');
    });
    const primera = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(primera.enviados).toBe(3);   // el dueño recibió los tres
    expect(primera.fallos).toHaveLength(3);

    enviar.mockReset();
    enviar.mockImplementation(async () => {});
    await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(enviar).toHaveBeenCalledTimes(3);
    expect(enviar.mock.calls.every((c) => c[0] === 'admin@colegio.do')).toBe(true);
  });

  it('si el envío falla no se anota como enviado', async () => {
    enviar.mockRejectedValue(new Error('Resend falló'));
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(registrar).not.toHaveBeenCalled();
    expect(r.enviados).toBe(0);
    expect(r.fallos.length).toBeGreaterThan(0);
  });

  it('en simulacro calcula todo y no manda ni anota nada', async () => {
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: true });
    expect(r.avisos).toHaveLength(3);
    expect(r.avisos[0].asunto).toMatch(/^asunto /);
    expect(r.enviados).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('sin owner ni admin con correo, avisa por log y sigue', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    destinatarios = new Map();
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(enviar).not.toHaveBeenCalled();
    expect(r.omitidos.every((o) => o.motivo === 'sin-destinatarios')).toBe(true);
    expect(r.omitidos).toHaveLength(3);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('un colegio sin matrículas activas no recibe nada', async () => {
    contextos = new Map([[1, contexto({ matriculas: [matricula(1, 50, { estado: 'retirada' })] })]]);
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(enviar).not.toHaveBeenCalled();
    expect(r.omitidos.every((o) => o.motivo === 'sin-matriculas-activas')).toBe(true);
  });

  it('una corrida en cero (todo con beca total) no vale un correo', async () => {
    contextos = new Map([[1, contexto({
      matriculas: [matricula(1, 50, { becaTipo: 'porcentaje', becaValor: 100 })],
    })]]);
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(enviar).not.toHaveBeenCalled();
    expect(r.omitidos.every((o) => o.motivo === 'sin-monto')).toBe(true);
  });

  it('el aviso lleva el resumen: familias, total y alumnos sin responsable', async () => {
    contextos = new Map([[1, contexto({ matriculas: [matricula(1, 50), matricula(2, 50), matricula(3, null)] })]]);
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: true });
    const a = r.avisos.find((x) => x.tipo === 'aviso-5')!;
    expect(a.resumen.familias).toBe(1);
    expect(a.resumen.totalCentavos).toBe(1_000_000);
    expect(a.resumen.revisar).toContainEqual({ codigo: 'sin-responsable', cantidad: 1 });
  });

  describe('la colegiatura y los planes recurrentes', () => {
    /** Colegiatura (mensualidad) + evaluación, las dos con cuota el 30. */
    const conEvaluacion = (matriculas: MatriculaCorrida[]) => contexto({
      conceptos: [
        ...contexto().conceptos,
        { id: 2, nombre: 'Evaluación', tipo: 'actividad', admiteBeca: false, productId: 901, activo: true },
      ],
      cuotas: [
        ...contexto().cuotas,
        { id: 20, conceptoId: 2, numero: 1, mes: 10, fechaEmision: EN_5, porcentajeMilesimas: 100_000 },
      ],
      precios: [
        ...contexto().precios,
        { conceptoId: 2, objetivoTipo: 'servicio', objetivoId: 7, montoCentavos: 100_000, productId: 901 },
      ],
      matriculas,
    });

    it('con un plan ACTIVO la colegiatura la factura el plan, no el calendario', async () => {
      contextos = new Map([[1, conEvaluacion([
        matricula(1, 50, { conceptosIds: [1, 2], conPlanActivo: true }),
        matricula(2, 51, { conceptosIds: [1, 2] }),
      ])]]);
      const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: true });
      const a = r.avisos.find((x) => x.tipo === 'aviso-5')!;
      expect(a.resumen.porConcepto.map((c) => c.concepto)).toEqual(['Evaluación']);
      expect(a.resumen.totalCentavos).toBe(200_000);
      expect(a.resumen.revisar).toContainEqual({ codigo: 'planes', cantidad: 2 });
    });

    it('un plan finalizado o pausado no cuenta: la colegiatura sigue saliendo por calendario', async () => {
      // `conPlanActivo` es false cuando el plan existe pero no está 'activa'
      // (Mi Casita finalizó sus planes y sus matrículas siguen apuntando a ellos).
      contextos = new Map([[1, conEvaluacion([
        matricula(1, 50, { conceptosIds: [1, 2], conPlanActivo: false }),
      ])]]);
      const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: true });
      const a = r.avisos.find((x) => x.tipo === 'aviso-5')!;
      expect(a.resumen.porConcepto.map((c) => c.concepto).sort()).toEqual(['Colegiatura', 'Evaluación']);
      expect(a.resumen.revisar.some((p) => p.codigo === 'planes')).toBe(false);
    });
  });

  it('el resultado cuenta solo las facturas que nacieron hoy', async () => {
    contextos = new Map([[1, contexto({
      matriculas: [matricula(1, 50), matricula(2, 51)],
      cargos: [
        { id: 1, matriculaId: 1, conceptoId: 1, cuotaId: 1, mes: 10, anio: 2026, montoCentavos: 500_000, saldoCentavos: 500_000, estado: 'pendiente', ecfDocumentId: 900, cuotaFechaEmision: HOY, cuotaPorcentajeMilesimas: 33_334 },
        { id: 2, matriculaId: 2, conceptoId: 1, cuotaId: 1, mes: 10, anio: 2026, montoCentavos: 500_000, saldoCentavos: 500_000, estado: 'pendiente', ecfDocumentId: 901, cuotaFechaEmision: HOY, cuotaPorcentajeMilesimas: 33_334 },
      ],
    })]]);
    const consulta = vi.fn(async () => new Set([900]));
    const r = await procesarAvisosCorrida({ ...deps, facturasCreadasEl: consulta }, { hoy: HOY, soloSimular: true });

    expect(consulta).toHaveBeenCalledWith(1, [900, 901], HOY);
    const res = r.avisos.find((x) => x.tipo === 'resultado')!;
    expect(res.resumen.facturadasHoy).toEqual({ facturas: 1, lineas: 1, totalCentavos: 500_000 });
    expect(res.resumen.yaFacturadas).toBe(1);
  });

  it('un colegio que revienta no deja sin aviso a los demás', async () => {
    candidatos = [candidato({ teamId: 1 }), candidato({ teamId: 2, nombre: 'Otro Colegio' })];
    destinatarios.set(2, [{ userId: 20, email: 'otro@colegio.do' }]);
    contextos.set(2, contexto({ teamId: 2 }));
    cargarContexto.mockImplementation(async (c) => {
      if (c.teamId === 1) throw new Error('configuración a medias');
      return contextos.get(c.teamId)!;
    });
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(r.fallos).toContainEqual({ teamId: 1, error: 'configuración a medias' });
    expect(enviar.mock.calls.every((c) => c[0] === 'otro@colegio.do')).toBe(true);
    expect(r.enviados).toBe(3);
  });

  it('sin colegios con cuotas esos días no hace nada más', async () => {
    candidatos = [];
    const r = await procesarAvisosCorrida(deps, { hoy: HOY, soloSimular: false });
    expect(r).toEqual({ colegios: 0, avisos: [], enviados: 0, omitidos: [], fallos: [] });
  });
});
