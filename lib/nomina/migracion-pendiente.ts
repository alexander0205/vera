/**
 * Las migraciones 0230–0233 (conceptos, cuenta de pago, ausencias, liquidación)
 * pueden llegar a producción un poco después que el código. Mientras tanto, lo
 * que depende de ellas se comporta como «no hay nada»: la nómina de siempre sigue
 * funcionando y no revienta con una tabla o columna que aún no existe.
 */

/** ¿El error es «la tabla o la columna no existe» (42P01 / 42703)? Mira también la causa que envuelve Drizzle. */
export function esMigracionPendiente(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (code === '42P01' || code === '42703') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Corre `fn`; si falla solo porque la migración no corrió, devuelve `vacio`. Cualquier otro error sigue subiendo. */
export async function toleraMigracionPendiente<T>(fn: () => Promise<T>, vacio: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (esMigracionPendiente(err)) return vacio;
    throw err;
  }
}
