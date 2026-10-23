// tests/unit/facturar-lote-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { AlumnoLote, CargoLote } from '@/lib/administracion-escolar/facturar-lote';

/**
 * La ruta de «Facturar por lote», con el guard, la lectura y la creación
 * sustituidos. Lo que se comprueba es lo que la ruta DECIDE: que la vista
 * previa no escriba, que crear exija el gate de escritura, que el tope se haga
 * valer ANTES de crear la primera factura y que quede rastro de quién lo hizo.
 */

const auth = { ok: true as const, teamId: 9, user: { id: 77, email: 'sec@colegio.do' }, teamRole: 'personal-escolar' };
const guard = vi.fn();
vi.mock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: (...a: unknown[]) => guard(...a) }));

const logAudit = vi.fn();
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a), getIp: () => '10.0.0.1' }));

let alumnos: AlumnoLote[] = [];
let cargos: CargoLote[] = [];
const crearFacturasDelPlan = vi.fn();
const periodoDelLote = vi.fn();
vi.mock('@/lib/administracion-escolar/facturar-lote-datos', () => ({
  periodoDelLote: (...a: unknown[]) => periodoDelLote(...a),
  periodosDelColegio: async () => [{ id: 3, nombre: '2026-2027', activo: true }],
  catalogoDelLote: async () => ({ alumnos: [], conceptos: [] }),
  cargarDatosDelLote: async () => ({ alumnos, cargos }),
  // Adelantar cuotas: aquí no hay nada que adelantar.
  adelantarCuotasDelLote: async () => [],
  crearFacturasDelPlan: (...a: unknown[]) => crearFacturasDelPlan(...a),
}));

const { POST, GET } = await import('@/app/api/administracion-escolar/cargos/facturar-lote/route');

const post = (cuerpo: unknown) => POST(new NextRequest('http://localhost/api/administracion-escolar/cargos/facturar-lote', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
}));

/** n alumnos, cada uno con su responsable y un cargo emitido hace tiempo. */
function colegio(n: number) {
  alumnos = Array.from({ length: n }, (_, i) => ({ id: i + 1, nombre: `Alumno ${i + 1}`, clienteId: 100 + i, responsable: `Familia ${i + 1}` }));
  cargos = alumnos.map((a, i) => ({
    id: 1000 + i, estudianteId: a.id, conceptoId: 5, conceptoNombre: 'Colegiatura', mes: 10, anio: 2026,
    estado: 'pendiente', saldoCentavos: 500000, fechaVencimiento: '2026-10-05', fechaEmision: '2020-01-01', ecfDocumentId: null,
  }));
}

const pedido = (extra: Record<string, unknown> = {}) => ({
  estudianteIds: alumnos.map((a) => a.id), conceptoIds: [5], hasta: '2026-10-22', ...extra,
});

beforeEach(() => {
  guard.mockReset().mockResolvedValue(auth);
  logAudit.mockReset();
  crearFacturasDelPlan.mockReset().mockResolvedValue({ creadas: [], fallidas: [] });
  periodoDelLote.mockReset().mockResolvedValue({ id: 3, nombre: '2026-2027' });
  colegio(3);
});

describe('el guard', () => {
  it('pide el permiso de gestionar el colegio, en el módulo escolar', async () => {
    await post(pedido());
    expect(guard).toHaveBeenCalledWith('escolar', 'administracion-escolar:gestionar', { escritura: false });
  });

  it('la vista previa NO pide el gate de escritura; crear SÍ', async () => {
    await post(pedido({ confirmar: false }));
    expect(guard).toHaveBeenLastCalledWith('escolar', 'administracion-escolar:gestionar', { escritura: false });
    await post(pedido({ confirmar: true }));
    expect(guard).toHaveBeenLastCalledWith('escolar', 'administracion-escolar:gestionar', { escritura: true });
  });

  it('sin permiso (o con la suscripción en solo lectura) responde el guard y no se toca nada', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) });
    const r = await post(pedido({ confirmar: true }));

    expect(r.status).toBe(403);
    expect(crearFacturasDelPlan).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('el GET de la pantalla también exige gestionar', async () => {
    await GET(new NextRequest('http://localhost/api/administracion-escolar/cargos/facturar-lote'));
    expect(guard).toHaveBeenCalledWith('escolar', 'administracion-escolar:gestionar');
  });
});

describe('vista previa (confirmar: false)', () => {
  it('devuelve el plan y no crea nada', async () => {
    const r = await post(pedido());
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(d.confirmar).toBe(false);
    expect(d.plan.facturas).toHaveLength(3);
    expect(d.creadas).toBeUndefined();
    expect(crearFacturasDelPlan).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('por defecto, una factura por alumno', async () => {
    const d = await (await post(pedido())).json();
    expect(d.juntarHermanos).toBe(false);
    expect(d.plan.facturas.map((f: { clave: string }) => f.clave)).toEqual(['e:1', 'e:2', 'e:3']);
  });

  it('sin fecha de corte, corta en hoy y no en «todo»', async () => {
    cargos = cargos.map((c) => ({ ...c, fechaEmision: '2999-01-01' }));
    const d = await (await post({ estudianteIds: [1, 2, 3], conceptoIds: [5] })).json();
    expect(d.plan.facturas).toHaveLength(0);
    expect(d.plan.omitidos.every((o: { motivo: string }) => o.motivo === 'despues-del-corte')).toBe(true);
  });
});

describe('peticiones mal hechas', () => {
  it('una lista vacía no es «todos»', async () => {
    const r = await post(pedido({ estudianteIds: [] }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/alumno/i);
  });

  it('un cuerpo que no es JSON se rechaza sin reventar', async () => {
    const r = await POST(new NextRequest('http://localhost/x', { method: 'POST', body: 'no es json' }));
    expect(r.status).toBe(400);
  });

  it('un año escolar que no existe → 404', async () => {
    periodoDelLote.mockResolvedValue(null);
    expect((await post(pedido())).status).toBe(404);
  });
});

describe('crear (confirmar: true)', () => {
  it('entrega el plan a quien crea, a nombre de quien lo pidió, y deja rastro', async () => {
    crearFacturasDelPlan.mockResolvedValue({
      creadas: [{ clave: 'e:1', documentoId: 900, codigo: 'FA-1', montoCentavos: 500000, estudiantes: [], responsable: null, cargos: 1 }],
      fallidas: [],
    });
    const r = await post(pedido({ confirmar: true, juntarHermanos: true }));
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(crearFacturasDelPlan).toHaveBeenCalledTimes(1);
    const [teamId, userId, facturas] = crearFacturasDelPlan.mock.calls[0];
    expect([teamId, userId]).toEqual([9, 77]);
    // Juntar hermanos: familias distintas, así que siguen siendo tres facturas, ahora por responsable.
    expect((facturas as { clave: string }[]).map((f) => f.clave)).toEqual(['r:100', 'r:101', 'r:102']);
    expect(d.creadas).toHaveLength(1);

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 9, userId: 77, actor: 'sec@colegio.do', action: 'ESCOLAR_FACTURAS_LOTE', resource: 'periodo:3',
      meta: expect.objectContaining({ creadas: 1, fallidas: 0, cargos: 1, montoCentavos: 500000, juntarHermanos: true }),
    }));
  });

  it('sin nada que facturar no llama a quien crea ni deja rastro', async () => {
    cargos = cargos.map((c) => ({ ...c, ecfDocumentId: 5 }));
    const d = await (await post(pedido({ confirmar: true }))).json();

    expect(d.creadas).toEqual([]);
    expect(d.plan.omitidos).toHaveLength(3);
    expect(crearFacturasDelPlan).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  /**
   * El tope es de tiempo (cada factura tarda ~2 s y la ruta vive 300). Se
   * avisa ANTES de crear la primera: a mitad, la persona se quedaría con 100
   * hechas y 50 sin hacer sin saber por qué.
   */
  it('más facturas que el tope: lo dice con un mensaje claro y no crea ninguna', async () => {
    colegio(101);
    const r = await post(pedido({ confirmar: true }));
    const d = await r.json();

    expect(r.status).toBe(400);
    expect(d.codigo).toBe('DEMASIADAS_FACTURAS');
    expect(d.error).toContain('101 facturas');
    expect(d.error).toContain('máximo por envío es 100');
    expect(crearFacturasDelPlan).not.toHaveBeenCalled();
  });

  it('la vista previa SÍ puede ser más grande que el tope: solo lee', async () => {
    colegio(150);
    const d = await (await post(pedido({ confirmar: false }))).json();
    expect(d.plan.facturas).toHaveLength(150);
  });

  it('exactamente el tope pasa', async () => {
    colegio(100);
    expect((await post(pedido({ confirmar: true }))).status).toBe(200);
    expect(crearFacturasDelPlan).toHaveBeenCalledTimes(1);
  });

  it('si todas las facturas fallan, igual deja rastro de que se intentó', async () => {
    crearFacturasDelPlan.mockResolvedValue({
      creadas: [],
      fallidas: [{ clave: 'e:1', estudiantes: [], responsable: null, motivo: 'error', detalle: 'x', yaFacturados: true }],
    });
    await post(pedido({ confirmar: true }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ creadas: 0, fallidas: 1 }),
    }));
  });
});
