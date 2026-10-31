import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El despachador con una base de datos de mentira.
 *
 * Lo que se prueba es el contrato que sostiene el dinero y la paciencia de las
 * familias: tres hermanos son UN mensaje por canal, siguen dejando UNA fila por
 * cargo, el presupuesto y la cuota cuentan mensajes, una familia nunca se parte
 * entre dos tandas, y un fallo suelta TODAS las filas del mensaje.
 *
 * La base es un almacén en memoria que respeta el índice único
 * `(cargo, tipo, offset, canal)`: es justo lo que hace de idempotencia.
 */

interface Fila {
  id: number; teamId: number; cargoId: number; tipo: string; offsetDias: number;
  canal: string; destino: string | null; grupo: string | null;
  mensajeId?: string | null; detalle?: string | null;
}

const almacen = vi.hoisted(() => ({ filas: [] as unknown[], seq: 0 }));
const filas = () => almacen.filas as Fila[];

vi.mock('drizzle-orm', async (original) => ({
  ...(await original<typeof import('drizzle-orm')>()),
  // Las condiciones llegan al falso `db` como `{ __ids }` y no como SQL.
  inArray: (_col: unknown, ids: number[]) => ({ __ids: ids }),
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    insert: () => ({
      values: (v: Omit<Fila, 'id'> | Omit<Fila, 'id'>[]) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const nuevos: { id: number; cargoId: number }[] = [];
            for (const x of Array.isArray(v) ? v : [v]) {
              const choca = filas().some((f) => f.cargoId === x.cargoId && f.tipo === x.tipo
                && f.offsetDias === x.offsetDias && f.canal === x.canal);
              if (choca) continue;
              const fila = { ...x, id: ++almacen.seq } as Fila;
              filas().push(fila);
              nuevos.push({ id: fila.id, cargoId: fila.cargoId });
            }
            return nuevos;
          },
        }),
      }),
    }),
    delete: () => ({
      where: async (c: { __ids: number[] }) => {
        almacen.filas = filas().filter((f) => !c.__ids.includes(f.id));
      },
    }),
    update: () => ({
      set: (s: Partial<Fila>) => ({
        where: async (c: { __ids: number[] }) => {
          for (const f of filas()) if (c.__ids.includes(f.id)) Object.assign(f, s);
        },
      }),
    }),
    select: () => ({ from: () => ({ where: async () => filas() }) }),
  },
}));

vi.mock('@/lib/administracion-escolar/link-pago', () => ({
  getOCrearLink: async () => ({ token: 'tok123', referencia: 'ZER-AAAAAA' }),
  urlDelLink: (t: string) => `https://app.zero.com.do/pagar/${t}`,
}));

import {
  avisosDeHoy, despachar, mensajesEnviados, redactar,
  type AvisoPendiente, type FilaAviso, type OpcionesDespacho,
} from '@/lib/administracion-escolar/avisos';
import { aGsm7 } from '@/lib/sms/mensaje';

const BASE: FilaAviso = {
  cargoId: 1, teamId: 9, estudianteId: 10, clientId: 1689,
  estudiante: 'Ana Pérez', concepto: 'Colegiatura de octubre',
  saldoCentavos: 500000, ecfDocumentId: 77,
  fechaEmision: '2026-09-28', fechaVencimiento: '2026-10-03',
  cobraMora: true, avisoDiaEmision: true, avisoDiaVencimiento: true,
  avisoAntesMoraDias: 2, moraDiasGracia: 5,
  avisoCorreo: true, avisoWhatsapp: true, avisoSms: true,
  destinatario: 'Madre Pérez', email: 'madre@x.com', whatsapp: '8095551234', celular: '8095559999', telefono: null,
};
const fila = (p: Partial<FilaAviso> = {}): FilaAviso => ({ ...BASE, ...p });

const FAMILIA_PEREZ = [
  fila({ cargoId: 1, estudianteId: 10, estudiante: 'Ana Pérez' }),
  fila({ cargoId: 2, estudianteId: 11, estudiante: 'Pedro Pérez' }),
  fila({ cargoId: 3, estudianteId: 12, estudiante: 'Luis Pérez' }),
];
const FAMILIA_GOMEZ = [
  fila({ cargoId: 4, estudianteId: 20, estudiante: 'Zoe Gómez', clientId: 2000, email: 'g@x.com', whatsapp: '8095550001', celular: '8095550002' }),
  fila({ cargoId: 5, estudianteId: 21, estudiante: 'Teo Gómez', clientId: 2000, email: 'g@x.com', whatsapp: '8095550001', celular: '8095550002' }),
];

// El aviso que sale por los tres canales: antes del recargo.
const VENCER = '2026-10-06';
const DIA_QUE_VENCE = '2026-10-03';
const pendientesDe = (fs: FilaAviso[], hoy = VENCER): AvisoPendiente[] => fs.flatMap((f) => avisosDeHoy(f, hoy));

interface Envio { canal: string; destino: string; texto: string; cobros: number[] }

function armar(over: Partial<OpcionesDespacho> = {}, fallar?: (canal: string) => boolean) {
  const enviados: Envio[] = [];
  const opts: OpcionesDespacho = {
    dryRun: false, colegio: 'Colegio X', pausaMs: 0,
    enviar: {
      correo: async (destino, texto, m) => {
        if (fallar?.('correo')) throw new Error('Resend caído');
        enviados.push({ canal: 'correo', destino, texto, cobros: m.miembros.map((x) => x.fila.cargoId) });
      },
      whatsapp: async (destino, texto, m) => {
        if (fallar?.('whatsapp')) throw new Error('Meta 131047');
        enviados.push({ canal: 'whatsapp', destino, texto, cobros: m.miembros.map((x) => x.fila.cargoId) });
        return 'wamid.GRUPO';
      },
      sms: async (destino, texto) => {
        if (fallar?.('sms')) throw new Error('SNS caído');
        enviados.push({ canal: 'sms', destino, texto, cobros: [] });
      },
    },
    ...over,
  };
  return { opts, enviados };
}

beforeEach(() => { almacen.filas = []; almacen.seq = 0; });

describe('despachar: un mensaje por familia', () => {
  it('tres hermanos reciben UN correo, UN WhatsApp y UN SMS', async () => {
    const { opts, enviados } = armar();
    const hechos = await despachar(pendientesDe(FAMILIA_PEREZ), opts);

    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'whatsapp', 'sms']);
    expect(enviados[0].cobros).toEqual([1, 3, 2]);   // Ana, Luis, Pedro
    expect(enviados[0].texto).toContain('RD$15,000.00 en total');
    expect(enviados[0].texto).toContain('https://app.zero.com.do/pagar/tok123');
    // Un hecho por cargo y canal, pero tres mensajes.
    expect(hechos).toHaveLength(9);
    expect(hechos.every((h) => h.ok)).toBe(true);
    expect(mensajesEnviados(hechos)).toBe(3);
  });

  it('deja UNA fila por cargo, y las de un mismo mensaje comparten grupo', async () => {
    await despachar(pendientesDe(FAMILIA_PEREZ), armar().opts);

    expect(filas()).toHaveLength(9);
    for (const canal of ['correo', 'whatsapp', 'sms']) {
      const delCanal = filas().filter((f) => f.canal === canal);
      expect(delCanal.map((f) => f.cargoId).sort()).toEqual([1, 2, 3]);
      const grupos = new Set(delCanal.map((f) => f.grupo));
      expect(grupos.size).toBe(1);
      expect([...grupos][0]).toBeTruthy();
      expect(delCanal.every((f) => f.detalle === 'Enviado en un solo mensaje con 2 cobro(s) más')).toBe(true);
    }
    // Los tres canales son mensajes distintos: grupos distintos.
    expect(new Set(filas().map((f) => f.grupo)).size).toBe(3);
  });

  it('las tres filas de WhatsApp comparten el mismo mensaje_id', async () => {
    await despachar(pendientesDe(FAMILIA_PEREZ), armar().opts);
    const wa = filas().filter((f) => f.canal === 'whatsapp');
    expect(wa.map((f) => f.mensajeId)).toEqual(['wamid.GRUPO', 'wamid.GRUPO', 'wamid.GRUPO']);
    // Correo y SMS no devuelven id.
    expect(filas().filter((f) => f.canal !== 'whatsapp').every((f) => f.mensajeId === undefined)).toBe(true);
  });

  it('un cargo suelto sale idéntico a siempre y sin grupo', async () => {
    const { opts, enviados } = armar();
    const [p] = pendientesDe([FAMILIA_PEREZ[0]]);
    await despachar([p], opts);

    const correo = enviados.find((e) => e.canal === 'correo')!;
    // El enlace lleva a SU factura (`?f=`), no a toda la deuda de la familia.
    expect(correo.texto).toBe(`${redactar(p, 'Colegio X').largo}\n\nPaga o sube tu comprobante aquí: https://app.zero.com.do/pagar/tok123?f=${p.fila.ecfDocumentId}`);
    expect(filas().every((f) => f.grupo === null)).toBe(true);
    expect(filas().every((f) => f.detalle === undefined)).toBe(true);
    // El SMS de un cobro no lleva enlace.
    expect(enviados.find((e) => e.canal === 'sms')!.texto).toBe(aGsm7(redactar(p, 'Colegio X').corto));
  });

  it('volver a correr no repite nada: el índice único sigue mandando', async () => {
    const p = pendientesDe(FAMILIA_PEREZ);
    await despachar(p, armar().opts);
    const segunda = armar();
    const hechos = await despachar(p, segunda.opts);
    expect(segunda.enviados).toHaveLength(0);
    expect(hechos).toHaveLength(0);
    expect(filas()).toHaveLength(9);
  });

  it('si un cargo ya había salido, el mensaje lleva solo los que faltan', async () => {
    // Pedro (cargo 2) ya recibió su correo en una corrida anterior.
    await despachar(pendientesDe([FAMILIA_PEREZ[1]]), armar().opts);
    almacen.filas = filas().filter((f) => f.canal === 'correo');

    const { opts, enviados } = armar();
    await despachar(pendientesDe(FAMILIA_PEREZ), opts);
    const correo = enviados.find((e) => e.canal === 'correo')!;
    expect(correo.cobros).toEqual([1, 3]);
    expect(correo.texto).toContain('2 cobros');
    // Y a esos dos no se les marca como enviados «con 1 más» del que ya salió.
    expect(filas().filter((f) => f.canal === 'correo' && f.cargoId !== 2)
      .every((f) => f.detalle === 'Enviado en un solo mensaje con 1 cobro(s) más')).toBe(true);
  });
});

describe('despachar: cuando algo falla', () => {
  it('un fallo suelta las filas de TODO el mensaje y solo las de ese', async () => {
    const { opts } = armar({}, (canal) => canal === 'whatsapp');
    const hechos = await despachar(pendientesDe(FAMILIA_PEREZ), opts);

    expect(filas().filter((f) => f.canal === 'whatsapp')).toHaveLength(0);
    expect(filas().filter((f) => f.canal === 'correo')).toHaveLength(3);
    expect(filas().filter((f) => f.canal === 'sms')).toHaveLength(3);

    const fallidos = hechos.filter((h) => !h.ok);
    expect(fallidos.map((h) => h.cargoId).sort()).toEqual([1, 2, 3]);
    expect(fallidos.every((h) => h.canal === 'whatsapp' && h.error === 'Meta 131047')).toBe(true);
    // El mensaje que falló no gasta presupuesto.
    expect(mensajesEnviados(hechos)).toBe(2);
  });

  it('el reintento siguiente rehace el mensaje completo', async () => {
    const p = pendientesDe(FAMILIA_PEREZ);
    await despachar(p, armar({}, (c) => c === 'whatsapp').opts);

    const segunda = armar();
    await despachar(p, segunda.opts);
    expect(segunda.enviados.map((e) => e.canal)).toEqual(['whatsapp']);
    expect(segunda.enviados[0].cobros).toEqual([1, 3, 2]);
  });

  it('sin correo, el reporte dice a cuál cargo le falta y no se reserva nada', async () => {
    const sinCorreo = FAMILIA_PEREZ.map((f) => ({ ...f, email: null }));
    const hechos = await despachar(pendientesDe(sinCorreo), armar().opts);
    const faltan = hechos.filter((h) => h.canal === 'correo');
    expect(faltan).toHaveLength(3);
    expect(faltan.every((h) => !h.ok && h.destino === null && h.error?.includes('no tiene correo'))).toBe(true);
    expect(filas().filter((f) => f.canal === 'correo')).toHaveLength(0);
  });
});

describe('despachar: la tanda y la cuota cuentan mensajes', () => {
  it('el límite es de mensajes: una familia de 3 hijos gasta 3, no 9', async () => {
    const { opts, enviados } = armar({ limite: 3 });
    const hechos = await despachar([...pendientesDe(FAMILIA_PEREZ), ...pendientesDe(FAMILIA_GOMEZ)], opts);
    // Los 3 mensajes de los Pérez llenan la tanda: los Gómez esperan a la siguiente.
    expect(enviados).toHaveLength(3);
    expect(new Set(hechos.map((h) => h.cargoId))).toEqual(new Set([1, 2, 3]));
  });

  it('una familia nunca se parte: aunque el límite se acabe a mitad, termina sus tres canales', async () => {
    const { opts, enviados } = armar({ limite: 1 });
    const hechos = await despachar([...pendientesDe(FAMILIA_PEREZ), ...pendientesDe(FAMILIA_GOMEZ)], opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'whatsapp', 'sms']);
    expect(hechos.every((h) => [1, 2, 3].includes(h.cargoId))).toBe(true);
  });

  it('la siguiente corrida retoma con la familia que faltó', async () => {
    const todo = [...pendientesDe(FAMILIA_PEREZ), ...pendientesDe(FAMILIA_GOMEZ)];
    await despachar(todo, armar({ limite: 3 }).opts);
    const segunda = armar({ limite: 3 });
    const hechos = await despachar(todo, segunda.opts);
    expect(segunda.enviados).toHaveLength(3);
    expect(new Set(hechos.map((h) => h.cargoId))).toEqual(new Set([4, 5]));
    expect(filas()).toHaveLength(9 + 6);
  });

  it('la cuota mensual se descuenta por mensaje, no por cargo', async () => {
    // A la cuota de SMS le queda UNO: el SMS de los tres hermanos cabe.
    const { opts, enviados } = armar({ restantePorCanal: { sms: 1 } });
    const hechos = await despachar(pendientesDe(FAMILIA_PEREZ), opts);
    expect(enviados.some((e) => e.canal === 'sms')).toBe(true);
    expect(hechos.filter((h) => h.canal === 'sms').every((h) => h.ok)).toBe(true);
  });

  it('con la cuota agotada el canal se salta entero y cada cargo lo dice', async () => {
    const { opts, enviados } = armar({ restantePorCanal: { sms: 0 } });
    const hechos = await despachar(pendientesDe(FAMILIA_PEREZ), opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'whatsapp']);
    const sinCupo = hechos.filter((h) => !h.ok);
    expect(sinCupo).toHaveLength(3);
    expect(sinCupo.every((h) => h.error === 'Cuota mensual de sms agotada')).toBe(true);
    expect(filas().filter((f) => f.canal === 'sms')).toHaveLength(0);
  });

  it('la cuota se gasta una vez por mensaje a lo largo de varias familias', async () => {
    // Dos familias, un SMS cada una; solo cabe un SMS.
    const { opts, enviados } = armar({ restantePorCanal: { sms: 1 } });
    const hechos = await despachar([...pendientesDe(FAMILIA_PEREZ), ...pendientesDe(FAMILIA_GOMEZ)], opts);
    expect(enviados.filter((e) => e.canal === 'sms')).toHaveLength(1);
    expect(hechos.filter((h) => !h.ok).map((h) => h.cargoId).sort()).toEqual([4, 5]);
  });
});

describe('despachar: el simulacro', () => {
  it('enseña el plan por cargo pero cuenta mensajes, y no escribe nada', async () => {
    const { opts, enviados } = armar({ dryRun: true });
    const hechos = await despachar(pendientesDe(FAMILIA_PEREZ), opts);
    expect(enviados).toHaveLength(0);
    expect(filas()).toHaveLength(0);
    expect(hechos).toHaveLength(9);
    expect(mensajesEnviados(hechos)).toBe(3);
  });

  it('no enseña como pendiente lo que ya salió', async () => {
    const p = pendientesDe(FAMILIA_PEREZ);
    await despachar(p, armar().opts);
    const hechos = await despachar(p, armar({ dryRun: true }).opts);
    expect(hechos).toHaveLength(0);
  });
});

describe('despachar: el día que vence, SMS solo si el WhatsApp no sale', () => {
  const delDia = (fs: FilaAviso[]) => pendientesDe(fs, DIA_QUE_VENCE);

  it('si el WhatsApp sale, no se paga el SMS', async () => {
    const { opts, enviados } = armar();
    await despachar(delDia(FAMILIA_PEREZ), opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'whatsapp']);
    expect(filas().filter((f) => f.canal === 'sms')).toHaveLength(0);
  });

  it('si el envío se rechaza, la familia recibe UN SMS en la misma corrida', async () => {
    const { opts, enviados } = armar({}, (c) => c === 'whatsapp');
    const hechos = await despachar(delDia(FAMILIA_PEREZ), opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'sms']);
    expect(filas().filter((f) => f.canal === 'whatsapp')).toHaveLength(0);
    expect(filas().filter((f) => f.canal === 'sms')).toHaveLength(3);
    expect(hechos.filter((h) => h.canal === 'whatsapp').every((h) => !h.ok)).toBe(true);
  });

  it('reintentar a los quince minutos no repite el SMS', async () => {
    const { opts, enviados } = armar({}, (c) => c === 'whatsapp');
    await despachar(delDia(FAMILIA_PEREZ), opts);
    await despachar(delDia(FAMILIA_PEREZ), opts);
    expect(enviados.filter((e) => e.canal === 'sms')).toHaveLength(1);
  });

  it('con la cuota de WhatsApp agotada también sale por SMS', async () => {
    const { opts, enviados } = armar({ restantePorCanal: { whatsapp: 0 } });
    await despachar(delDia(FAMILIA_PEREZ), opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'sms']);
  });

  it('con el SMS apagado en el concepto solo queda el fallo anotado', async () => {
    const sinSms = FAMILIA_PEREZ.map((f) => ({ ...f, avisoSms: false }));
    const { opts, enviados } = armar({}, (c) => c === 'whatsapp');
    const hechos = await despachar(delDia(sinSms), opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo']);
    expect(hechos.filter((h) => !h.ok)).toHaveLength(3);
  });

  it('la familia no se parte: el SMS va antes de la siguiente', async () => {
    const { opts, enviados } = armar({}, (c) => c === 'whatsapp');
    await despachar(delDia([...FAMILIA_PEREZ, ...FAMILIA_GOMEZ]), opts);
    expect(enviados.map((e) => e.canal)).toEqual(['correo', 'sms', 'correo', 'sms']);
  });

  it('antes del recargo un WhatsApp rechazado no añade otro SMS', async () => {
    const { opts, enviados } = armar({}, (c) => c === 'whatsapp');
    await despachar(pendientesDe(FAMILIA_PEREZ), opts);
    expect(enviados.filter((e) => e.canal === 'sms')).toHaveLength(1);
  });
});
