/**
 * Crear una hija bajo una cuenta que acepta movimientos:
 *  - con asientos → se rechaza;
 *  - sin asientos y sin pedir conversión → se rechaza con la marca
 *    PADRE_CONVERTIBLE para que la pantalla ofrezca el clic;
 *  - sin asientos y con `convertirPadre` → el padre pasa a agrupar y la
 *    configuración que apuntaba al padre se muda a la hija.
 *
 * Se usa un ejecutor falso que reconoce las consultas por su texto SQL.
 */
import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { crearCuenta, CuentaError, type Ejecutor } from '@/lib/contabilidad/cuentas';

const dialect = new PgDialect();

function ejecutorFalso(opts: { padreImputable: boolean; movimientosPadre: number; hijaImputable?: boolean; hijaExiste?: boolean }) {
  const sentencias: string[] = [];
  const ex = {
    execute: async (q: Parameters<Ejecutor['execute']>[0]) => {
      const texto = dialect.sqlToQuery(q as never).sql.trim().replace(/\s+/g, ' ');
      sentencias.push(texto);
      if (texto.includes("to_regclass('public.contabilidad_asiento_lineas')")) return [{ existe: true }];
      if (texto.includes('count(*)::int AS total') && texto.includes('contabilidad_asiento_lineas')) {
        return [{ total: opts.movimientosPadre }];
      }
      if (texto.includes('FROM contabilidad_cuentas') && texto.includes('WHERE team_id') && !texto.includes('FOR UPDATE') && !texto.startsWith('INSERT')
          && !texto.startsWith('UPDATE')) {
        return [{
          id: 10, codigo: '1102', nombre: 'Bancos', tipo: 'activo', naturaleza: 'deudora',
          cuentaPadreId: null, imputable: opts.padreImputable, activa: true, esBase: true,
        }];
      }
      if (texto.startsWith('INSERT INTO contabilidad_cuentas')) {
        if (opts.hijaExiste) return [];
        return [{
          id: 99, codigo: '110201', nombre: 'Banco A', tipo: 'activo', naturaleza: 'deudora',
          cuentaPadreId: 10, imputable: opts.hijaImputable ?? true, activa: true, esBase: false,
        }];
      }
      if (texto.includes('FROM pg_constraint')) {
        return [
          { tabla: 'contabilidad_config', columna: 'cuenta_por_cobrar_id' },
          { tabla: 'contabilidad_config_metodos_pago', columna: 'cuenta_id' },
          { tabla: 'pagos_proveedores', columna: 'cuenta_salida_id' },
          { tabla: 'pagos_solicitudes', columna: 'cuenta_salida_id' },
          { tabla: 'contabilidad_extractos', columna: 'cuenta_id' },
        ];
      }
      if (texto.startsWith('SELECT id FROM contabilidad_cuentas WHERE team_id') && texto.includes('FOR UPDATE')) {
        sentencias.push('BLOQUEO');
        return [{ id: 10 }];
      }
      return [];
    },
  } as unknown as Ejecutor;
  return { ex, sentencias };
}

const entrada = {
  codigo: '110201', nombre: 'Banco A', tipo: 'activo' as const, cuentaPadreId: 10,
};

describe('crear hija bajo una cuenta que acepta movimientos', () => {
  it('con asientos encima se rechaza, aunque se pida convertir', async () => {
    const { ex, sentencias } = ejecutorFalso({ padreImputable: true, movimientosPadre: 3 });
    await expect(crearCuenta(1, { ...entrada, convertirPadre: true }, 7, ex)).rejects.toMatchObject({
      status: 409, codigo: undefined,
    });
    expect(sentencias.some((s) => s.startsWith('UPDATE contabilidad_cuentas'))).toBe(false);
  });

  it('sin asientos y sin pedirlo, el error trae la marca PADRE_CONVERTIBLE', async () => {
    const { ex } = ejecutorFalso({ padreImputable: true, movimientosPadre: 0 });
    const err = await crearCuenta(1, entrada, 7, ex).catch((e) => e);
    expect(err).toBeInstanceOf(CuentaError);
    expect(err.codigo).toBe('PADRE_CONVERTIBLE');
    expect(err.status).toBe(409);
  });

  it('sin asientos y pidiéndolo: el padre agrupa y la configuración se muda a la hija', async () => {
    const { ex, sentencias } = ejecutorFalso({ padreImputable: true, movimientosPadre: 0 });
    const creada = await crearCuenta(1, { ...entrada, convertirPadre: true }, 7, ex);
    expect(creada.id).toBe(99);
    const iUpdatePadre = sentencias.findIndex((s) => s.includes('SET imputable = false'));
    const iInsert = sentencias.findIndex((s) => s.startsWith('INSERT INTO contabilidad_cuentas'));
    expect(iUpdatePadre).toBeGreaterThanOrEqual(0);
    expect(iUpdatePadre).toBeLessThan(iInsert);
    // Se bloqueó el padre antes de tocarlo, y se mudó TODO lo que lo apuntaba (configuración, compras, pagos, solicitudes, extractos).
    expect(sentencias.indexOf('BLOQUEO')).toBeGreaterThanOrEqual(0);
    for (const frag of ['UPDATE "contabilidad_config" SET "cuenta_por_cobrar_id"', 'UPDATE "contabilidad_config_metodos_pago" SET "cuenta_id"',
      'UPDATE "pagos_proveedores" SET "cuenta_salida_id"', 'UPDATE "pagos_solicitudes" SET "cuenta_salida_id"', 'UPDATE "contabilidad_extractos" SET "cuenta_id"']) {
      expect(sentencias.some((s) => s.includes(frag)), frag).toBe(true);
    }
  });

  it('si la hija nace sin aceptar movimientos no puede ocupar el lugar del padre', async () => {
    const { ex } = ejecutorFalso({ padreImputable: true, movimientosPadre: 0, hijaImputable: false });
    await expect(crearCuenta(1, { ...entrada, convertirPadre: true, imputable: false }, 7, ex)).rejects.toThrow(/aceptar movimientos/);
  });

  it('si el código de la hija ya existe, falla (y en la transacción real nada queda cambiado)', async () => {
    const { ex } = ejecutorFalso({ padreImputable: true, movimientosPadre: 0, hijaExiste: true });
    await expect(crearCuenta(1, { ...entrada, convertirPadre: true }, 7, ex)).rejects.toThrow(/Ya existe/);
  });

  it('si el padre ya agrupa, no convierte ni muda nada', async () => {
    const { ex, sentencias } = ejecutorFalso({ padreImputable: false, movimientosPadre: 0 });
    await crearCuenta(1, { ...entrada, convertirPadre: true }, 7, ex);
    expect(sentencias.some((s) => s.includes('SET imputable = false'))).toBe(false);
    expect(sentencias.some((s) => s.includes('UPDATE contabilidad_config'))).toBe(false);
  });
});
