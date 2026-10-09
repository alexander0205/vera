/**
 * Pago mixto de una compra o gasto de contado: parte en efectivo, parte por
 * transferencia, parte con tarjeta… Cada parte sale de su propia caja o banco.
 * Funciones puras, sin base de datos.
 *
 * El asiento acredita cada parte a su cuenta; la suma de las partes tiene que
 * ser EXACTAMENTE lo que se paga (el total menos las retenciones), si no el
 * asiento no cuadraría.
 */

/** Con qué se puede pagar una parte (no incluye «mixto»: una parte no es otra mezcla). */
export const METODOS_PARTE_MIXTA = ['efectivo', 'transferencia', 'cheque', 'tarjeta', 'deposito'] as const;
export type MetodoParteMixta = (typeof METODOS_PARTE_MIXTA)[number];

export const PARTES_MIN = 2;
export const PARTES_MAX = 6;

export interface ParteMixta {
  metodo: MetodoParteMixta;
  /** Caja o banco de donde salió esa parte; null = la del método de pago. */
  cuentaSalidaId: number | null;
  montoCents: number;
}

export type ValidacionPartes = { ok: true; partes: ParteMixta[] } | { ok: false; error: string };

const pesos = (c: number) => `RD$${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Valida lo que llega del formulario. `netoCents` es lo que se paga de verdad
 * (total − retenciones); `cuentasPermitidas` las cajas y bancos de la empresa.
 */
export function validarPartes(entrada: unknown, netoCents: number, cuentasPermitidas: ReadonlySet<number>): ValidacionPartes {
  if (!Array.isArray(entrada)) return { ok: false, error: 'Un pago mixto necesita sus partes: cuánto se pagó con cada método.' };
  if (entrada.length < PARTES_MIN) return { ok: false, error: `Un pago mixto lleva al menos ${PARTES_MIN} partes. Si es un solo método, elígelo directamente.` };
  if (entrada.length > PARTES_MAX) return { ok: false, error: `Un pago mixto no pasa de ${PARTES_MAX} partes.` };

  const partes: ParteMixta[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i < entrada.length; i++) {
    const n = i + 1;
    const p = entrada[i] as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') return { ok: false, error: `Parte ${n}: no es válida.` };
    const metodo = (METODOS_PARTE_MIXTA as readonly unknown[]).includes(p.metodo) ? (p.metodo as MetodoParteMixta) : null;
    if (!metodo) return { ok: false, error: `Parte ${n}: elige efectivo, transferencia, cheque, tarjeta o depósito.` };
    if (typeof p.montoCents !== 'number' || !Number.isSafeInteger(p.montoCents) || p.montoCents <= 0) {
      return { ok: false, error: `Parte ${n}: el monto debe ser mayor que cero.` };
    }
    let cuentaSalidaId: number | null = null;
    if (p.cuentaSalidaId !== null && p.cuentaSalidaId !== undefined && p.cuentaSalidaId !== '') {
      if (typeof p.cuentaSalidaId !== 'number' || !cuentasPermitidas.has(p.cuentaSalidaId)) {
        return { ok: false, error: `Parte ${n}: de esa cuenta no puede salir dinero. Elige una caja o un banco.` };
      }
      cuentaSalidaId = p.cuentaSalidaId;
    }
    // Dos partes con el mismo método y la misma cuenta son una sola mal repartida.
    const clave = `${metodo}|${cuentaSalidaId ?? 'auto'}`;
    if (vistas.has(clave)) return { ok: false, error: `Parte ${n}: repite el mismo método y la misma cuenta de otra parte. Júntalas en una.` };
    vistas.add(clave);
    partes.push({ metodo, cuentaSalidaId, montoCents: p.montoCents });
  }

  const suma = partes.reduce((s, p) => s + p.montoCents, 0);
  if (suma !== netoCents) {
    const dif = netoCents - suma;
    return {
      ok: false,
      error: dif > 0
        ? `Las partes suman ${pesos(suma)} y se pagan ${pesos(netoCents)}: faltan ${pesos(dif)}.`
        : `Las partes suman ${pesos(suma)} y se pagan ${pesos(netoCents)}: sobran ${pesos(-dif)}.`,
    };
  }
  return { ok: true, partes };
}

/** Lo que se guarda en la base y vuelve a leerse: descarta lo que no tenga la forma de una parte. */
export function partesDeJson(v: unknown): ParteMixta[] | null {
  if (!Array.isArray(v)) return null;
  const partes: ParteMixta[] = [];
  for (const p of v as Record<string, unknown>[]) {
    if (!p || !(METODOS_PARTE_MIXTA as readonly unknown[]).includes(p.metodo) || typeof p.montoCents !== 'number' || !(p.montoCents > 0)) return null;
    partes.push({
      metodo: p.metodo as MetodoParteMixta,
      cuentaSalidaId: typeof p.cuentaSalidaId === 'number' ? p.cuentaSalidaId : null,
      montoCents: p.montoCents,
    });
  }
  return partes.length >= PARTES_MIN ? partes : null;
}
