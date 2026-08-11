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

const TZ_RD = 'America/Santo_Domingo';

/** Hora de un timestamp (created_at, etc.) en zona RD. Ej: "8:03 p. m.". */
export function fmtHora(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-DO', {
    timeZone: TZ_RD, hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** Fecha (sin hora) de un timestamp en zona RD. Ej: "26/06/2026". */
export function fmtFechaRD(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-DO', {
    timeZone: TZ_RD, day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/** Fecha + hora en zona RD. Ej: "26/06/2026 8:03 p. m.". */
export function fmtFechaHora(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '—';
  const fecha = d.toLocaleDateString('es-DO', {
    timeZone: TZ_RD, day: '2-digit', month: '2-digit', year: 'numeric',
  });
  return `${fecha} ${fmtHora(d)}`;
}

/** Formato monto centavos → RD$X,XXX.XX */
export function fmtDOP(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Cola del código interno de un comprobante, para listados.
 * `FA-2026-CAND-Q3YY7-000446` → `Q3YY7-000446`.
 *
 * El prefijo (tipo + año + empresa) se repite en todas las filas de un listado:
 * ocupa la mitad de la columna sin distinguir nada. Los dos últimos segmentos
 * sí identifican al documento. El código completo va en el `title` para quien
 * lo necesite copiar.
 *
 * Sin guiones (códigos legacy) devuelve los últimos 8 caracteres.
 */
export function fmtCodigoCorto(codigo: string | null | undefined): string {
  if (!codigo) return '';
  const partes = codigo.split('-').filter(Boolean);
  if (partes.length >= 2) return partes.slice(-2).join('-');
  return codigo.length > 8 ? codigo.slice(-8) : codigo;
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
