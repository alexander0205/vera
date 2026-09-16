/**
 * Configuración contable recomendada: la que sale del catálogo base.
 *
 * Configurar a mano son más de treinta listas —cuentas generales, compras,
 * nómina, provisiones, formas de cobro— y en la reunión del 14-sep-2026 quedó
 * claro que así nadie la termina. Esto la completa en un clic con las cuentas
 * estándar, **sin tocar lo que el usuario ya eligió**: solo llena lo vacío. No
 * enciende la contabilidad; eso sigue siendo una decisión explícita.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { sembrarCuentasBaseFaltantes, CODIGO } from './catalogo-base';
import {
  getConfig, getMetodosConfigurados, guardarConfig, guardarMetodo,
  type ConfigContable, type GuardarConfigInput,
} from './config';
import { CLAVES_METODO, CLAVES_SIN_COBRO, esPasarela, type ClaveMetodo } from './metodos';

/** Qué cuenta base va en cada campo de la configuración. */
export const CAMPOS_RECOMENDADOS: Partial<Record<keyof GuardarConfigInput, string>> = {
  cuentaPorCobrarId:   CODIGO.cuentasPorCobrar,
  cuentaItbisId:       CODIGO.itbisPorPagar,
  cuentaIngresosId:    CODIGO.ingresosMercancia,
  cuentaDescuentosId:  CODIGO.descuentos,
  cuentaMoraId:        CODIGO.ingresosMora,
  cuentaSaldosFavorId: CODIGO.saldosFavorClientes,
  cuentaRetencionesId: CODIGO.retencionesPorCobrar,
  cuentaInventarioId:  '1105',
  cuentaPorPagarId:    '2101',
  cuentaGastosId:      '6101',
  cuentaActivoFijoId:  CODIGO.activoFijo,
  cuentaDeprecAcumId:  CODIGO.depreciacionAcum,
  cuentaGastoDeprecId: CODIGO.gastoDepreciacion,
  cuentaNominaSueldoId:       CODIGO.sueldosSalarios,
  cuentaNominaAportesGastoId: CODIGO.aportesPatronales,
  cuentaNominaRetencionesId:  CODIGO.retencionesTss,
  cuentaNominaIsrPagarId:     CODIGO.isrAsalariados,
  cuentaNominaAportesPagarId: CODIGO.aportesTssPorPagar,
  cuentaNominaInfotepPagarId: CODIGO.infotepPorPagar,
  cuentaNominaPorPagarId:     CODIGO.sueldosPorPagar,
  cuentaProvRegaliaGastoId:    CODIGO.gastoRegalia,
  cuentaProvRegaliaPagarId:    CODIGO.provisionRegalia,
  cuentaProvVacacionesGastoId: CODIGO.gastoVacaciones,
  cuentaProvVacacionesPagarId: CODIGO.provisionVacaciones,
  cuentaProvCesantiaGastoId:   CODIGO.gastoCesantia,
  cuentaProvCesantiaPagarId:   CODIGO.provisionCesantia,
};

/**
 * Dónde entra (o sale) el dinero de cada forma de cobro. Los links de pago van a
 * «Cobros por liquidar» con su comisión, igual que aconseja la pantalla.
 */
export function cuentaRecomendadaMetodo(clave: ClaveMetodo): { cuenta: string; comision: string | null } {
  if (esPasarela(clave)) return { cuenta: CODIGO.cobrosPorLiquidar, comision: CODIGO.comisionCobro };
  if (clave === 'efectivo' || clave === 'otro') return { cuenta: CODIGO.caja, comision: null };
  return { cuenta: CODIGO.bancos, comision: null };
}

export interface ResultadoRecomendada {
  cuentasCreadas: number;
  camposConfigurados: number;
  metodosConfigurados: number;
}

export async function aplicarConfiguracionRecomendada(teamId: number, userId: number): Promise<ResultadoRecomendada> {
  const cuentasCreadas = await sembrarCuentasBaseFaltantes(teamId, userId);

  // Solo las cuentas base que siguen activas e imputables: si el usuario usó un
  // código base para otra cosa, no se le asigna a ciegas.
  const filas = await db.execute(sql`
    SELECT id, codigo FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND es_base AND activa AND imputable
  `);
  const porCodigo = new Map((filas as unknown as { id: number; codigo: string }[]).map((c) => [c.codigo, c.id]));

  const cfg = await getConfig(teamId);
  const input: GuardarConfigInput = {};
  for (const [campo, codigo] of Object.entries(CAMPOS_RECOMENDADOS) as [keyof GuardarConfigInput, string][]) {
    const actual = cfg[campo as keyof ConfigContable];
    const id = porCodigo.get(codigo);
    if ((actual === null || actual === undefined) && id) (input as Record<string, number>)[campo] = id;
  }
  const camposConfigurados = Object.keys(input).length;
  if (camposConfigurados > 0) await guardarConfig(teamId, input, userId);

  const yaConfigurados = new Set((await getMetodosConfigurados(teamId)).map((m) => m.clave));
  let metodosConfigurados = 0;
  for (const clave of CLAVES_METODO) {
    if (CLAVES_SIN_COBRO.includes(clave) || yaConfigurados.has(clave)) continue;
    const r = cuentaRecomendadaMetodo(clave);
    const cuentaId = porCodigo.get(r.cuenta);
    if (!cuentaId) continue;
    await guardarMetodo(teamId, clave, cuentaId, r.comision ? porCodigo.get(r.comision) ?? null : null, userId);
    metodosConfigurados++;
  }

  return { cuentasCreadas, camposConfigurados, metodosConfigurados };
}
