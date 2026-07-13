/**
 * POS — Reporte de turno (corte X/Z).
 *
 * X = lectura del turno sin cerrar (en curso). Z = resumen del turno cerrado.
 * Reusa el cálculo de caja: ventas por método + efectivo esperado. Agrega los
 * productos más vendidos a partir de las líneas guardadas (lineasJson) de las
 * ventas atadas al turno.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, posTerminales, almacenes } from '@/lib/db/schema';
import { getTurno, calcularEsperado, getVentasPorMetodo, type DesgloseEsperado, type VentaPorMetodo } from '@/lib/caja/core';

export interface TopProducto { nombre: string; cantidad: number; importeCentavos: number; }

export interface ReporteTurno {
  turno: {
    id: number; estado: string; numeroCierre: string | null;
    aperturaAt: string; montoAperturaCentavos: number;
    terminalNombre: string | null; almacenNombre: string | null;
  };
  tipo: 'X' | 'Z';                 // X = abierto/en curso, Z = cerrado
  ventasPorMetodo: VentaPorMetodo[];
  totalVendidoCentavos: number;
  numeroVentas: number;
  esperado: DesgloseEsperado;
  topProductos: TopProducto[];
}

interface LineaJson { nombreItem?: string; cantidadItem?: number; precioUnitarioItem?: number }

export async function getReporteTurno(teamId: number, turnoId: number): Promise<ReporteTurno | null> {
  const turno = await getTurno(teamId, turnoId);
  if (!turno) return null;

  const [esperado, ventasPorMetodo, docs] = await Promise.all([
    calcularEsperado(teamId, turno),
    getVentasPorMetodo(teamId, turnoId),
    db.select({ lineasJson: ecfDocuments.lineasJson })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.turnoCajaId, turnoId))),
  ]);

  // Nombres de terminal y almacén (si el turno es de un POS).
  let terminalNombre: string | null = null;
  let almacenNombre: string | null = null;
  if (turno.terminalId) {
    const [t] = await db
      .select({ tn: posTerminales.nombre, an: almacenes.nombre })
      .from(posTerminales)
      .leftJoin(almacenes, eq(almacenes.id, posTerminales.almacenId))
      .where(eq(posTerminales.id, turno.terminalId)).limit(1);
    terminalNombre = t?.tn ?? null;
    almacenNombre = t?.an ?? null;
  }

  // Top productos desde las líneas guardadas.
  const acc = new Map<string, TopProducto>();
  for (const d of docs) {
    if (!d.lineasJson) continue;
    let lineas: LineaJson[] = [];
    try { lineas = JSON.parse(d.lineasJson) as LineaJson[]; } catch { continue; }
    for (const l of lineas) {
      const nombre = l.nombreItem ?? '—';
      const cant = Number(l.cantidadItem ?? 0);
      const importe = Math.round(Number(l.precioUnitarioItem ?? 0) * cant * 100);
      const cur = acc.get(nombre) ?? { nombre, cantidad: 0, importeCentavos: 0 };
      cur.cantidad += cant;
      cur.importeCentavos += importe;
      acc.set(nombre, cur);
    }
  }
  const topProductos = [...acc.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);

  const totalVendidoCentavos = ventasPorMetodo.reduce((s, v) => s + v.total, 0);

  return {
    turno: {
      id: turno.id, estado: turno.estado, numeroCierre: turno.numeroCierre,
      aperturaAt: turno.aperturaAt.toISOString(), montoAperturaCentavos: turno.montoAperturaCentavos,
      terminalNombre, almacenNombre,
    },
    tipo: turno.estado === 'CERRADO' ? 'Z' : 'X',
    ventasPorMetodo,
    totalVendidoCentavos,
    numeroVentas: docs.length,
    esperado,
    topProductos,
  };
}
