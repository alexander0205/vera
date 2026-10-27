import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/queries', () => ({ getUser: vi.fn(), getTeamIdForUser: vi.fn(), getTeamRoleForUser: vi.fn() }));
vi.mock('@/lib/auth/permissions', () => ({ userCanForTeam: vi.fn() }));

import { correoPermitido } from '@/lib/asistente/acceso';

/** Mientras se prueba en producción, el asistente es solo para una lista de correos. */
describe('quién ve el asistente', () => {
  it('sin la variable, solo el dueño de Zero (sin importar mayúsculas)', () => {
    expect(correoPermitido('Alexander.Ferreras@yisraeltech.com', undefined)).toBe(true);
    expect(correoPermitido('directora@colegio.com', undefined)).toBe(false);
    expect(correoPermitido(null, undefined)).toBe(false);
  });

  it('con una lista, los de la lista; con «*», todos', () => {
    expect(correoPermitido('ana@x.com', 'ana@x.com, luis@x.com')).toBe(true);
    expect(correoPermitido('pedro@x.com', 'ana@x.com, luis@x.com')).toBe(false);
    expect(correoPermitido('pedro@x.com', '*')).toBe(true);
  });
});
