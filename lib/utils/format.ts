/**
 * Utilidades de formato compartidas — UI client + server.
 */

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
