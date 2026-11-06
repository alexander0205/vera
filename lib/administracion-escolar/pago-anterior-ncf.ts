/**
 * Lo que la pantalla de pagos de la migración necesita sin base de datos: el
 * NCF a partir de lo poco que se teclea y el estado de lo pagado.
 *
 * Aparte de `pago-anterior.ts` para que el navegador lo use tal cual.
 */

/**
 * Los prefijos de comprobante que un colegio usa al cobrar: crédito fiscal y
 * consumo, en papel (B) o electrónicos (E). El resto de la serie se rellena.
 */
export const PREFIJOS_NCF = ['B01', 'B02', 'E31', 'E32'] as const;
export type PrefijoNcf = (typeof PREFIJOS_NCF)[number];

/** Cuántas cifras lleva la secuencia: 8 en un NCF de papel, 10 en un e-CF. */
export const cifrasDe = (prefijo: string) => (prefijo.startsWith('E') ? 10 : 8);

/**
 * El NCF entero a partir del prefijo y la cola que se tecleó: «B01» + «130»
 * es B0100000130. Si se pegó el NCF completo (con su prefijo) se respeta.
 * `null` si no hay cifras o sobran.
 */
export function armarNcf(prefijo: string, cola: string): string | null {
  const limpio = cola.trim().toUpperCase().replace(/[\s-]/g, '');
  if (/^[BE]\d{2}\d+$/.test(limpio)) {
    const p = limpio.slice(0, 3);
    const n = limpio.slice(3);
    return n.length === cifrasDe(p) ? limpio : null;
  }
  const cifras = limpio.replace(/\D/g, '');
  if (!cifras || cifras !== limpio || cifras.length > cifrasDe(prefijo)) return null;
  return `${prefijo}${cifras.padStart(cifrasDe(prefijo), '0')}`;
}

/** El que sigue en la serie: tras B0100000130, B0100000131. */
export function siguienteNcf(ncf: string): string | null {
  const m = /^([BE]\d{2})(\d+)$/.exec(ncf);
  if (!m) return null;
  const n = String(Number(m[2]) + 1);
  return n.length > m[2].length ? null : `${m[1]}${n.padStart(m[2].length, '0')}`;
}

/** Cómo queda el mes según lo que pagó: lo que se enseña como chip al escribir. */
export function estadoDelPago(montoCentavos: number, pagadoCentavos: number): 'pagado' | 'abono' | 'debe' {
  if (pagadoCentavos <= 0) return 'debe';
  return pagadoCentavos >= montoCentavos ? 'pagado' : 'abono';
}
