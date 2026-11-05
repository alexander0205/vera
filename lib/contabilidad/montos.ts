/**
 * Lectura segura de montos y fechas que llegan de un formulario o de un
 * archivo. Puras, sin base de datos.
 */

/** Tope de un monto: 100 millones de pesos, en centavos. */
export const MONTO_MAX_CENTS = 10_000_000_000;

export type MontoParseado = { ok: true; cents: number } | { ok: false; error: string };

/**
 * Pesos (número o texto) a centavos. El texto admite coma de miles
 * («1,500.00») pero no coma decimal («12,50» es ambiguo) ni más de dos
 * decimales (0.001 no es un monto). Positivo y con tope.
 */
export function parseMontoPesos(v: unknown, nombre = 'El monto'): MontoParseado {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const t = v.trim().replace(/^RD\$\s*/i, '');
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) {
      return { ok: false, error: /\.\d{3,}$/.test(t) ? `${nombre} no puede tener más de dos decimales` : `${nombre} no es un número válido` };
    }
    n = Number(t.replace(/,/g, ''));
  } else return { ok: false, error: `${nombre} no es un número válido` };

  if (!Number.isFinite(n)) return { ok: false, error: `${nombre} no es un número válido` };
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) return { ok: false, error: `${nombre} no puede tener más de dos decimales` };
  if (cents <= 0) return { ok: false, error: `${nombre} debe ser mayor que cero` };
  if (cents > MONTO_MAX_CENTS) return { ok: false, error: `${nombre} no puede pasar de RD$100,000,000` };
  return { ok: true, cents };
}

/** Una fecha 'YYYY-MM-DD' real y razonable (2000–2100): 9999-12-31 es casi seguro un error. */
export function fechaRazonable(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  if (a < 2000 || a > 2100) return false;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}
