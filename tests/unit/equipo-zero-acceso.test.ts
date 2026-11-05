import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La compuerta de las rutas de administración y el «fallo cerrado» del dueño.
 */

const m = vi.hoisted(() => ({ getUser: vi.fn(), filas: [] as { userId: number }[], falla: false }));

vi.mock('@/lib/db/queries', () => ({ getUser: m.getUser }));
vi.mock('@/lib/db/drizzle', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => { if (m.falla) throw new Error('relation "platform_owners" does not exist'); return m.filas; } }) }) }) },
}));

import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { esDuenoDePlataforma } from '@/lib/auth/equipo-zero';

const peticion = (cabeceras: Record<string, string>) => new Request('https://app.zero.com.do/api/admin/equipo', { method: 'POST', headers: cabeceras });

describe('requirePlatformAdmin', () => {
  beforeEach(() => m.getUser.mockReset());

  it('sin sesión: 401', async () => {
    m.getUser.mockResolvedValue(null);
    const r = await requirePlatformAdmin();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it('una cuenta normal: 403', async () => {
    m.getUser.mockResolvedValue({ id: 5, platformRole: 'member' });
    const r = await requirePlatformAdmin();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it('un rol que solo se parece a admin tampoco pasa', async () => {
    for (const rol of ['Admin', 'administrator', 'superadmin', '', 'admin ']) {
      m.getUser.mockResolvedValue({ id: 5, platformRole: rol });
      const r = await requirePlatformAdmin();
      expect(r.ok, JSON.stringify(rol)).toBe(false);
    }
  });

  it('un administrador pasa', async () => {
    m.getUser.mockResolvedValue({ id: 1, platformRole: 'admin' });
    const r = await requirePlatformAdmin();
    expect(r.ok).toBe(true);
  });
});

describe('esDuenoDePlataforma', () => {
  beforeEach(() => { m.filas = []; m.falla = false; });

  it('está en la tabla: dueño', async () => {
    m.filas = [{ userId: 1 }];
    expect(await esDuenoDePlataforma(1)).toBe(true);
  });

  it('no está: no es dueño', async () => {
    m.filas = [];
    expect(await esDuenoDePlataforma(2)).toBe(false);
  });

  it('FALLA CERRADO: si la tabla no existe (migración sin correr) nadie es dueño', async () => {
    m.falla = true;
    expect(await esDuenoDePlataforma(1)).toBe(false);
  });
});

describe('origenValido (peticiones que cambian algo)', () => {
  it('nace en este mismo sitio: sí', () => {
    expect(origenValido(peticion({ origin: 'https://app.zero.com.do', host: 'app.zero.com.do' }))).toBe(true);
  });

  it('con proxy: manda el host y el protocolo reenviados', () => {
    expect(origenValido(peticion({ origin: 'https://app.zero.com.do', host: 'interno', 'x-forwarded-host': 'app.zero.com.do', 'x-forwarded-proto': 'https' }))).toBe(true);
    expect(origenValido(peticion({ origin: 'http://app.zero.com.do', host: 'interno', 'x-forwarded-host': 'app.zero.com.do', 'x-forwarded-proto': 'https' }))).toBe(false);
  });

  it('otro sitio: no', () => {
    expect(origenValido(peticion({ origin: 'https://malo.example', host: 'app.zero.com.do' }))).toBe(false);
    expect(origenValido(peticion({ origin: 'https://app.zero.com.do.malo.example', host: 'app.zero.com.do' }))).toBe(false);
  });

  it('un Origin ilegible: no', () => {
    expect(origenValido(peticion({ origin: 'null', host: 'app.zero.com.do' }))).toBe(false);
    expect(origenValido(peticion({ origin: 'no es una url', host: 'app.zero.com.do' }))).toBe(false);
  });

  it('sin Origin solo vale si el navegador declara que es del mismo sitio', () => {
    expect(origenValido(peticion({ host: 'app.zero.com.do' }))).toBe(false);
    expect(origenValido(peticion({ host: 'app.zero.com.do', 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(origenValido(peticion({ host: 'app.zero.com.do', 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(origenValido(peticion({ host: 'app.zero.com.do', 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });
});

describe('lo que sostiene el acceso de administrador fuera del panel (lo que dice el código)', () => {
  const src = readFileSync(join(process.cwd(), 'app', '(login)', 'actions.ts'), 'utf8');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export const ${nombre} =`);
    const j = src.indexOf('\nexport const ', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };

  it('cambiar el correo deshace la verificación y anula los enlaces que estaban en el aire', () => {
    const c = cuerpo('updateAccount');
    expect(c).toContain('emailVerified: false');
    expect(c).toContain('passwordResetTokens');
    expect(c).toContain('emailVerificationTokens');
    expect(c).toContain('db.transaction(');
  });

  it('una cuenta de administrador no se borra: ni antes de la contraseña ni, si cambió de rol a medias, al escribir', () => {
    const c = cuerpo('deleteAccount');
    expect(c).toMatch(/user\.platformRole === 'admin'/);
    expect(c).toContain("platformRole} <> 'admin'");
    // Si el UPDATE protegido no tocó ninguna fila, no se sigue con la membresía ni con la sesión.
    expect(c).toContain('.returning({ id: users.id })');
    expect(c.indexOf('if (!borrada)')).toBeGreaterThan(-1);
    expect(c.indexOf('if (!borrada)')).toBeLessThan(c.indexOf('delete(teamMembers)'));
    expect(c.indexOf('if (!borrada)')).toBeLessThan(c.indexOf('clearSession()'));
  });

  it('el enlace de restablecer se consume de forma atómica y no se gasta hash con enlaces inventados', () => {
    const r = readFileSync(join(process.cwd(), 'app', 'api', 'auth', 'reset-password', 'route.ts'), 'utf8');
    expect(r).toContain('.returning({ userId: passwordResetTokens.userId })');
    expect(r.indexOf('if (!vigente)')).toBeGreaterThan(-1);
    expect(r.indexOf('if (!vigente)')).toBeLessThan(r.indexOf('hashPassword(password)'));
    expect(r.indexOf('hashPassword(password)')).toBeLessThan(r.indexOf('db.transaction('));
  });
});
