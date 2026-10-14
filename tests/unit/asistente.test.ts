import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El asistente de Zero es SOLO LECTURA y trabaja con el teamId de la sesión.
 * Aquí se comprueba, sin llamar a ningún modelo real ni a la base:
 *  - cada herramienta consulta con el teamId que se le dio, nunca otro;
 *  - ninguna herramienta escribe (el catálogo es de reportes);
 *  - los montos viajan en pesos, no en centavos;
 *  - el resumen que recibe el agente humano es corto y plano.
 */

const q = vi.hoisted(() => ({
  getKpis: vi.fn(),
  getTendencia: vi.fn(),
  getIngresosPorProducto: vi.fn(),
  getIngresosPorCliente: vi.fn(),
  getIngresosPorMetodo: vi.fn(),
  getAgingCxC: vi.fn(),
  getItbisResumen: vi.fn(),
  getVentasPorTipo: vi.fn(),
  getVentasPorUsuario: vi.fn(),
}));
vi.mock('@/lib/reportes/queries', () => q);
vi.mock('@/lib/db/drizzle', () => ({ db: {} }));
vi.mock('@/lib/auth/modules', () => ({ getTeamModules: vi.fn() }));
vi.mock('@/lib/auth/permissions', () => ({ getEffectivePermissions: vi.fn() }));
vi.mock('@/lib/compras/captura/consultas', () => ({ listarCapturas: vi.fn(), contarPorRevisar: vi.fn() }));
vi.mock('@/lib/compras/consultas', () => ({ listarCompras: vi.fn(), resumenGastos: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: vi.fn() }));

import { crearHerramientas, type ConsultaHecha } from '@/lib/asistente/herramientas';
import { armarResumenParaAgente } from '@/lib/asistente/derivar';

const ejecutar = async (t: unknown, input: unknown) =>
  (t as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(input, {});

beforeEach(() => { vi.clearAllMocks(); });

describe('herramientas del asistente', () => {
  it('consultan siempre con el teamId de la sesión', async () => {
    q.getKpis.mockResolvedValue({
      ingresosCents: 1_234_567, baseCents: 1_000_000, itbisCents: 180_000, numFacturas: 12,
      ticketPromedioCents: 102_880, porCobrarCents: 50_000, vencidoCents: 10_000, tasaAceptacion: 1,
    });
    const consultas: ConsultaHecha[] = [];
    const h = crearHerramientas(42, consultas);
    await ejecutar(h.resumen_ventas, { desde: '2026-10-01', hasta: '2026-10-31' });
    expect(q.getKpis).toHaveBeenCalledTimes(1);
    expect(q.getKpis.mock.calls[0][0]).toBe(42);
  });

  it('devuelve pesos, no centavos', async () => {
    q.getKpis.mockResolvedValue({
      ingresosCents: 1_234_567, baseCents: 0, itbisCents: 0, numFacturas: 3,
      ticketPromedioCents: 100, porCobrarCents: 0, vencidoCents: 0, tasaAceptacion: 0,
    });
    const h = crearHerramientas(1, []);
    const r = await ejecutar(h.resumen_ventas, {}) as { ventasNetas: number; facturas: number };
    expect(r.ventasNetas).toBe(12345.67);
    expect(r.facturas).toBe(3);
  });

  it('anota qué consultó para mostrárselo a la persona', async () => {
    q.getIngresosPorMetodo.mockResolvedValue([{ metodo: 'transferencia', totalCents: 5000, numPagos: 2 }]);
    const consultas: ConsultaHecha[] = [];
    const h = crearHerramientas(7, consultas);
    const r = await ejecutar(h.cobros_por_metodo, { desde: '2026-10-01', hasta: '2026-10-15' }) as {
      metodos: { metodo: string; cobrado: number }[];
    };
    expect(r.metodos[0]).toMatchObject({ metodo: 'Transferencia', cobrado: 50 });
    expect(consultas).toHaveLength(1);
    expect(consultas[0].nombre).toBe('Cobros por método');
    expect(consultas[0].resumen).toContain('2026-10-01');
  });

  it('la cartera sale de la API de Cuentas por cobrar, agrupada por cliente', async () => {
    const { api, llamadas } = apiFalsa({
      '/api/cuentas-por-cobrar': {
        cuentas: [
          { id: 1, razonSocialComprador: 'Familia Pérez', saldo: 20000, diasVencido: 10 },
          { id: 2, razonSocialComprador: 'Familia Pérez', saldo: 30000, diasVencido: 120 },
          { id: 3, razonSocialComprador: 'Familia Gómez', saldo: 10000, diasVencido: 0 },
        ],
        totales: { pendiente: 60000 },
        antiguedad: { porVencer: { saldo: 10000 }, d1a30: { saldo: 20000 }, d90mas: { saldo: 30000 } },
      },
    });
    const h = crearHerramientas(contextoDePrueba(1, { api }), []);
    const r = await ejecutar(h.cuentas_por_cobrar, { soloVencidas: false, limite: 10 }) as {
      totalPorCobrar: number; vencidoMasDe90: number; mayoresDeudores: { cliente: string; debe: number; facturas: number; diasVencidoMaximo: number }[];
    };
    expect(llamadas[0].ruta).toBe('/api/cuentas-por-cobrar');
    expect(r.totalPorCobrar).toBe(600);
    expect(r.vencidoMasDe90).toBe(300);
    expect(r.mayoresDeudores[0]).toEqual({ cliente: 'Familia Pérez', debe: 500, facturas: 2, diasVencidoMaximo: 120 });
  });

  it('el catálogo es exactamente el de consultas: una herramienta nueva obliga a revisar esto', () => {
    // Si alguien agrega una herramienta, este test falla a propósito: toda
    // herramienta del asistente tiene que ser de lectura y pasar por revisión.
    expect(Object.keys(crearHerramientas(1, [])).sort()).toEqual([
      'buscar_clientes', 'buscar_empleados', 'buscar_estudiantes', 'buscar_facturas', 'buscar_productos',
      'cargos_escolares', 'catalogo_cuentas', 'cobros_por_metodo', 'cuentas_por_cobrar', 'donde_encontrar',
      'facturas_por_revisar', 'facturas_recurrentes', 'libro_diario', 'listar_cotizaciones', 'listar_gastos_compras',
      'pagos_recibidos', 'resumen_gastos', 'resumen_itbis', 'resumen_matriculas', 'resumen_nomina', 'resumen_ventas',
      'tendencia_ventas', 'turnos_caja', 'ventas_por_cliente', 'ventas_por_producto',
      'ventas_por_tipo_comprobante', 'ventas_por_usuario',
    ]);
  });

  it('el modelo solo puede escoger fechas con formato YYYY-MM-DD', async () => {
    const h = crearHerramientas(1, []);
    const esquema = (h.resumen_ventas as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema;
    expect(esquema.safeParse({ desde: '2026-10-01' }).success).toBe(true);
    expect(esquema.safeParse({ desde: "'; DROP TABLE teams;--" }).success).toBe(false);
    expect(esquema.safeParse({ desde: '01/10/2026' }).success).toBe(false);
  });
});

describe('resumen para el agente humano', () => {
  it('trae la conversación en texto plano, sin markdown de tablas', () => {
    const t = armarResumenParaAgente([
      { rol: 'user', contenido: 'Quién me debe' },
      { rol: 'assistant', contenido: '**Total:** RD$ 500.00\n\n| cliente | debe |\n| --- | --- |\n| Pérez | 500 |' },
    ]);
    expect(t).toContain('Cliente: Quién me debe');
    expect(t).toContain('Asistente: Total: RD$ 500.00');
    expect(t).not.toContain('**');
    expect(t).not.toContain('---');
    expect(t).toContain('Pérez · 500');
    expect(t).not.toMatch(/·\s*$/m);
  });

  it('no pasa de ~4000 caracteres y conserva lo más reciente', () => {
    const largo = Array.from({ length: 40 }, (_, i) => ({
      rol: i % 2 ? 'assistant' : 'user', contenido: `mensaje ${i} ${'x'.repeat(500)}`,
    }));
    largo.push({ rol: 'user', contenido: 'ÚLTIMA PREGUNTA' });
    const t = armarResumenParaAgente(largo);
    expect(t.length).toBeLessThan(4200);
    expect(t).toContain('ÚLTIMA PREGUNTA');
    expect(t).not.toContain('mensaje 0 ');
  });
});

// ── Guía y permisos por módulo ──────────────────────────────────────────────

import { buscarEnMapa } from '@/lib/asistente/guia';
import { contextoDePrueba } from '@/lib/asistente/contexto';
import type { EntradaMapa } from '@/lib/asistente/mapa-sistema';

const MAPA: EntradaMapa[] = [
  {
    id: 'libro', modulo: 'contabilidad', titulo: 'Libro diario', ruta: '/contabilidad/libro-diario',
    menu: 'Contabilidad › Libro diario', que: 'Lista de asientos contables', palabras: ['asientos', 'libro', 'diario', 'contable'],
    permiso: 'contabilidad:ver',
  },
  {
    id: 'nuevo-asiento', modulo: 'contabilidad', titulo: 'Nuevo asiento', ruta: '/contabilidad/nuevo-asiento',
    menu: 'Contabilidad › Nuevo asiento', que: 'Registrar un asiento manual', palabras: ['asiento', 'manual', 'registrar asiento'],
    como: ['Abre Nuevo asiento', 'Elige la fecha', 'Agrega las líneas', 'Guarda'], permiso: 'contabilidad:gestionar',
  },
  {
    id: 'corridas', modulo: 'nomina', titulo: 'Corridas de nómina', ruta: '/nomina/corridas',
    menu: 'Nómina › Corridas', que: 'Calcular y aprobar la nómina', palabras: ['nomina', 'pago empleados', 'corrida'],
  },
  {
    id: 'facturas', modulo: 'facturacion', titulo: 'Facturas', ruta: '/dashboard/facturas',
    menu: 'Facturación › Facturas', que: 'Lista de facturas emitidas', palabras: ['facturas', 'ventas'],
  },
];

describe('guía: dónde está cada cosa', () => {
  const todo = contextoDePrueba(1);

  it('encuentra la pantalla con las palabras de la persona, con módulo, menú y pasos', () => {
    const r = buscarEnMapa('¿cómo creo un nuevo asiento manual?', todo, { mapa: MAPA });
    expect(r.resultados[0]).toMatchObject({
      titulo: 'Nuevo asiento', modulo: 'Contabilidad', menu: 'Contabilidad › Nuevo asiento', ruta: '/contabilidad/nuevo-asiento',
    });
    expect(r.resultados[0].pasos).toHaveLength(4);
  });

  it('no distingue tildes ni mayúsculas', () => {
    const r = buscarEnMapa('NÓMINA', todo, { mapa: MAPA });
    expect(r.resultados[0].titulo).toBe('Corridas de nómina');
  });

  it('si el módulo no está contratado no lo recomienda, pero lo dice', () => {
    const sinNomina = contextoDePrueba(1, { modulos: ['facturacion', 'administracion'] });
    const r = buscarEnMapa('nómina', sinNomina, { mapa: MAPA });
    expect(r.resultados).toEqual([]);
    expect(r.noDisponibles[0]).toMatchObject({ modulo: 'Nómina' });
    expect(r.noDisponibles[0].motivo).toMatch(/no está activo/);
  });

  it('si el rol no tiene el permiso de la pantalla, tampoco la recomienda', () => {
    const lector = contextoDePrueba(1, { permisos: ['contabilidad:ver'] });
    const r = buscarEnMapa('registrar asiento manual', lector, { mapa: MAPA });
    expect(r.resultados.find((x) => x.titulo === 'Nuevo asiento')).toBeUndefined();
    expect(r.noDisponibles.map((x) => x.titulo)).toContain('Nuevo asiento');
  });

  it('una consulta sin relación no devuelve nada', () => {
    const r = buscarEnMapa('receta de sancocho', todo, { mapa: MAPA });
    expect(r.resultados).toEqual([]);
  });
});

describe('herramientas según módulo y permiso', () => {
  const nombres = (ctx: ReturnType<typeof contextoDePrueba>) => Object.keys(crearHerramientas(ctx, []));

  it('sin el módulo de nómina no existen las consultas de nómina', () => {
    const n = nombres(contextoDePrueba(1, { modulos: ['facturacion', 'administracion'] }));
    expect(n).not.toContain('resumen_nomina');
    expect(n).not.toContain('buscar_empleados');
    expect(n).not.toContain('turnos_caja');
  });

  it('con el módulo pero sin el permiso, tampoco', () => {
    const n = nombres(contextoDePrueba(1, { permisos: ['reportes:ver'] }));
    expect(n).not.toContain('libro_diario');
    expect(n).not.toContain('resumen_nomina');
    expect(n).not.toContain('buscar_productos');
    expect(n).toContain('resumen_ventas');
  });

  it('con módulo y permiso existen; la guía va siempre', () => {
    const n = nombres(contextoDePrueba(1));
    for (const esperado of ['libro_diario', 'resumen_nomina', 'turnos_caja', 'buscar_estudiantes', 'buscar_productos', 'donde_encontrar']) {
      expect(n).toContain(esperado);
    }
    expect(nombres(contextoDePrueba(1, { modulos: [], permisos: [] }))).toContain('donde_encontrar');
  });
});

describe('mapa del sistema', () => {
  it('cada ruta del mapa existe como pantalla real y no hay ids repetidos', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { MAPA_SISTEMA } = await import('@/lib/asistente/mapa-sistema');

    const rutas = new Set<string>();
    const recorrer = (dir: string, prefijo: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          // Los grupos de rutas «(dashboard)» no forman parte de la URL.
          const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
          recorrer(path.join(dir, e.name), prefijo + seg);
        } else if (/^page\.(t|j)sx?$/.test(e.name)) {
          rutas.add(prefijo || '/');
        }
      }
    };
    recorrer(path.join(process.cwd(), 'app'), '');

    const faltan = MAPA_SISTEMA.filter((e) => !rutas.has(e.ruta.split('?')[0].split('#')[0])).map((e) => `${e.id} → ${e.ruta}`);
    expect(faltan).toEqual([]);
    const ids = MAPA_SISTEMA.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MAPA_SISTEMA.length).toBeGreaterThan(60);
  });

  it('«cómo creo un asiento» llega a una pantalla de contabilidad con pasos', async () => {
    const { MAPA_SISTEMA } = await import('@/lib/asistente/mapa-sistema');
    const r = buscarEnMapa('cómo creo un asiento contable', contextoDePrueba(1), { mapa: MAPA_SISTEMA });
    expect(r.resultados.length).toBeGreaterThan(0);
    expect(r.resultados[0].modulo).toBe('Contabilidad');
    expect(r.resultados[0].ruta).toMatch(/^\/contabilidad\//);
  });

  it('«libro diario» lo ubica en Contabilidad', async () => {
    const r = buscarEnMapa('dónde veo el libro diario', contextoDePrueba(1));
    expect(r.resultados[0]).toMatchObject({ modulo: 'Contabilidad', ruta: '/contabilidad/libro-diario' });
  });
});

describe('guía con el mapa real', () => {
  const todo = contextoDePrueba(1);
  const casos: [string, string][] = [
    ['¿Cómo creo un nuevo asiento en el libro diario?', '/contabilidad/nuevo-asiento'],
    ['dónde veo las cotizaciones', '/dashboard/cotizaciones'],
    ['dónde configuro las plantillas de WhatsApp', '/escolar/configuracion/plantillas'],
    ['cómo registro un empleado nuevo', '/nomina/empleados/nuevo'],
  ];
  for (const [pregunta, ruta] of casos) {
    it(`«${pregunta}» incluye ${ruta}`, () => {
      const r = buscarEnMapa(pregunta, todo);
      expect(r.resultados.map((x) => x.ruta)).toContain(ruta);
    });
  }

  it('sin nómina contratada, «empleado nuevo» no manda a Nómina y lo explica', () => {
    const r = buscarEnMapa('cómo registro un empleado nuevo', contextoDePrueba(1, { modulos: ['facturacion', 'administracion'] }));
    expect(r.resultados.every((x) => x.modulo !== 'Nómina')).toBe(true);
    expect(r.noDisponibles.some((x) => x.modulo === 'Nómina')).toBe(true);
  });
});

// ── Contestador local (sin IA) ──────────────────────────────────────────────

import { responderLocal, interpretarPeriodo } from '@/lib/asistente/local';
import { terminos } from '@/lib/asistente/guia';
import { esErrorDeCuota } from '@/lib/asistente/agente';

/** Herramientas falsas: registran con qué se llamaron y devuelven lo que se les dé. */
function herramientasFalsas(salidas: Record<string, unknown>) {
  const llamadas: { nombre: string; input: Record<string, unknown> }[] = [];
  const reales = crearHerramientas(contextoDePrueba(1), []) as Record<string, { inputSchema?: unknown }>;
  const tools = Object.fromEntries(Object.keys(reales).map((nombre) => [nombre, {
    inputSchema: reales[nombre].inputSchema,
    execute: async (input: Record<string, unknown>) => { llamadas.push({ nombre, input }); return salidas[nombre] ?? {}; },
  }]));
  return { tools: tools as never, llamadas };
}

const HOY = '2026-10-13';
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

describe('períodos en lenguaje natural', () => {
  it.each([
    ['ventas de hoy', '2026-10-13', '2026-10-13'],
    ['ventas de ayer', '2026-10-12', '2026-10-12'],
    ['este mes', '2026-10-01', '2026-10-31'],
    ['el mes pasado', '2026-09-01', '2026-09-30'],
    ['en septiembre', '2026-09-01', '2026-09-30'],
    ['en noviembre', '2025-11-01', '2025-11-30'],
    ['en marzo de 2025', '2025-03-01', '2025-03-31'],
    ['esta semana', '2026-10-12', '2026-10-13'],
    ['la semana pasada', '2026-10-05', '2026-10-11'],
    ['ultimos 7 dias', '2026-10-07', '2026-10-13'],
    ['este año', '2026-01-01', '2026-10-13'],
  ])('«%s» → %s a %s', (frase, desde, hasta) => {
    expect(interpretarPeriodo(sinTildes(frase), HOY)).toMatchObject({ desde, hasta });
  });

  it('lo que no sabe leer lo deja a la IA', () => {
    expect(interpretarPeriodo('el trimestre pasado', HOY)).toBeNull();
    expect(interpretarPeriodo('desde marzo', HOY)).toBeNull();
  });
});

describe('contestador local', () => {
  it('«¿cuánto vendí el mes pasado?» responde solo, con el período correcto', async () => {
    const { tools, llamadas } = herramientasFalsas({
      resumen_ventas: { ventasNetas: 1500, baseImponible: 1271.19, itbis: 228.81, facturas: 3, ticketPromedio: 500, porCobrarHoy: 200, vencidoHoy: 0 },
    });
    const r = await responderLocal('¿Cuánto vendí el mes pasado?', tools, { hoy: HOY });
    expect(r?.intencion).toBe('ventas');
    expect(llamadas[0]).toMatchObject({ nombre: 'resumen_ventas', input: { desde: '2026-09-01', hasta: '2026-09-30' } });
    expect(r?.respuesta).toContain('RD$ 1,500.00');
    expect(r?.respuesta).toContain('septiembre de 2026');
  });

  it('«¿quién me debe?» arma la tabla y señala si uno concentra la deuda', async () => {
    const { tools } = herramientasFalsas({
      cuentas_por_cobrar: {
        totalPorCobrar: 1000, porVencer: 0, vencido0a30: 600, vencido31a60: 0, vencido61a90: 0, vencidoMasDe90: 400, clientesConDeuda: 2,
        mayoresDeudores: [{ cliente: 'Familia Pérez', debe: 800, facturas: 2, diasVencidoMaximo: 120 }, { cliente: 'Gómez', debe: 200, facturas: 1, diasVencidoMaximo: 10 }],
      },
    });
    const r = await responderLocal('quien me debe', tools, { hoy: HOY });
    expect(r?.intencion).toBe('cartera');
    expect(r?.respuesta).toMatch(/\| Familia Pérez \| RD\$ 800\.00/);
    expect(r?.respuesta).toContain('concentra el 80%');
    expect(r?.respuesta).toContain('más de 90 días');
  });

  it('las facturas por revisar se contestan sin IA', async () => {
    const { tools } = herramientasFalsas({ facturas_por_revisar: { totalPorRevisar: 1, facturas: [{ proveedor: 'Jade Teriyaki S.R.L.', total: 649.99, fecha: '2026-09-23', recibida: '2026-09-23' }] } });
    const r = await responderLocal('¿Cuáles facturas tengo por revisar?', tools, { hoy: HOY });
    expect(r?.intencion).toBe('por-revisar');
    expect(r?.respuesta).toContain('Jade Teriyaki');
  });

  it('una pregunta de «dónde/cómo» la contesta la guía, con enlace y pasos', async () => {
    const tools = crearHerramientas(contextoDePrueba(1), []);
    const r = await responderLocal('¿Cómo creo un nuevo asiento en el libro diario?', tools, { hoy: HOY });
    expect(r?.intencion).toBe('guia');
    expect(r?.respuesta).toContain('](/contabilidad/nuevo-asiento)');
    expect(r?.respuesta).toMatch(/\n1\. /);
  });

  it('un pedido de cambio no se ejecuta: explica y guía a la pantalla', async () => {
    const tools = crearHerramientas(contextoDePrueba(1), []);
    const r = await responderLocal('anula la factura E310000000045', tools, { hoy: HOY });
    expect(r?.intencion).toBe('cambio');
    expect(r?.respuesta).toMatch(/no lo hago desde (aquí|el chat)/);
  });

  it('las preguntas que piden razonar van a la IA', async () => {
    const { tools, llamadas } = herramientasFalsas({});
    for (const q of [
      'compara las ventas de septiembre con las de agosto',
      '¿por qué bajaron las ventas este mes?',
      '¿cómo puedo mejorar mi cobranza?',
      'ventas y gastos de este mes',
      'ventas del trimestre pasado',
    ]) {
      expect(await responderLocal(q, tools, { hoy: HOY }), q).toBeNull();
    }
    expect(llamadas.filter((l) => l.nombre !== 'donde_encontrar')).toEqual([]);
  });

  it('sin IA (tolerante) igual contesta lo que entiende, y lo que no, no lo inventa', async () => {
    const { tools } = herramientasFalsas({ resumen_gastos: { gastos: 0, borradores: 0, porCategoria: [] } });
    expect((await responderLocal('ventas y gastos de este mes', tools, { tolerante: true, hoy: HOY }))?.intencion).toBe('gastos');
    expect(await responderLocal('cuéntame un chiste', tools, { tolerante: true, hoy: HOY })).toBeNull();
  });

  it('si la herramienta no está (módulo no contratado), no responde por su cuenta', async () => {
    const tools = crearHerramientas(contextoDePrueba(1, { modulos: ['facturacion', 'administracion'] }), []);
    expect(await responderLocal('¿cuántos empleados activos tengo?', tools, { hoy: HOY })).toBeNull();
  });

  it('saludos y agradecimientos no gastan la IA', async () => {
    const { tools } = herramientasFalsas({});
    expect((await responderLocal('Hola', tools))?.intencion).toBe('saludo');
    expect((await responderLocal('gracias!', tools))?.intencion).toBe('gracias');
  });
});

describe('guía: términos de búsqueda', () => {
  it('no deja términos de 1 o 2 letras («mes» no se vuelve «m»)', () => {
    expect(terminos('estado de cuenta del mes')).toEqual(['estado', 'cuenta', 'mes']);
    expect(terminos('reporte de los tres meses').every((t) => t.length >= 3)).toBe(true);
  });
});

describe('error de cuota de la IA', () => {
  it('lo reconoce aunque venga envuelto en un reintento o en el respaldo', () => {
    expect(esErrorDeCuota({ statusCode: 429 })).toBe(true);
    expect(esErrorDeCuota({ lastError: { statusCode: 429 } })).toBe(true);
    expect(esErrorDeCuota({ errors: [{ statusCode: 503 }, { responseBody: '{"status":"RESOURCE_EXHAUSTED"}' }] })).toBe(true);
    expect(esErrorDeCuota({ statusCode: 503 })).toBe(false);
    expect(esErrorDeCuota(new Error('timeout'))).toBe(false);
  });
});

// ── Enlaces: solo rutas reales ──────────────────────────────────────────────

import { sanitizarEnlaces, rutaEsReal, PATRONES_REGISTRO } from '@/lib/asistente/enlaces';

describe('enlaces del asistente', () => {
  it('cada pantalla de registro existe de verdad en app/', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const p of PATRONES_REGISTRO) {
      expect(fs.existsSync(path.join(process.cwd(), p.pagina)), p.pagina).toBe(true);
    }
  });

  it('acepta rutas del mapa y de registros, aunque vengan con http://localhost', () => {
    expect(rutaEsReal('/dashboard/compras')).toBe(true);
    expect(rutaEsReal('http://localhost:3000/dashboard/compras')).toBe(true);
    expect(rutaEsReal('/dashboard/facturas/123')).toBe(true);
    expect(rutaEsReal('/dashboard/compras/local/9')).toBe(true);
  });

  it('rechaza rutas inventadas, externas o con id no numérico', () => {
    for (const r of ['/dashboard/facturas-recibidas', '/dashboard/facturas/abc', 'https://evil.com/x', '//evil.com', '/api/asistente', 'javascript:alert(1)']) {
      expect(rutaEsReal(r), r).toBe(false);
    }
  });

  it('quita el enlace inventado y deja el texto; vuelve relativos los reales', () => {
    const r = sanitizarEnlaces('Mira [Facturas recibidas](http://localhost:3000/dashboard/compras) y [Otra](/dashboard/no-existe) y /dashboard/tampoco.');
    expect(r.texto).toContain('[Facturas recibidas](/dashboard/compras)');
    expect(r.texto).not.toContain('no-existe)');
    expect(r.texto).toContain('Otra');
    expect(r.texto).toContain('(pantalla no verificada)');
    expect(r.descartados).toEqual(['/dashboard/no-existe', '/dashboard/tampoco']);
  });

  it('toda ruta que el mapa publica pasa el filtro', async () => {
    const { MAPA_SISTEMA } = await import('@/lib/asistente/mapa-sistema');
    for (const e of MAPA_SISTEMA) expect(rutaEsReal(e.ruta), e.id).toBe(true);
  });
});

// ── Política de acciones: confirmar antes de crear / eliminar ───────────────

import { z } from 'zod';
import {
  registrarAccion, limpiarAcciones, proponerAccion, confirmarAccion, herramientasDeAcciones,
} from '@/lib/asistente/acciones';
import { aBloques, esRespuestaGrande, pidePdf } from '@/lib/asistente/bloques';

const usos = vi.hoisted(() => new Set<string>());
vi.mock('@/lib/rate-limit', () => ({
  rateLimitDb: vi.fn(async (k: string) => {
    if (usos.has(k)) return { allowed: false, remaining: 0, resetAt: new Date() };
    usos.add(k);
    return { allowed: true, remaining: 0, resetAt: new Date() };
  }),
}));

describe('acciones con confirmación', () => {
  const ejecutadas: unknown[] = [];

  beforeEach(() => {
    process.env.AUTH_SECRET = 'secreto-de-prueba-para-tokens';
    usos.clear();
    ejecutadas.length = 0;
    limpiarAcciones();
    registrarAccion({
      nombre: 'eliminar_cotizacion',
      tipo: 'eliminar',
      descripcion: 'Elimina una cotización.',
      permiso: 'cotizaciones:gestionar',
      modulo: 'facturacion',
      esquema: z.object({ numero: z.string().min(1) }),
      resumen: (a) => `Eliminar la cotización ${a.numero}`,
      ejecutar: async (_ctx, uid, a) => { ejecutadas.push({ uid, a }); return { mensaje: `Cotización ${a.numero} eliminada.` }; },
    });
  });

  it('proponer NO ejecuta: solo devuelve un resumen y un token', async () => {
    const r = await proponerAccion(contextoDePrueba(7), 11, 'eliminar_cotizacion', { numero: 'COT-12' });
    expect(r).toMatchObject({ confirmacionPendiente: true, tipo: 'eliminar', destructiva: true, resumen: 'Eliminar la cotización COT-12' });
    expect(ejecutadas).toEqual([]);
  });

  it('confirmar ejecuta una sola vez y con los datos propuestos', async () => {
    const ctx = contextoDePrueba(7);
    const p = await proponerAccion(ctx, 11, 'eliminar_cotizacion', { numero: 'COT-12' }) as { token: string };
    const r1 = await confirmarAccion(ctx, 11, p.token);
    expect(r1).toMatchObject({ ok: true, mensaje: 'Cotización COT-12 eliminada.' });
    expect(ejecutadas).toEqual([{ uid: 11, a: { numero: 'COT-12' } }]);
    const r2 = await confirmarAccion(ctx, 11, p.token);
    expect(r2).toMatchObject({ ok: false, status: 409 });
    expect(ejecutadas).toHaveLength(1);
  });

  it('un token de otra persona o de otra empresa no ejecuta nada', async () => {
    const p = await proponerAccion(contextoDePrueba(7), 11, 'eliminar_cotizacion', { numero: 'COT-12' }) as { token: string };
    expect(await confirmarAccion(contextoDePrueba(7), 99, p.token)).toMatchObject({ ok: false, status: 403 });
    expect(await confirmarAccion(contextoDePrueba(8), 11, p.token)).toMatchObject({ ok: false, status: 403 });
    expect(ejecutadas).toEqual([]);
  });

  it('un token alterado o inventado se rechaza', async () => {
    expect(await confirmarAccion(contextoDePrueba(7), 11, 'eyJhbGciOiJIUzI1NiJ9.e30.firma-falsa')).toMatchObject({ ok: false, status: 400 });
    expect(ejecutadas).toEqual([]);
  });

  it('sin el permiso o sin el módulo no se puede ni proponer', async () => {
    const sinPermiso = contextoDePrueba(7, { permisos: ['reportes:ver'] });
    expect(await proponerAccion(sinPermiso, 11, 'eliminar_cotizacion', { numero: 'X' })).toMatchObject({ error: expect.stringMatching(/permiso/) });
    const sinModulo = contextoDePrueba(7, { modulos: ['administracion'] });
    expect(await proponerAccion(sinModulo, 11, 'eliminar_cotizacion', { numero: 'X' })).toMatchObject({ error: expect.stringMatching(/módulo/) });
  });

  it('si el permiso se pierde entre proponer y confirmar, no ejecuta', async () => {
    const p = await proponerAccion(contextoDePrueba(7), 11, 'eliminar_cotizacion', { numero: 'COT-12' }) as { token: string };
    const r = await confirmarAccion(contextoDePrueba(7, { permisos: ['reportes:ver'] }), 11, p.token);
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(ejecutadas).toEqual([]);
  });

  it('datos inválidos no generan propuesta', async () => {
    expect(await proponerAccion(contextoDePrueba(7), 11, 'eliminar_cotizacion', { numero: '' })).toMatchObject({ error: expect.any(String) });
  });

  it('el modelo recibe una herramienta de PROPUESTA y nunca el token', async () => {
    const propuestas: unknown[] = [];
    const t = herramientasDeAcciones(contextoDePrueba(7), 11, propuestas as never);
    expect(Object.keys(t)).toEqual(['proponer_eliminar_cotizacion']);
    const salida = await (t.proponer_eliminar_cotizacion as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> })
      .execute({ numero: 'COT-1' }, {});
    expect(salida).toMatchObject({ confirmacionPendiente: true, destructiva: true });
    expect(JSON.stringify(salida)).not.toContain('token');
    expect(propuestas).toHaveLength(1);
    expect(ejecutadas).toEqual([]);
  });

  it('sin acciones registradas, el modelo no tiene ninguna herramienta que escriba', () => {
    limpiarAcciones();
    expect(herramientasDeAcciones(contextoDePrueba(7), 11)).toEqual({});
  });
});

describe('PDF de respuestas', () => {
  it('convierte el markdown en bloques (tabla, lista, negritas)', () => {
    const b = aBloques('Total **RD$ 10.00**\n\n| A | B |\n| --- | --- |\n| x | 1 |\n\n1. uno\n2. dos');
    expect(b.map((x) => x.tipo)).toEqual(['parrafo', 'tabla', 'lista']);
    expect(b[0]).toMatchObject({ tramos: [{ texto: 'Total ' }, { texto: 'RD$ 10.00', negrita: true }] });
    expect(b[1]).toMatchObject({ tipo: 'tabla', filas: [[[{ texto: 'x' }], [{ texto: '1' }]]] });
  });

  it('en el PDF los enlaces quedan como texto', () => {
    const [b] = aBloques('Mira [Libro diario](/contabilidad/libro-diario) ahora');
    expect((b as { tramos: { texto: string }[] }).tramos.map((t) => t.texto).join('')).toBe('Mira Libro diario ahora');
  });

  it('una tabla de 6 filas o más es «grande»; una respuesta corta no', () => {
    const fila = '| x | 1 |\n';
    expect(esRespuestaGrande(`| A | B |\n| --- | --- |\n${fila.repeat(6)}`)).toBe(true);
    expect(esRespuestaGrande('Vendiste **RD$ 10.00**.')).toBe(false);
    expect(esRespuestaGrande('a'.repeat(1600))).toBe(true);
  });

  it('reconoce cuándo se pide un PDF', () => {
    for (const q of ['ponlo en PDF', 'dame las ventas del mes en pdf', 'quiero descargar el reporte', 'imprimir esto', 'exporta eso']) {
      expect(pidePdf(q), q).toBe(true);
    }
    expect(pidePdf('¿cuánto vendí este mes?')).toBe(false);
  });
});

describe('contexto de la conversación', () => {
  it('«¿dónde puedo verla?» devuelve los enlaces de la respuesta anterior, sin IA', async () => {
    const { tools } = herramientasFalsas({});
    const previa = 'La última factura recibida es de **Jade**, por RD$ 649.99. Puedes verla aquí: [Facturas por revisar](/dashboard/gastos)';
    const r = await responderLocal('donde puedo verla?', tools, { previa });
    expect(r?.intencion).toBe('contexto');
    expect(r?.respuesta).toContain('[Facturas por revisar](/dashboard/gastos)');
  });

  it('sin enlaces previos no inventa: lo deja a la IA', async () => {
    const { tools } = herramientasFalsas({});
    expect(await responderLocal('donde puedo verla?', tools, { previa: 'Vendiste RD$ 10.00.' })).toBeNull();
  });

  it('«última factura recibida» consulta compras, no ventas', async () => {
    const { tools, llamadas } = herramientasFalsas({ listar_gastos_compras: { registros: [] } });
    const r = await responderLocal('cual fue la ultima factura recibida', tools, { hoy: '2026-10-13' });
    expect(r?.intencion).toBe('ultima-compra');
    expect(llamadas[0].nombre).toBe('listar_gastos_compras');
    expect(r?.respuesta).toContain('](/dashboard/gastos)');
  });

  it('«última factura» enlaza a la factura real', async () => {
    const { tools } = herramientasFalsas({
      buscar_facturas: { facturas: [{ numero: '', cliente: 'Manuel', total: 22000, fecha: '2026-10-08', estado: 'BORRADOR', enlace: '/dashboard/facturas/3985' }] },
    });
    const r = await responderLocal('cual fue la ultima factura', tools, { hoy: '2026-10-13' });
    expect(r?.respuesta).toContain('](/dashboard/facturas/3985)');
  });
});


// ── Motor de búsqueda por API y enlaces de registro ─────────────────────────

import { apiFalsa, ErrorApi } from '@/lib/asistente/api';
import { registrarEnlacesDeHerramientas } from '@/lib/asistente/enlaces';

describe('búsqueda de facturas por la API', () => {
  const FACTURAS = {
    docs: [
      { id: 3985, encf: null, codigo: 'BOR-31-MS4SG49S', tipoEcf: '31', estado: 'BORRADOR', razonSocialComprador: 'Manuel Campusano Bello', montoTotal: 2200000, pagado: 0, moraPendiente: 0, fechaEmision: '2026-10-08T00:00:00' },
      { id: 3984, encf: 'E310000000045', codigo: 'F-45', tipoEcf: '31', estado: 'ACEPTADO', razonSocialComprador: 'Manolo Acosta', montoTotal: 700000, pagado: 700000, moraPendiente: 0, fechaEmision: '2026-10-07T00:00:00' },
    ],
    total: 2,
  };

  it('usa /api/facturas con los filtros de la pantalla y trae el enlace por id', async () => {
    const { api, llamadas } = apiFalsa({ '/api/facturas': FACTURAS });
    const h = crearHerramientas(contextoDePrueba(1, { api }), []);
    const r = await ejecutar(h.buscar_facturas, { q: 'Campusano', estado: 'BORRADOR', limite: 5 }) as {
      facturas: { enlace: string; total: number; estadoPago: string }[]; coinciden: number;
    };
    expect(llamadas[0]).toMatchObject({ ruta: '/api/facturas', params: { search: 'Campusano', estado: 'BORRADOR' } });
    expect(r.facturas[0]).toMatchObject({ enlace: '/dashboard/facturas/3985', total: 22000, estadoPago: 'PENDIENTE' });
    expect(r.facturas[1]).toMatchObject({ enlace: '/dashboard/facturas/3984', estadoPago: 'PAGADA' });
    expect(r.coinciden).toBe(2);
  });

  it('el estado de pago se filtra sobre lo que trajo la API', async () => {
    const { api } = apiFalsa({ '/api/facturas': FACTURAS });
    const h = crearHerramientas(contextoDePrueba(1, { api }), []);
    const r = await ejecutar(h.buscar_facturas, { estadoPago: 'PAGADA', limite: 5 }) as { facturas: { numero: string }[]; coinciden: number };
    expect(r.coinciden).toBe(1);
    expect(r.facturas[0].numero).toBe('E310000000045');
  });

  it('si la API falla, la herramienta lo dice en vez de inventar datos', async () => {
    const { api } = apiFalsa({});
    const h = crearHerramientas(contextoDePrueba(1, { api }), []);
    const r = await ejecutar(h.buscar_facturas, { limite: 5 }) as { error: string };
    expect(r.error).toMatch(/No pude consultar las facturas/);
    const sinPermiso = { async get() { throw new ErrorApi(403, '/api/facturas'); } };
    const h2 = crearHerramientas(contextoDePrueba(1, { api: sinPermiso }), []);
    expect(((await ejecutar(h2.buscar_facturas, { limite: 5 })) as { error: string }).error).toMatch(/no tiene acceso/);
  });
});

describe('enlaces de registro: el número de factura NO es el id', () => {
  it('el enlace armado con el número (el error real) se descarta; el que dio la API se conserva', () => {
    const permitidos = new Set(['/dashboard/facturas/3985']);
    const malo = sanitizarEnlaces('Puedes verla [aquí](http://localhost:3000/dashboard/facturas/0100000216).', permitidos);
    expect(malo.texto).not.toContain('0100000216)');
    expect(malo.descartados).toEqual(['http://localhost:3000/dashboard/facturas/0100000216']);

    const bueno = sanitizarEnlaces('Factura [Manuel](/dashboard/facturas/3985)', permitidos);
    expect(bueno.texto).toBe('Factura [Manuel](/dashboard/facturas/3985)');
  });

  it('solo valen los enlaces de registro que una herramienta entregó en el turno', async () => {
    const { api } = apiFalsa({ '/api/facturas': { docs: [{ id: 3985, encf: null, codigo: 'BOR', tipoEcf: '31', estado: 'BORRADOR', montoTotal: 100, pagado: 0 }], total: 1 } });
    const turno = new Set<string>();
    const tools = registrarEnlacesDeHerramientas(
      crearHerramientas(contextoDePrueba(1, { api }), []) as Record<string, unknown>, turno,
    ) as Record<string, unknown>;
    await ejecutar(tools.buscar_facturas, { limite: 5 });
    expect([...turno]).toContain('/dashboard/facturas/3985');
    expect(rutaEsReal('/dashboard/facturas/3985', turno)).toBe(true);
    expect(rutaEsReal('/dashboard/facturas/3986', turno)).toBe(false);
    expect(rutaEsReal('/dashboard/facturas/0100000216', turno)).toBe(false);
  });
});

describe('cliente de la API', () => {
  it('no deja llamar nada fuera de /api/', async () => {
    const { crearClienteApi } = await import('@/lib/asistente/api');
    const c = crearClienteApi({ origen: 'http://localhost:3000', cookie: 'session=x' });
    await expect(c.get('/dashboard/facturas')).rejects.toMatchObject({ status: 400 });
    await expect(c.get('/api/../etc/passwd')).rejects.toMatchObject({ status: 400 });
    await expect(c.get('https://evil.com/api/x')).rejects.toMatchObject({ status: 400 });
  });
});

describe('precisión de la búsqueda de facturas', () => {
  it('suma TODO lo que coincide aunque la API entregue 200 por página', async () => {
    const fila = (id: number) => ({ id, encf: null, codigo: `BOR-${id}`, tipoEcf: '31', estado: 'BORRADOR', montoTotal: 10000, pagado: 0, createdAt: `2026-01-01T00:00:${String(id % 60).padStart(2, '0')}` });
    const { api, llamadas } = apiFalsa({
      '/api/facturas': (p) => {
        const off = Number(p.offset ?? 0);
        const n = Math.max(0, Math.min(200, 450 - off));
        return { docs: Array.from({ length: n }, (_, i) => fila(off + i + 1)), total: 450 };
      },
    });
    const h = crearHerramientas(contextoDePrueba(1, { api }), []);
    const r = await ejecutar(h.buscar_facturas, { estado: 'BORRADOR', limite: 5 }) as { coinciden: number; sumaTotal: number; parcial: boolean };
    expect(llamadas.map((l) => l.params.offset)).toEqual([0, 200, 400]);
    expect(r.coinciden).toBe(450);
    expect(r.sumaTotal).toBe(450 * 100);
    expect(r.parcial).toBe(false);
  });

  it('prueba también sin tildes y une sin repetir facturas', async () => {
    const { api, llamadas } = apiFalsa({
      '/api/facturas': (p) => (p.search === 'Mendez'
        ? { docs: [{ id: 7, encf: 'E31', codigo: 'F', tipoEcf: '31', estado: 'ACEPTADO', montoTotal: 500, pagado: 0, createdAt: '2026-02-01' }], total: 1 }
        : { docs: [], total: 0 }),
    });
    const h = crearHerramientas(contextoDePrueba(1, { api }), []);
    const r = await ejecutar(h.buscar_facturas, { q: 'Méndez', limite: 5 }) as { coinciden: number; facturas: { enlace: string }[] };
    expect(llamadas.map((l) => l.params.search).sort()).toEqual(['Mendez', 'Méndez']);
    expect(r.coinciden).toBe(1);
    expect(r.facturas[0].enlace).toBe('/dashboard/facturas/7');
  });
});
