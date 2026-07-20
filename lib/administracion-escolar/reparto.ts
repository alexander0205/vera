/**
 * Reparto de lo cobrado en una factura entre los cargos escolares que cubre.
 *
 * Lógica PURA (sin DB) para que el cálculo de dinero se pueda probar solo.
 * La usa `sincronizarSaldosDesdeFacturas` en lib/administracion-escolar/queries.ts.
 */

/** Lo mínimo que el reparto necesita saber de un cargo. Todo en centavos. */
export interface CargoParaReparto {
  id: number;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

export interface SaldoCalculado {
  id: number;
  saldo: number;
  estado: 'pagado' | 'parcial' | 'vencido' | 'pendiente';
  /** true = el cargo deja de apuntar a la factura (se anuló el documento). */
  desvincular: boolean;
}

/** Cascada: vence antes primero; sin vencimiento va al final; empate por id. */
export function ordenarPorVencimiento<T extends CargoParaReparto>(cargos: T[]): T[] {
  return [...cargos].sort((a, b) => {
    const va = a.fechaVencimiento ?? '9999-12-31';
    const vb = b.fechaVencimiento ?? '9999-12-31';
    if (va !== vb) return va < vb ? -1 : 1;
    return a.id - b.id;
  });
}

function estadoDe(cargo: CargoParaReparto, saldo: number, aplicado: number, hoy: string) {
  if (saldo === 0) return 'pagado' as const;
  if (aplicado > 0) return 'parcial' as const;
  if (cargo.fechaVencimiento && cargo.fechaVencimiento < hoy) return 'vencido' as const;
  return 'pendiente' as const;
}

/**
 * Reparte `cobrado` entre `cargos`, en cascada por vencimiento.
 *
 * El tope de cada cargo es su propio `montoCentavos`: la factura suele valer
 * más que la suma de sus cargos (ITBIS, líneas que no son del colegio) y ese
 * excedente no es deuda de nadie. `cobrado` ya debe venir con las notas de
 * crédito sumadas.
 *
 * `facturaAnulada`: el documento se anula pero la acreencia sigue viva — cada
 * cargo recupera su saldo completo y se desvincula para poder re-facturarse.
 * `facturaSaldada`: la factura quedó PAGADA/GRATUITA — todo lo que cubre queda
 * saldado, sin depender de que el ledger cuadre al centavo.
 */
export function repartirCobro(
  cargos: CargoParaReparto[],
  cobrado: number,
  hoy: string,
  opts: { facturaAnulada?: boolean; facturaSaldada?: boolean } = {},
): SaldoCalculado[] {
  const orden = ordenarPorVencimiento(cargos);

  if (opts.facturaAnulada) {
    return orden.map(c => ({
      id: c.id,
      saldo: c.montoCentavos,
      estado: estadoDe(c, c.montoCentavos, 0, hoy),
      desvincular: true,
    }));
  }

  let restante = Math.max(0, cobrado);
  return orden.map(c => {
    const aplicado = opts.facturaSaldada ? c.montoCentavos : Math.min(restante, c.montoCentavos);
    restante -= aplicado;
    const saldo = Math.max(0, c.montoCentavos - aplicado);
    return { id: c.id, saldo, estado: estadoDe(c, saldo, aplicado, hoy), desvincular: false };
  });
}
