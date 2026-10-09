/**
 * Panorama contable: de qué módulo sale cada asiento y qué falta por asentar.
 *
 * Existe por la reunión de integración: «mientras tú no validas que la
 * información de los módulos pasa directamente a la contabilidad…». Aquí se
 * ve, módulo por módulo, cuántos asientos generó en el período y cuántos
 * documentos siguen sin el suyo, con enlace al libro diario filtrado.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import type { OrigenTipo, PendientesPorOrigen } from './libro-diario';

export interface MovimientoOrigen {
  asientos: number;
  totalCents: number;
  /** Fecha contable del último asiento del período. */
  ultimo: string | null;
}

/** Asientos del período agrupados por origen. */
export async function asientosPorOrigen(
  teamId: number,
  desde: string,
  hasta: string,
): Promise<Partial<Record<OrigenTipo, MovimientoOrigen>>> {
  const filas = await db.execute<{ origen: OrigenTipo; asientos: unknown; total: unknown; ultimo: string | null }>(sql`
    SELECT origen_tipo AS origen, count(*)::int AS asientos,
           COALESCE(sum(total_cents), 0)::bigint AS total,
           to_char(max(fecha), 'YYYY-MM-DD') AS ultimo
    FROM contabilidad_asientos
    WHERE team_id = ${teamId} AND fecha BETWEEN ${desde} AND ${hasta}
    GROUP BY origen_tipo
  `);
  const out: Partial<Record<OrigenTipo, MovimientoOrigen>> = {};
  for (const f of filas as unknown as { origen: OrigenTipo; asientos: unknown; total: unknown; ultimo: string | null }[]) {
    out[f.origen] = { asientos: Number(f.asientos ?? 0), totalCents: Number(f.total ?? 0), ultimo: f.ultimo };
  }
  return out;
}

/** Una fuente de asientos dentro de un módulo. */
export interface FuenteContable {
  origen: OrigenTipo;
  label: string;
  /** Claves del conteo de pendientes que le corresponden. */
  pendientes: (keyof PendientesPorOrigen)[];
}

export interface ModuloContable {
  clave: 'facturacion' | 'compras' | 'caja' | 'nomina' | 'activos' | 'contabilidad';
  label: string;
  descripcion: string;
  fuentes: FuenteContable[];
}

/**
 * Qué alimenta la contabilidad, agrupado como lo piensa quien usa Zero: por
 * módulo. Cubre TODOS los orígenes del CHECK de `contabilidad_asientos`; un
 * origen nuevo que no se agregue aquí no aparecería en el panorama (lo cuida
 * un test).
 */
export const MODULOS_CONTABLES: ModuloContable[] = [
  {
    clave: 'facturacion', label: 'Facturación',
    descripcion: 'Cada factura, nota de crédito, cobro y anulación genera su asiento.',
    fuentes: [
      { origen: 'factura', label: 'Facturas de venta', pendientes: ['ventas'] },
      { origen: 'nota', label: 'Notas de crédito', pendientes: ['notas'] },
      { origen: 'pago', label: 'Cobros', pendientes: ['cobros'] },
      { origen: 'anulacion', label: 'Anulaciones', pendientes: ['anulaciones'] },
    ],
  },
  {
    clave: 'compras', label: 'Compras y gastos',
    descripcion: 'Comprobantes de proveedores con sus retenciones, anulaciones y pagos.',
    fuentes: [
      { origen: 'compra', label: 'Compras y gastos registrados', pendientes: ['compras'] },
      { origen: 'compra_anulada', label: 'Anulaciones de compras', pendientes: ['compras_anuladas'] },
      { origen: 'pago_proveedor', label: 'Pagos a proveedores', pendientes: ['pagos_proveedor'] },
      { origen: 'gasto_doc', label: 'Gastos menores, exterior e informales', pendientes: ['gastos_doc'] },
    ],
  },
  {
    clave: 'caja', label: 'Caja y punto de venta',
    descripcion: 'Los gastos pagados con el efectivo de la caja.',
    fuentes: [
      { origen: 'gasto_caja', label: 'Gastos de caja', pendientes: ['gastos_caja'] },
    ],
  },
  {
    clave: 'nomina', label: 'Nómina',
    descripcion: 'Al aprobar la corrida se devenga; al pagar sueldos, TSS e ISR se registra el pago.',
    fuentes: [
      { origen: 'nomina', label: 'Devengo de la corrida', pendientes: ['nomina_devengo'] },
      { origen: 'provision_nomina', label: 'Provisiones (regalía, vacaciones, cesantía)', pendientes: ['nomina_provision'] },
      { origen: 'pago_sueldos', label: 'Pago de sueldos', pendientes: ['nomina_pagos_sueldos', 'nomina_pagados_sin_pago'] },
      { origen: 'pago_nomina', label: 'Pago de TSS, ISR e INFOTEP', pendientes: ['nomina_obligaciones'] },
    ],
  },
  {
    clave: 'activos', label: 'Activos fijos',
    descripcion: 'La depreciación de cada mes.',
    fuentes: [
      { origen: 'depreciacion', label: 'Depreciación', pendientes: [] },
    ],
  },
  {
    clave: 'contabilidad', label: 'Contabilidad',
    descripcion: 'Lo que se registra a mano y el cierre del ejercicio.',
    fuentes: [
      { origen: 'manual', label: 'Asientos manuales', pendientes: [] },
      { origen: 'cierre', label: 'Cierre de ejercicio', pendientes: [] },
    ],
  },
];
