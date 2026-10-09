import { describe, it, expect } from 'vitest';
import { ORIGENES } from '@/lib/contabilidad/libro-diario';
import { MODULOS_CONTABLES } from '@/lib/contabilidad/panorama';

// Las columnas de contarPendientesPorOrigen.
const CLAVES_PENDIENTES = [
  'ventas', 'notas', 'cobros', 'anulaciones', 'compras', 'compras_anuladas', 'pagos_proveedor', 'gastos_caja', 'gastos_doc',
  'nomina_devengo', 'nomina_provision', 'nomina_pagados_sin_pago', 'nomina_pagos_sueldos', 'nomina_obligaciones',
];

describe('panorama contable', () => {
  it('cada origen del libro aparece una sola vez en algún módulo', () => {
    const origenes = MODULOS_CONTABLES.flatMap((m) => m.fuentes.map((f) => f.origen));
    expect([...origenes].sort()).toEqual([...ORIGENES].sort());
  });

  it('cada conteo de pendientes pertenece a una sola fuente', () => {
    const claves = MODULOS_CONTABLES.flatMap((m) => m.fuentes.flatMap((f) => f.pendientes));
    expect([...claves].sort()).toEqual([...CLAVES_PENDIENTES].sort());
  });
});
