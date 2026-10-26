import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El reenvío manual del aviso de un cargo tiene que dejar rastro CADA vez.
 *
 * Se anotaba con `offset_dias = -1` y el índice único de la tabla de
 * idempotencia es `(cargo, tipo, offset, canal)`: desde el segundo reenvío el
 * insert chocaba y `onConflictDoNothing` lo descartaba en silencio. El mensaje
 * salía, pero no contaba para la cuota mensual de WhatsApp ni para el tope de
 * 24 horas, que se lee de esa misma tabla.
 */

interface Fila { id: number; cargoId: number; tipo: string; offsetDias: number; canal: string; mensajeId: string | null }

const almacen = vi.hoisted(() => ({ filas: [] as unknown[], seq: 0, choques: 0 }));
const filas = () => almacen.filas as Fila[];

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    // El falso `select` ignora el WHERE (llega como SQL, no se puede leer): cada
    // prueba usa un solo cargo para no depender de él.
    select: () => ({ from: () => ({ where: async () => filas() }) }),
    insert: () => ({
      values: (x: Omit<Fila, 'id'>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const choca = almacen.choques > 0 || filas().some((f) => f.cargoId === x.cargoId
              && f.tipo === x.tipo && f.offsetDias === x.offsetDias && f.canal === x.canal);
            if (almacen.choques > 0) almacen.choques--;
            if (choca) return [];
            const fila = { ...x, id: ++almacen.seq } as Fila;
            filas().push(fila);
            return [{ id: fila.id }];
          },
        }),
      }),
    }),
  },
}));

import {
  registrarReenvioAviso, siguienteOffsetReenvio,
} from '@/lib/administracion-escolar/reenvio-aviso';

beforeEach(() => { almacen.filas = []; almacen.seq = 0; almacen.choques = 0; });

describe('siguienteOffsetReenvio', () => {
  it('el primero es -1', () => {
    expect(siguienteOffsetReenvio([])).toBe(-1);
  });

  it('cada reenvío toma el siguiente número, sin repetir el del anterior', () => {
    expect(siguienteOffsetReenvio([-1])).toBe(-2);
    expect(siguienteOffsetReenvio([-1, -2, -3])).toBe(-4);
  });

  it('no depende del orden en que lleguen', () => {
    expect(siguienteOffsetReenvio([-3, -1, -2])).toBe(-4);
  });

  it('los offsets del cron (0 y positivos) no cuentan', () => {
    expect(siguienteOffsetReenvio([0, 2, 5])).toBe(-1);
    expect(siguienteOffsetReenvio([0, 5, -1])).toBe(-2);
  });
});

describe('registrarReenvioAviso', () => {
  const reenviar = (mensajeId: string | null) =>
    registrarReenvioAviso({ teamId: 9, cargoId: 1, destino: '18095551234', mensajeId });

  it('antes solo el primero quedaba anotado; ahora cada uno lleva su offset', async () => {
    expect(await reenviar('wamid.A')).toBe(true);
    expect(await reenviar('wamid.B')).toBe(true);
    expect(await reenviar('wamid.C')).toBe(true);

    expect(filas().map((f) => [f.offsetDias, f.mensajeId])).toEqual([
      [-1, 'wamid.A'], [-2, 'wamid.B'], [-3, 'wamid.C'],
    ]);
    expect(filas().every((f) => f.tipo === 'al-vencer' && f.canal === 'whatsapp')).toBe(true);
  });

  it('no choca con el aviso automático del mismo cargo', async () => {
    // El del cron: offset 0, y el de «antes del recargo», positivo.
    filas().push(
      { id: ++almacen.seq, cargoId: 1, tipo: 'al-vencer', offsetDias: 0, canal: 'whatsapp', mensajeId: 'wamid.CRON' },
      { id: ++almacen.seq, cargoId: 1, tipo: 'antes-mora', offsetDias: 2, canal: 'whatsapp', mensajeId: null },
    );
    expect(await reenviar('wamid.A')).toBe(true);
    expect(await reenviar('wamid.B')).toBe(true);
    expect(filas().filter((f) => f.offsetDias < 0).map((f) => f.offsetDias)).toEqual([-1, -2]);
  });

  it('si dos reenvíos eligen el mismo número a la vez, el segundo reintenta con otro', async () => {
    await reenviar('wamid.A');
    almacen.choques = 2;   // los dos próximos inserts rebotan, como si otro se hubiera adelantado
    expect(await reenviar('wamid.B')).toBe(true);
    expect(filas().map((f) => f.mensajeId)).toEqual(['wamid.A', 'wamid.B']);
  });

  it('si no consigue anotarlo no lanza: el mensaje ya salió', async () => {
    const aviso = vi.spyOn(console, 'error').mockImplementation(() => {});
    almacen.choques = 99;
    await expect(reenviar('wamid.X')).resolves.toBe(false);
    expect(filas()).toHaveLength(0);
    aviso.mockRestore();
  });
});
