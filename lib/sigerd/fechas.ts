/**
 * Conversión de fechas de SIGERD.
 *
 * Vive aparte porque la usan tanto `importar.ts` como `ficha.ts`, y tenerla en
 * uno de los dos crearía un ciclo de imports entre ellos.
 */

/**
 * `dd/MM/yyyy` → ISO `yyyy-MM-dd`.
 *
 * El formato se confirmó sobre 20 registros reales: el primer grupo llega a 30
 * y el segundo nunca pasa de 12, así que no hay ambigüedad con el formato
 * americano. Devuelve `null` ante cualquier cosa que no encaje, en vez de
 * inventar una fecha.
 */
export function aFechaISO(fecha: string | null | undefined): string | null {
  if (!fecha) return null;

  const m = fecha.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;

  const [, dia, mes, anio] = m;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;

  return `${anio}-${mes}-${dia}`;
}
