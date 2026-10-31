/**
 * GET/POST /api/webhooks — el secret HMAC no se filtra en el listado.
 *
 * Antes el GET solo pedía sesión y devolvía `select()` entero: cualquier
 * miembro de la empresa, sin permiso de configuración, se llevaba el secret
 * con el que se firman los envíos y podía falsificar webhooks.
 *
 *  · el GET exige `configuracion:gestionar`, igual que el POST;
 *  · el listado elige columnas y del secret solo saca los últimos 4 (en SQL);
 *  · el secret completo sale una única vez, en la respuesta del POST.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { outboundWebhooks } from '@/lib/db/schema';

vi.mock('@/lib/auth/api-guard', () => ({
  requirePermission: vi.fn(async () => ({ ok: true, teamId: 1, user: { id: 2 }, teamRole: 'owner' })),
}));
vi.mock('@/lib/security/ssrf', () => ({ validateOutboundUrl: vi.fn(async () => ({ ok: true })) }));

const filas = { listado: [] as unknown[], insertada: null as unknown };
vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: async () => filas.listado }) })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => [(filas.insertada = { id: 9, activo: true, ultimoDisparo: null, ultimoEstatus: null, ...v })],
      }),
    })),
  },
}));

const { requirePermission } = await import('@/lib/auth/api-guard');
const { db } = await import('@/lib/db/drizzle');
const { GET, POST } = await import('@/app/api/webhooks/route');

beforeEach(() => {
  vi.mocked(requirePermission).mockClear();
  vi.mocked(db.select).mockClear();
  filas.listado = [];
  filas.insertada = null;
});

describe('GET /api/webhooks', () => {
  it('sin permiso de configuración no toca la base', async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('configuracion:gestionar');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('elige columnas: el secret completo no se pide, solo sus últimos 4', async () => {
    filas.listado = [{ id: 1, nombre: 'ERP', url: 'https://erp.test/hook', secretUltimos4: 'abcd' }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith('configuracion:gestionar');

    const seleccion = vi.mocked(db.select).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(seleccion).toBeDefined();
    expect(seleccion).not.toHaveProperty('secret');
    expect(Object.values(seleccion)).not.toContain(outboundWebhooks.secret);
    expect(seleccion).toHaveProperty('secretUltimos4');

    expect(await res.json()).toEqual(filas.listado);
  });
});

describe('POST /api/webhooks', () => {
  it('devuelve el secret completo una sola vez, con sus últimos 4 para la lista', async () => {
    const res = await POST(new NextRequest('http://localhost/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'ERP', url: 'https://erp.test/hook', eventos: ['ecf.emitido'] }),
    }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.secret).toMatch(/^[0-9a-f]{48}$/);
    expect(j.secretUltimos4).toBe(j.secret.slice(-4));
    expect(j.secret).toBe((filas.insertada as { secret: string }).secret);
  });
});
