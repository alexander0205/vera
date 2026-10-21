/**
 * Unit tests — la memoria de «ya se avisó» sobre audit_logs.
 *
 * NO hay base: `@/lib/db/drizzle` está simulado con un objeto que captura lo
 * que se le pide. Las condiciones se traducen a SQL con el dialecto de drizzle
 * (que no necesita conexión) para comprobar QUÉ se está preguntando: la acción,
 * la llave y la ventana de días.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const captura = vi.hoisted(() => ({
  where: null as unknown,
  filas: [] as unknown[],
  insertados: [] as unknown[],
  insertFalla: false,
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condicion: unknown) => {
          captura.where = condicion;
          const filas = Promise.resolve(captura.filas);
          // `yaAvisado` encadena .limit(1); el barrido de pruebas espera la promesa tal cual.
          return Object.assign(filas, { limit: async () => captura.filas });
        },
      }),
    }),
    insert: () => ({
      values: async (v: unknown) => {
        if (captura.insertFalla) throw new Error('base caída');
        captura.insertados.push(v);
      },
    }),
  },
}));

const { yaAvisado, registrarAviso, pruebasQueTerminanEntre, equipoPorMetadata } = await import('@/lib/suscripcion/avisos-almacen');

const dialecto = new PgDialect();
const sqlDe = (condicion: unknown) => dialecto.sqlToQuery(condicion as never);

beforeEach(() => {
  captura.where = null;
  captura.filas = [];
  captura.insertados = [];
  captura.insertFalla = false;
});

describe('yaAvisado', () => {
  it('pregunta por la acción de aviso y por la llave exacta', async () => {
    await yaAvisado('pago:in_1', null);

    const { sql, params } = sqlDe(captura.where);
    expect(sql).toContain('"audit_logs"."action" = $1');
    expect(sql).toContain('"audit_logs"."resource" = $2');
    expect(params).toEqual(['SUSCRIPCION_AVISO', 'pago:in_1']);
  });

  it('sin ventana no limita por fecha', async () => {
    await yaAvisado('prueba-7:sub_1', null);
    expect(sqlDe(captura.where).sql).not.toContain('created_at');
  });

  it('con ventana solo cuenta lo enviado dentro de los últimos N días', async () => {
    const ahora = new Date('2026-10-21T11:00:00Z');
    await yaAvisado('activada:7:negocio', 60, ahora);

    const { sql, params } = sqlDe(captura.where);
    expect(sql).toContain('"audit_logs"."created_at" >= $3');
    const limite = params[2] as Date | string;
    expect(new Date(limite).toISOString()).toBe('2026-08-22T11:00:00.000Z');
  });

  it('true si hay una fila, false si no', async () => {
    captura.filas = [];
    expect(await yaAvisado('pago:in_1', null)).toBe(false);

    captura.filas = [{ id: 99 }];
    expect(await yaAvisado('pago:in_1', null)).toBe(true);
  });
});

describe('registrarAviso', () => {
  it('guarda una fila de sistema con la acción y la llave', async () => {
    await registrarAviso(7, 'pago:in_1', { aviso: 'pago', centavos: 13500 });

    expect(captura.insertados).toEqual([{
      teamId: 7,
      userId: null,
      actor: 'system',
      action: 'SUSCRIPCION_AVISO',
      resource: 'pago:in_1',
      metadata: JSON.stringify({ aviso: 'pago', centavos: 13500 }),
    }]);
  });

  it('la acción cabe en audit_logs.action (varchar(50))', async () => {
    await registrarAviso(7, 'pago:in_1');
    const { action } = captura.insertados[0] as { action: string };
    expect(action.length).toBeLessThanOrEqual(50);
  });

  it('si la base falla NO lanza: el correo ya salió, y un error aquí haría creer que no', async () => {
    captura.insertFalla = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(registrarAviso(7, 'pago:in_1')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });
});

describe('pruebasQueTerminanEntre', () => {
  it('pide las empresas EN PRUEBA, con suscripción y fin de prueba, dentro del rango', async () => {
    const desde = new Date('2026-10-26T00:00:00Z');
    const hasta = new Date('2026-10-30T00:00:00Z');
    await pruebasQueTerminanEntre(desde, hasta);

    const { sql, params } = sqlDe(captura.where);
    expect(sql).toContain('"teams"."subscription_status" = $1');
    expect(sql).toContain('"teams"."stripe_subscription_id" is not null');
    expect(sql).toContain('"teams"."trial_end" is not null');
    expect(sql).toContain('"teams"."trial_end" >=');
    expect(sql).toContain('"teams"."trial_end" <=');
    expect(params[0]).toBe('trialing');
  });

  it('devuelve solo filas completas, con los nombres que usa avisos.ts', async () => {
    const fin = new Date('2026-10-28T14:00:00Z');
    captura.filas = [
      { teamId: 1, suscripcionId: 'sub_1', trialEnd: fin },
      { teamId: 2, suscripcionId: null, trialEnd: fin },     // sin suscripción: se descarta
      { teamId: 3, suscripcionId: 'sub_3', trialEnd: null }, // sin fecha: se descarta
    ];

    const r = await pruebasQueTerminanEntre(new Date(), new Date());

    expect(r).toEqual([{ teamId: 1, suscripcionId: 'sub_1', trialEnd: fin }]);
  });
});

describe('equipoPorMetadata', () => {
  it('una empresa SIN customer todavía se acepta (el alta aún no lo ató)', async () => {
    captura.filas = [{ id: 7, stripeCustomerId: null }];
    expect(await equipoPorMetadata('7', 'cus_nuevo')).toEqual({ id: 7 });
  });

  it('una empresa con ESE mismo customer se acepta', async () => {
    captura.filas = [{ id: 7, stripeCustomerId: 'cus_nuevo' }];
    expect(await equipoPorMetadata('7', 'cus_nuevo')).toEqual({ id: 7 });
  });

  it('una empresa con OTRO customer se rechaza: la metadata no puede mandar el correo a una empresa ajena', async () => {
    captura.filas = [{ id: 7, stripeCustomerId: 'cus_otro' }];
    expect(await equipoPorMetadata('7', 'cus_nuevo')).toBeNull();
  });

  it('una empresa que no existe → null', async () => {
    captura.filas = [];
    expect(await equipoPorMetadata('999', 'cus_nuevo')).toBeNull();
  });

  it('un teamId ausente o que no es un entero positivo ni siquiera consulta la base', async () => {
    captura.where = 'sin-tocar';
    for (const malo of [undefined, null, '', 'abc', '-3', '0', '7.5']) {
      expect(await equipoPorMetadata(malo as string | undefined, 'cus_nuevo')).toBeNull();
    }
    expect(captura.where).toBe('sin-tocar');
  });
});
