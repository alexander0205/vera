/**
 * J · Una solicitud atascada en «pagando» se recupera sin pagar dos veces, y las
 * pantallas de Comprobantes dentro de Contabilidad respetan el ocultamiento por
 * rol de las de Facturación.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const sentencias: string[] = [];
let reclamo: unknown[] = [];
let pagoExistente: unknown[] = [];
let pagoPorIndice: unknown[] = [];
const registrar = vi.fn();

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => {
      const t = dialect.sqlToQuery(q).sql.trim().replace(/\s+/g, ' ');
      sentencias.push(t);
      if (t.startsWith("UPDATE pagos_solicitudes SET estado = 'pagando'")) return reclamo;
      if (t.includes('FROM pagos_proveedores') && t.includes('referencia =')) return pagoExistente;
      if (t.includes('FROM pagos_proveedores') && t.includes('solicitud_id =')) return pagoPorIndice;
      return [];
    },
  },
}));
vi.mock('@/lib/contabilidad/config', () => ({ cuentasDeSalida: async () => ({ cuentas: [], porMetodo: {} }) }));
vi.mock('@/lib/contabilidad/bancos', () => ({ tablaExiste: async () => true }));
vi.mock('@/lib/contabilidad/cuentas-por-pagar', () => ({
  registrarPagoProveedor: (...a: unknown[]) => registrar(...a),
  PagoProveedorError: class extends Error {},
}));

import { pagarSolicitud } from '@/lib/contabilidad/solicitudes-pago';
import { pantallaDeRuta } from '@/lib/config/pantallas';

beforeEach(() => {
  sentencias.length = 0; registrar.mockReset();
  reclamo = [{ compraId: 5, monto: '1000', metodo: 'transferencia', cuentaId: null, nota: null }];
  pagoExistente = [];
  pagoPorIndice = [];
});

describe('pagarSolicitud: recuperar una solicitud atascada', () => {
  it('el reclamo acepta «pagando» solo si no tiene pago enlazado y lleva minutos', async () => {
    registrar.mockResolvedValue({ id: 9 });
    await pagarSolicitud(1, 3, 7, '2026-11-05');
    const claim = sentencias.find((s) => s.startsWith("UPDATE pagos_solicitudes SET estado = 'pagando'"))!;
    expect(claim).toContain("estado = 'aprobado'");
    expect(claim).toContain("estado = 'pagando' AND pago_id IS NULL AND resuelta_at < NOW()");
    expect(claim).toContain("interval '1 minute'");
  });

  it('si el pago de esa solicitud ya se había registrado, lo enlaza y NO paga de nuevo', async () => {
    pagoExistente = [{ id: 321 }];
    const r = await pagarSolicitud(1, 3, 7, '2026-11-05');
    expect(r).toEqual({ pagoId: 321 });
    expect(registrar).not.toHaveBeenCalled();
    expect(sentencias.some((s) => s.includes("SET estado = 'pagado', pago_id =") )).toBe(true);
  });

  it('si no está aprobada ni atascada, se niega', async () => {
    reclamo = [];
    await expect(pagarSolicitud(1, 3, 7, '2026-11-05')).rejects.toThrow(/no está aprobada/);
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe('7 · un pago nace de una sola solicitud', () => {
  it('la migración 0222 hace único pagos_proveedores.solicitud_id', async () => {
    const { readFileSync } = await import('node:fs');
    const m = readFileSync('lib/db/migrations/0222_solicitudes_pago_proveedor.sql', 'utf8');
    expect(m).toContain('ADD COLUMN IF NOT EXISTS solicitud_id');
    expect(m).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS pagos_proveedores_solicitud_uniq\s+ON pagos_proveedores \(solicitud_id\) WHERE solicitud_id IS NOT NULL/);
  });

  it('el pago se registra con el id de la solicitud', async () => {
    registrar.mockResolvedValue({ id: 9 });
    await pagarSolicitud(1, 3, 7, '2026-11-05');
    expect(registrar.mock.calls[0][0]).toMatchObject({ solicitudId: 3, referencia: 'Solicitud #3' });
  });

  it('si el índice único salta (otro intento ya pagó), enlaza ese pago y no falla', async () => {
    registrar.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    pagoExistente = [];            // el chequeo previo no lo vio (carrera)…
    pagoPorIndice = [{ id: 654 }]; // …pero el índice único sí lo atrapa
    const r = await pagarSolicitud(1, 3, 7, '2026-11-05');
    expect(r).toEqual({ pagoId: 654 });
    expect(sentencias.some((x) => x.includes("SET estado = 'pagado', pago_id ="))).toBe(true);
  });

  it('un error distinto de la violación única no se traga y la solicitud vuelve a aprobada', async () => {
    registrar.mockRejectedValue(new Error('boom'));
    await expect(pagarSolicitud(1, 3, 7, '2026-11-05')).rejects.toThrow('boom');
    expect(sentencias.some((x) => x.includes("SET estado = 'aprobado'"))).toBe(true);
  });
});

describe('pantallas de Comprobantes en Contabilidad', () => {
  it('heredan el id de pantalla de las de Facturación (ocultar una oculta la otra)', () => {
    expect(pantallaDeRuta('/contabilidad/secuencias')?.id).toBe('fact-secuencias-comp');
    expect(pantallaDeRuta('/contabilidad/consulta-ncf')?.id).toBe('fact-consulta-ncf');
    expect(pantallaDeRuta('/dashboard/contabilidad/secuencias')?.id).toBe('fact-secuencias-comp');
  });
});
