/**
 * Utilidades de formato compartidas — UI client + server.
 */

/**
 * Días vencidos desde una fecha límite hasta hoy. 0 si futuro o nulo.
 * Usa fechas locales (no UTC) para evitar off-by-1 entre vistas.
 */
export function diasVencido(fechaLimite: string | null | undefined): number {
  if (!fechaLimite) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  // Parse YYYY-MM-DD como fecha local — evita drift TZ
  const [y, m, d] = fechaLimite.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return 0;
  const limite = new Date(y, m - 1, d);
  const diff = Math.floor((hoy.getTime() - limite.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

/** Formato corto fecha YYYY-MM-DD → DD/MM/YYYY (sin TZ shift). */
export function fmtFechaCorta(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const str = typeof iso === 'string' ? iso.split('T')[0] : iso.toISOString().split('T')[0];
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

/** Formato monto centavos → RD$X,XXX.XX */
export function fmtDOP(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea un teléfono RD a `(XXX) XXX-XXXX`. Acepta cualquier input,
 * extrae dígitos (max 10) y aplica máscara progresivamente.
 *
 * Uso en input: `<input onChange={e => setX(formatTelefonoDO(e.target.value))} />`
 */
export function formatTelefonoDO(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
