import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lo que pasa cuando Meta dice que el WhatsApp de hoy no llegó: con SMS de
 * respaldo la fila se queda como «fallido» para que la corrida siguiente mande
 * el SMS; sin él se suelta para reintentar el WhatsApp, como siempre.
 */

const estado = vi.hoisted(() => ({
  pendientes: [] as unknown[],
  conSms: [] as { id: number }[],
  smsDelColegio: true,
  borrados: [] as number[],
}));

vi.mock('drizzle-orm', async (original) => ({
  ...(await original<typeof import('drizzle-orm')>()),
  inArray: (_col: unknown, ids: number[]) => ({ __ids: ids }),
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => estado.pendientes,
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
  historialMensajes: async () => ({
    messages: [{ id: 'm1', deliveryStatus: 'fallido', errorDelivery: '131026 sin WhatsApp' }],
  }),
}));
vi.mock('@/lib/administracion-escolar/canales', () => ({
  canalesDelColegio: async () => ({ correo: true, whatsapp: true, sms: estado.smsDelColegio }),
}));

import { reconciliarEntregas } from '@/lib/administracion-escolar/entregas';

const aviso = (tipo: string) => ({
  id: 7, tipo, cargoId: 40, mensajeId: 'm1', destino: '18095551234', enviadoAt: new Date(),
});

beforeEach(() => {
  estado.pendientes = [];
  estado.conSms = [{ id: 40 }];
  estado.smsDelColegio = true;
  estado.borrados = [];
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

  it('los demás avisos se reintentan como siempre', async () => {
    estado.pendientes = [aviso('antes-mora')];
    const r = await reconciliarEntregas(9);
    expect(estado.borrados).toEqual([7]);
    expect(r.reintentables).toBe(1);
  });
});
