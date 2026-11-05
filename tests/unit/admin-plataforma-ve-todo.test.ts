import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El equipo de Zero (users.platform_role = 'admin') ve y opera en TODAS las
 * empresas. Lo que se prueba aquí es la función central y los bloqueos que
 * antes lo dejaban fuera: módulos no activos, muro del onboarding, rol de
 * empresa, y que sus acciones dejen rastro con su usuario real.
 */

const filas = vi.hoisted(() => ({ team: [] as unknown[] }));
const auditoria = vi.hoisted(() => ({ logAudit: vi.fn() }));
const nav = vi.hoisted(() => ({ redirect: vi.fn((ruta: string) => { throw new Error(`REDIRECT:${ruta}`); }) }));
const consultas = vi.hoisted(() => ({
  getUser: vi.fn(),
  getTeamForUser: vi.fn(),
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => filas.team }) }) }),
  },
}));
vi.mock('@/lib/auth/permissions', () => ({
  // Rol sin ningún permiso de módulo: solo el bypass de plataforma puede abrir algo.
  getEffectivePermissions: vi.fn(async () => []),
}));
vi.mock('@/lib/audit', () => auditoria);
vi.mock('next/navigation', () => nav);
vi.mock('@/lib/db/queries', () => consultas);

import {
  esAdminPlataforma, permisoEsDeLectura, rolEfectivoEnEmpresa, ROL_EFECTIVO_PLATAFORMA,
} from '@/lib/auth/plataforma';
import { userCan, ALL_PERMISSIONS } from '@/lib/config/roles';
import { MODULES } from '@/lib/config/modules';
import { getUserModules, userHasModule } from '@/lib/auth/modules';
import { auditarAccionPlataforma } from '@/lib/auth/plataforma-auditoria';
import { exigirOnboarding } from '@/lib/onboarding/muro';

beforeEach(() => {
  vi.clearAllMocks();
  filas.team = [{ habilitados: ['facturacion'], override: null, planName: null, adicionales: [] }];
});

describe('esAdminPlataforma: la única definición', () => {
  it('solo platform_role = admin', () => {
    expect(esAdminPlataforma({ platformRole: 'admin' })).toBe(true);
    expect(esAdminPlataforma({ platformRole: 'member' })).toBe(false);
    expect(esAdminPlataforma({ platformRole: 'ADMIN' })).toBe(false);
    expect(esAdminPlataforma({ platformRole: null })).toBe(false);
    expect(esAdminPlataforma({})).toBe(false);
    expect(esAdminPlataforma(null)).toBe(false);
    expect(esAdminPlataforma(undefined)).toBe(false);
  });

  it('ser owner o admin DENTRO de una empresa no lo convierte en admin de plataforma', () => {
    // El rol de la empresa no es un campo que esta función mire.
    expect(esAdminPlataforma({ platformRole: 'member', ...{ role: 'owner' } })).toBe(false);
    expect(esAdminPlataforma({ platformRole: 'member', ...{ teamRole: 'admin' } })).toBe(false);
  });

  it('no depende de la base ni del cliente: el archivo es puro', () => {
    const fuente = readFileSync(join(process.cwd(), 'lib/auth/plataforma.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');   // sin comentarios
    expect(fuente).not.toMatch(/^import /m);
    expect(fuente).not.toMatch(/teamMembers|cookies\(/);
  });

  it('rol efectivo: el admin de plataforma actúa como propietario; el resto, el que tiene', () => {
    expect(rolEfectivoEnEmpresa({ platformRole: 'admin' }, null)).toBe(ROL_EFECTIVO_PLATAFORMA);
    expect(rolEfectivoEnEmpresa({ platformRole: 'admin' }, 'lector')).toBe('owner');
    expect(rolEfectivoEnEmpresa({ platformRole: 'member' }, 'lector')).toBe('lector');
    expect(rolEfectivoEnEmpresa({ platformRole: 'member' }, null)).toBeNull();
    expect(rolEfectivoEnEmpresa(null, 'owner')).toBe('owner');
  });

  it('lectura vs escritura de un permiso', () => {
    expect(permisoEsDeLectura('facturas:ver')).toBe(true);
    expect(permisoEsDeLectura('reportes:exportar')).toBe(true);
    expect(permisoEsDeLectura('modulo:pos')).toBe(true);
    expect(permisoEsDeLectura('facturas:crear')).toBe(false);
    expect(permisoEsDeLectura('facturas:emitir-dgii')).toBe(false);
    expect(permisoEsDeLectura('pagos:registrar')).toBe(false);
  });
});

describe('permisos por rol: el admin de plataforma pasa todos; los demás no', () => {
  it('userCan(admin) es true para TODO el catálogo, aun sin rol en la empresa', () => {
    for (const p of ALL_PERMISSIONS) expect(userCan('admin', null, p)).toBe(true);
  });

  it('un miembro sin rol no tiene nada (no se escala)', () => {
    for (const p of ALL_PERMISSIONS) expect(userCan('member', null, p)).toBe(false);
    expect(userCan(null, undefined, 'facturas:ver')).toBe(false);
  });
});

describe('módulos: el admin de plataforma ve todos, activos o no', () => {
  it('empresa con solo facturación → el admin ve todos los módulos', async () => {
    expect(await getUserModules(1, 'admin', null)).toEqual([...MODULES]);
    expect(await userHasModule(1, 'admin', null, 'escolar')).toBe(true);
    expect(await userHasModule(1, 'admin', null, 'nomina')).toBe(true);
    expect(await userHasModule(1, 'admin', null, 'pos')).toBe(true);
  });

  it('el mismo caso para un miembro: el módulo no activo sigue cerrado (el cliente no gana nada)', async () => {
    expect(await userHasModule(1, 'member', 'owner', 'escolar')).toBe(false);
    expect(await userHasModule(1, 'member', 'owner', 'nomina')).toBe(false);
  });

  it('un miembro sin permiso de módulo no entra aunque la empresa lo tenga', async () => {
    expect(await getUserModules(1, 'member', 'lector')).toEqual([]);
  });
});

describe('muro del onboarding', () => {
  it('el admin de plataforma no es mandado a /bienvenida en una empresa sin terminar', async () => {
    consultas.getUser.mockResolvedValue({ id: 1, platformRole: 'admin', emailVerified: true });
    consultas.getTeamForUser.mockResolvedValue({ id: 9, onboardingCompletadoEn: null });
    await expect(exigirOnboarding()).resolves.toBeUndefined();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it('un miembro normal SÍ sigue obligado a terminarlo', async () => {
    consultas.getUser.mockResolvedValue({ id: 2, platformRole: 'member', emailVerified: true });
    consultas.getTeamForUser.mockResolvedValue({ id: 9, onboardingCompletadoEn: null });
    await expect(exigirOnboarding()).rejects.toThrow('REDIRECT:/bienvenida');
  });
});

describe('auditoría de lo que hace el equipo de Zero en una empresa', () => {
  const admin = { id: 7, email: 'soporte@ejemplo.test', platformRole: 'admin' };

  it('una acción que cambia algo queda con el usuario real y la empresa', () => {
    auditarAccionPlataforma(admin, 42, 'facturas:crear');
    expect(auditoria.logAudit).toHaveBeenCalledTimes(1);
    expect(auditoria.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 42, userId: 7, actor: 'soporte@ejemplo.test',
      action: 'ADMIN_PLATAFORMA_EN_EMPRESA', resource: 'permiso:facturas:crear',
    }));
  });

  it('leer no se audita', () => {
    auditarAccionPlataforma(admin, 42, 'facturas:ver');
    auditarAccionPlataforma(admin, 42, 'modulo:escolar');
    expect(auditoria.logAudit).not.toHaveBeenCalled();
  });

  it('un miembro normal no genera filas de plataforma', () => {
    auditarAccionPlataforma({ id: 8, email: 'x@ejemplo.test', platformRole: 'member' }, 42, 'facturas:crear');
    auditarAccionPlataforma(null, 42, 'facturas:crear');
    expect(auditoria.logAudit).not.toHaveBeenCalled();
  });
});

describe('las guardas centrales usan la función central', () => {
  const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it.each([
    'lib/auth/modules.ts',
    'lib/auth/permissions.ts',
    'lib/auth/pantallas.ts',
    'lib/auth/pantallas-proxy.ts',
    'lib/onboarding/muro.ts',
    'lib/config/roles.ts',
  ])('%s pregunta a esAdminPlataforma', (archivo) => {
    expect(leer(archivo)).toContain('esAdminPlataforma');
  });

  it('el guard de API deja rastro de lo que cambia el equipo de Zero', () => {
    expect(leer('lib/auth/api-guard.ts')).toContain('auditarAccionPlataforma(');
  });
});
