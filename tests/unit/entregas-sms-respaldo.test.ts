import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * Lo que pasa cuando Meta dice que el WhatsApp de hoy no llegó: con SMS de
 * respaldo la fila se queda como «fallido» para que la corrida siguiente mande
 * el SMS; sin él se suelta para reintentar el WhatsApp, como siempre.
 *
 * «Hoy» es el día de RD (UTC-4, sin horario de verano). Entre las 8 p. m. y la
 * medianoche UTC ya va por el día siguiente: el reloj está fijo para que estas
 * pruebas no dependan de la hora ni de la zona en que corren.
 */

const estado = vi.hoisted(() => ({
  pendientes: [] as unknown[],
  conSms: [] as { id: number }[],
  smsDelColegio: true,
  borrados: [] as number[],
  telefonos: [] as string[],
  acuse: 'fallido',
  fallidos: [] as { cargoId: number | null }[],
  condicion: null as unknown,
}));

vi.mock('drizzle-orm', async (original) => ({
  ...(await original<typeof import('drizzle-orm')>()),
  inArray: (_col: unknown, ids: number[]) => ({ __ids: ids }),
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condicion: unknown) => {
          estado.condicion = condicion;
          return Object.assign(Promise.resolve(estado.fallidos), { orderBy: async () => estado.pendientes });
        },
        innerJoin: () => ({ where: async () => estado.conSms }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: () => ({ where: async (c: { __ids: number[] }) => { estado.borrados.push(...c.__ids); } }),
  },
}));

vi.mock('@/lib/whatsapp/config', () => ({ resolverRemitente: async () => ({ apiKey: 'k' }) }));
vi.mock('@/lib/whatsapp/telefono', () => ({ aE164: (t: string) => t }));
vi.mock('@/lib/whatsapp/client', () => ({
  historialMensajes: async (_k: string, tel: string) => {
    estado.telefonos.push(tel);
    return { messages: [{ id: 'm1', deliveryStatus: estado.acuse, errorDelivery: '131026 sin WhatsApp' }] };
  },
}));
vi.mock('@/lib/administracion-escolar/canales', () => ({
  canalesDelColegio: async () => ({ correo: true, whatsapp: true, sms: estado.smsDelColegio }),
}));

import { ACUSES_FINALES, cargosConWhatsAppFallido, reconciliarEntregas } from '@/lib/administracion-escolar/entregas';

const aviso = (tipo: string, enviadoAt = new Date()) => ({
  id: 7, tipo, cargoId: 40, mensajeId: 'm1', destino: '18095551234', enviadoAt,
});

beforeEach(() => {
  // Solo la fecha: los mocks de arriba resuelven promesas y no deben quedarse esperando.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T14:00:00Z')); // 10:00 a. m. RD
  estado.pendientes = [];
  estado.conSms = [{ id: 40 }];
  estado.smsDelColegio = true;
  estado.borrados = [];
  estado.telefonos = [];
  estado.acuse = 'fallido';
  estado.fallidos = [];
  estado.condicion = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reconciliarEntregas: el día es el de RD, no el de UTC', () => {
  const NUEVE_PM_RD = new Date('2026-11-01T01:00:00Z'); // 31-10, ya 1-11 en UTC

  it('a las 9 p. m. suelta lo enviado esa noche: en UTC es mañana, en RD sigue siendo hoy', async () => {
    vi.setSystemTime(NUEVE_PM_RD);
    estado.pendientes = [aviso('antes-mora', new Date('2026-11-01T00:30:00Z'))]; // 8:30 p. m. RD
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([7]);
    expect(r.reintentables).toBe(1);
  });

  it('a las 9 p. m. suelta lo enviado esa mañana', async () => {
    vi.setSystemTime(NUEVE_PM_RD);
    estado.pendientes = [aviso('antes-mora', new Date('2026-10-31T12:00:00Z'))]; // 8:00 a. m. RD
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([7]);
    expect(r.reintentables).toBe(1);
  });

  it('a las 9 p. m. el aviso con SMS de respaldo se queda para el SMS', async () => {
    vi.setSystemTime(NUEVE_PM_RD);
    estado.pendientes = [aviso('al-vencer', new Date('2026-11-01T00:30:00Z'))];
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([]);
    expect(r).toMatchObject({ fallidos: 1, reintentables: 0 });
  });

  it('a las 8 a. m. no suelta lo de anoche a las 9 p. m.: en UTC es el mismo día, en RD ya es otro', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z')); // 1-11, 8:00 a. m. RD
    estado.pendientes = [aviso('antes-mora', NUEVE_PM_RD)];
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([]);
    expect(r).toMatchObject({ fallidos: 1, reintentables: 0 });
  });

  it('el día cambia a la medianoche de RD, no a la de UTC', async () => {
    vi.setSystemTime(new Date('2026-11-01T04:00:00Z')); // 1-11, 12:00 a. m. RD
    estado.pendientes = [aviso('antes-mora', new Date('2026-11-01T03:59:59Z'))]; // 31-10, 11:59:59 p. m. RD
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([]);
    expect(r.reintentables).toBe(0);
  });
});

describe('cargosConWhatsAppFallido', () => {
  it('compara el día de RD del envío, sin depender de la zona de la conexión', async () => {
    estado.fallidos = [{ cargoId: 40 }, { cargoId: null }];
    const cargos = await cargosConWhatsAppFallido(9, '2026-10-31');
    expect(cargos).toEqual(new Set([40]));

    const { sql, params } = new PgDialect().sqlToQuery(estado.condicion as never);
    expect(sql).toMatch(
      /\("admin_escolar_avisos_enviados"\."enviado_at" AT TIME ZONE 'UTC' AT TIME ZONE 'America\/Santo_Domingo'\)::date = \$\d+::date/,
    );
    expect(params).toContain('2026-10-31');
  });
});

describe('reconciliarEntregas: WhatsApp fallido de hoy', () => {
  it('el día que vence, con SMS encendido, la fila se queda para mandar el SMS', async () => {
    estado.pendientes = [aviso('al-vencer')];
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([]);
    expect(r).toMatchObject({ fallidos: 1, reintentables: 0 });
  });

  it('con el SMS apagado en el concepto se suelta para reintentar', async () => {
    estado.pendientes = [aviso('al-vencer')];
    estado.conSms = [];
    await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([7]);
  });

  it('con el SMS apagado en el colegio se suelta para reintentar', async () => {
    estado.pendientes = [aviso('al-vencer')];
    estado.smsDelColegio = false;
    await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([7]);
  });

  it('el día de la factura tampoco se suelta: le toca el SMS', async () => {
    estado.pendientes = [aviso('al-emitir')];
    await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([]);
  });

  it('los demás avisos se reintentan como siempre', async () => {
    estado.pendientes = [aviso('antes-mora')];
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([7]);
    expect(r.reintentables).toBe(1);
  });
});

describe('reconciliarEntregas: si lo leyeron', () => {
  it('«entregado» no es final: se vuelve a preguntar hasta que lo lean', () => {
    expect(ACUSES_FINALES).not.toContain('entregado');
    expect(ACUSES_FINALES).toContain('leido');
  });

  it('entregado y leído cuentan como que llegó', async () => {
    estado.pendientes = [aviso('al-vencer')];
    estado.acuse = 'leido';
    expect(await reconciliarEntregas(9)).toMatchObject({ entregados: 1, fallidos: 0 });
  });

  it('por la tarde no suelta lo que falló: ya no hay otra corrida que lo reintente', async () => {
    estado.pendientes = [aviso('antes-mora')];
    const r = await reconciliarEntregas(9, { soltar: false });
    expect(estado.borrados).toEqual([]);
    expect(r).toMatchObject({ fallidos: 1, reintentables: 0 });
  });

  it('respeta el tope de teléfonos por corrida', async () => {
    estado.pendientes = [1, 2, 3].map((n) => ({ ...aviso('al-vencer'), id: n, destino: `1809555000${n}` }));
    await reconciliarEntregas(9, { topeTelefonos: 2 });
    expect(estado.telefonos).toEqual(['18095550001', '18095550002']);
  });

  it('varios avisos del mismo teléfono son una sola consulta', async () => {
    estado.pendientes = [1, 2].map((n) => ({ ...aviso('al-vencer'), id: n }));
    await reconciliarEntregas(9);
    expect(estado.telefonos).toHaveLength(1);
  });
});

