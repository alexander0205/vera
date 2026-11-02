/**
 * Auditoría de las rutas de la API que reciben ids en el cuerpo o modifican datos.
 *
 * Hallazgos que cierran estas pruebas (ver docs/asistente-politicas.md):
 *  - ids de OTRA empresa aceptados en el cuerpo (cliente, almacén, terminal, mesa, categoría…);
 *  - rutas de cobro, certificado, plan, WhatsApp y recurrentes sin comprobar el permiso del rol;
 *  - tareas programadas que se podían llamar con «Bearer undefined» si faltaba el secreto.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';

const RAIZ = process.cwd();
const API = join(RAIZ, 'app', 'api');
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8').replace(/\r\n/g, '\n');

function rutas(dir = API, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rutas(p, acc);
    else if (e.name === 'route.ts') acc.push(p);
  }
  return acc;
}
const rel = (p: string) => p.slice(API.length).replace(/\\/g, '/').replace('/route.ts', '');

// ── Tareas programadas ──────────────────────────────────────────────────────

describe('secreto de las tareas programadas', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });

  it('sin secreto configurado ninguna llamada es válida, ni «Bearer undefined»', () => {
    delete process.env.CRON_SECRET;
    for (const h of ['Bearer undefined', 'Bearer ', 'Bearer', '', null, undefined, 'Bearer null']) expect(llamadaDeCronValida(h as never), String(h)).toBe(false);
  });

  it('un secreto corto no se acepta (configuración descuidada)', () => {
    process.env.CRON_SECRET = 'abc';
    expect(llamadaDeCronValida('Bearer abc')).toBe(false);
  });

  it('con secreto bueno: solo el exacto', () => {
    process.env.CRON_SECRET = 'un-secreto-largo-de-prueba-1234';
    expect(llamadaDeCronValida('Bearer un-secreto-largo-de-prueba-1234')).toBe(true);
    for (const h of ['Bearer un-secreto-largo-de-prueba-123', 'Bearer un-secreto-largo-de-prueba-12345', 'bearer un-secreto-largo-de-prueba-1234', 'un-secreto-largo-de-prueba-1234', '']) {
      expect(llamadaDeCronValida(h), h).toBe(false);
    }
  });

  it('ninguna ruta compara el secreto a mano: todas usan la función', () => {
    for (const f of rutas()) {
      const s = readFileSync(f, 'utf8');
      expect(s.includes('!== `Bearer ${process.env.CRON_SECRET}`'), rel(f)).toBe(false);
    }
    for (const e of readdirSync(join(API, 'cron'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      expect(leer('app', 'api', 'cron', e.name, 'route.ts'), e.name).toContain('llamadaDeCronValida(');
    }
    expect(leer('app', 'api', 'admin', 'migrate', 'route.ts')).toContain('llamadaDeCronValida(');
  });
});

// ── Referencias de otra empresa ─────────────────────────────────────────────

describe('toda referencia del cuerpo se valida contra la empresa', () => {
  const casos: [string, string[], string[]][] = [
    ['ecf/emitir', ['app/api/ecf/emitir/route.ts'], ['clientId: data.clientId', 'almacenId: data.almacenId', 'vendedorId: data.vendedorId', 'listaPreciosId: data.listaPreciosId']],
    ['cotizaciones', ['app/api/cotizaciones/route.ts'], ['clientId:', 'productoIds:']],
    ['cuentas-por-cobrar/historica', ['app/api/cuentas-por-cobrar/historica/route.ts'], ['clientId: d.clientId']],
    ['pos/mesas', ['app/api/pos/mesas/route.ts'], ['terminalId: parsed.data.terminalId']],
    ['pos/comandas', ['app/api/pos/comandas/route.ts'], ['terminalId: parsed.data.terminalId', 'mesaId: parsed.data.mesaId', 'miembroUserId', 'turnoId']],
    ['pos/comandas/[id]', ['app/api/pos/comandas/[id]/route.ts'], ['miembroUserId', 'productoIds']],
    ['cuentas-por-cobrar/[docId]/gestion', ['app/api/cuentas-por-cobrar/[docId]/gestion/route.ts'], ['miembroUserId: body.responsableUserId']],
    ['productos', ['app/api/productos/route.ts', 'app/api/productos/[id]/route.ts'], ['categoriaId: parsed.data.categoriaId']],
    ['listas-precios/[id]/items', ['app/api/listas-precios/[id]/items/route.ts'], ['productoIds: [parsed.data.productoId]']],
    ['inventario/ajuste', ['app/api/inventario/ajuste/route.ts'], ['almacenId: almacenId']],
    ['compras/local', ['app/api/compras/local/route.ts'], ['almacenId: parsed.data.almacenId', 'productoIds:']],
    ['facturas-recurrentes', ['app/api/facturas-recurrentes/route.ts', 'app/api/facturas-recurrentes/[id]/route.ts'], ['clientId: typeof body.clientId', 'productoIds:']],
    ['metricas/factura-tiempo', ['app/api/metricas/factura-tiempo/route.ts'], ['ecfDocumentId: docId']],
  ];
  it.each(casos)('%s', (_n, archivos, trozos) => {
    for (const a of archivos) {
      const s = leer(...a.split('/'));
      expect(s, a).toContain('validarReferenciasDeEmpresa(');
      if (a === archivos[0]) for (const t of trozos) expect(s, `${a}: ${t}`).toContain(t);
    }
  });

  it('las consultas que unen clientes o productos filtran por empresa', () => {
    expect(leer('app', 'api', 'pdf', 'factura', 'preview', 'route.ts')).toContain('eq(clients.teamId, teamId)');
    expect(leer('app', 'api', 'listas-precios', '[id]', 'items', 'route.ts')).toContain('eq(products.teamId, teamId)');
    expect(leer('app', 'api', 'facturas-recurrentes', 'route.ts')).toContain('eq(clients.teamId, facturasRecurrentes.teamId)');
  });

  it('el validador consulta cada tabla con el teamId de la sesión', () => {
    const f = leer('lib', 'seguridad', 'pertenencia.ts');
    for (const t of ['clients', 'almacenes', 'vendedores', 'listasPrecios', 'posTerminales', 'mesas', 'cajaTurnos', 'categorias', 'ecfDocuments', 'products']) {
      expect(f, t).toContain(`eq(${t}.teamId, teamId)`);
    }
    expect(f).toContain('eq(teamMembers.teamId, teamId)');
  });
});

// ── Permisos del rol ────────────────────────────────────────────────────────

describe('las acciones sensibles comprueban el permiso del rol', () => {
  const gestionar = "puedeEnEmpresa(user, teamId, 'configuracion:gestionar')";
  const exigen: [string, string][] = [
    ['app/api/pagos/route.ts', 'puedeCobrar(user, teamId)'],
    ['app/api/facturas/[id]/pago/route.ts', 'puedeCobrar(user, teamId)'],
    ['app/api/facturas-recurrentes/[id]/generar/route.ts', "requirePermission('facturas:crear')"],
    ['app/api/equipo/certificado/route.ts', gestionar],
    ['app/api/stripe/change-plan/route.ts', gestionar],
    ['app/api/whatsapp/conectar/route.ts', gestionar],
    ['app/api/whatsapp/enlazar/route.ts', gestionar],
    ['app/api/whatsapp/estado/route.ts', gestionar],
  ];
  it.each(exigen)('%s', (archivo, trozo) => {
    expect(leer(...archivo.split('/'))).toContain(trozo);
  });

  it('el certificado y el plan lo comprueban en TODAS sus acciones que modifican', () => {
    for (const ruta of [['equipo', 'certificado'], ['stripe', 'change-plan']]) {
      const s = leer('app', 'api', ...ruta, 'route.ts');
      expect(s.split("puedeEnEmpresa(user, teamId, 'configuracion:gestionar')").length - 1, ruta.join('/')).toBeGreaterThanOrEqual(2);
    }
  });

  it('forzar la descarga del padrón es solo del administrador de la plataforma', () => {
    expect(leer('app', 'api', 'rnc', 'sync', 'route.ts')).toContain("=== 'true' && user.platformRole === 'admin'");
  });

  it('la vista previa técnica de e-CF pide sesión', () => {
    expect(leer('app', 'api', 'ecf', 'preview', 'route.ts')).toContain('await getUser()');
  });
});

// ── Inventario de rutas que modifican datos ─────────────────────────────────

describe('inventario de rutas que modifican datos', () => {
  const GUARDA = /requireModuleAndPermission|requirePermission|requireImport|hasPermission|userCanForTeam|autorizar\w+|exigir\w+|requireAdmin|requirePlatform|isPlatformAdmin|evaluarAcceso|requireModule|assertPermission|requireSuperAdmin|requireOwner|puede\w+\(|permiso\b/;
  const SESION = /getUser\(|getTeamIdForUser\(|getSession|getTeamRoleForUser/;

  /** Públicas por diseño (enlace con token, webhooks, formularios) o protegidas por una función propia que el contador no reconoce. Revisadas una a una. */
  const REVISADAS_SIN_SESION = new Set([
    '/admin/migrate', '/administracion-escolar/pagos', '/analytics/vitals', '/auth/forgot-password', '/auth/reset-password',
    '/compras/local', '/contabilidad/config', '/contabilidad/cuentas', '/contabilidad/cuentas/[id]', '/contabilidad/libro-diario', '/contacto',
    '/cuentas-por-cobrar/[docId]/gestion',
    '/dgii/v1/[token]/fe/aprobacioncomercial/api/ecf', '/dgii/v1/[token]/fe/autenticacion/api/validacioncertificado',
    '/dgii/v1/[token]/fe/recepcion/api/ecf', '/dgii/[rnc]/aprobacioncomercial', '/dgii/[rnc]/recepcion',
    '/documentos-familia/[token]', '/firma/[token]', '/formularios-publicos/[slug]', '/formularios-publicos/[slug]/borrador',
    '/formularios-publicos/[slug]/borrador/[token]', '/formularios-publicos/[slug]/borrador/[token]/archivo', '/fotos/captura/[token]',
    '/habilitacion/set-pruebas/runs/[runId]', '/horas/[token]', '/pagar/[token]/abierto', '/pagar/[token]/comprobante', '/pagos/link/[token]/iniciar',
    '/pagos/link/[token]/simular', '/stripe/webhook', '/subir-factura/[token]', '/user', '/whatsapp/webhook/[teamId]',
    '/zero-tickets/agent/canned-responses', '/zero-tickets/agent/canned-responses/[id]', '/zero-tickets/agent/presence',
    '/zero-tickets/agent/tickets/[id]/claim', '/zero-tickets/agent/tickets/[id]/hold', '/zero-tickets/agent/tickets/[id]/reply',
    '/zero-tickets/agent/tickets/[id]/request-screenshot', '/zero-tickets/agent/tickets/[id]/status', '/zero-tickets/agent/tickets/[id]/typing',
    '/zero-tickets/calls', '/zero-tickets/calls/[id]/end', '/zero-tickets/calls/[id]/grabacion', '/zero-tickets/calls/[id]/signal',
  ]);
  /** Solo sesión: propias de la persona, de la plataforma (se comprueba el rol dentro) o sin datos de la empresa. */
  const REVISADAS_SOLO_SESION = new Set([
    '/admin/empresas/[id]/set-pruebas/aprobaciones', '/admin/empresas/[id]/set-pruebas/runs', '/admin/empresas/[id]/simulacion/restart',
    '/admin/empresas/[id]/simulacion/start', '/auth/2fa/disable', '/auth/2fa/setup', '/auth/send-verification', '/ecf/preview',
    // El WhatsApp de la propia persona, para avisarle de sus tareas (29-10-2026).
    '/cuenta/whatsapp',
    '/empresa', '/empresa/switch', '/equipo/miembros/[id]', '/metricas/factura-tiempo', '/notes', '/novedades/vistas',
    '/pdf/factura/preview', '/rnc/sync', '/user', '/zero-tickets/tickets/rating', '/zero-tickets/tickets', '/zero-tickets/tickets/typing',
  ]);

  it('toda ruta nueva que modifica datos trae una guarda o se revisa y se anota aquí', () => {
    const sinNada: string[] = [];
    const soloSesion: string[] = [];
    for (const f of rutas()) {
      const s = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
      for (const parte of s.split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/)) {
        const m = parte.match(/^export async function (POST|PUT|PATCH|DELETE)\b/);
        if (!m) continue;
        const cuerpo = parte.slice(0, 6000);
        if (GUARDA.test(cuerpo)) continue;
        (SESION.test(cuerpo) ? soloSesion : sinNada).push(rel(f));
      }
    }
    const nuevasSinNada = [...new Set(sinNada)].filter((r) => !REVISADAS_SIN_SESION.has(r));
    const nuevasSoloSesion = [...new Set(soloSesion)].filter((r) => !REVISADAS_SOLO_SESION.has(r) && !REVISADAS_SIN_SESION.has(r));
    expect(nuevasSinNada, 'rutas que modifican sin sesión ni permiso: revísalas').toEqual([]);
    expect(nuevasSoloSesion, 'rutas que modifican con solo sesión (sin permiso): revísalas').toEqual([]);
  });
});
