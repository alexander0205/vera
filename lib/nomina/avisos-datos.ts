// Avisos de datos que faltan o confunden, solo para mostrar en pantalla.
// No intervienen en ningún cálculo de la nómina.

/** Solo los dígitos de lo que se escribió. */
export function soloDigitos(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** La cédula dominicana tiene 11 dígitos. Solo se mira el formato, no el dígito verificador. */
export function cedulaConFormato(v: string | null | undefined): boolean {
  return soloDigitos(v).length === 11;
}

/** Texto de aviso para la ficha: null si la cédula está bien. */
export function avisoCedula(v: string | null | undefined): string | null {
  const d = soloDigitos(v);
  if (d.length === 0) {
    return 'Sin cédula: el archivo de la TSS la lleva en blanco y el importador de Excel no podrá actualizar a esta persona.';
  }
  if (d.length !== 11) return `La cédula debe tener 11 dígitos (tiene ${d.length}). Así no entra bien en la TSS.`;
  return null;
}

/** Nombres de las líneas de una corrida cuya cédula falta o no tiene 11 dígitos. */
export function nombresSinCedula(lineas: { nombre: string; cedula: string | null }[]): string[] {
  return lineas.filter((l) => !cedulaConFormato(l.cedula)).map((l) => l.nombre);
}

/**
 * Cuánto suma al mes un monto "por corrida" según la frecuencia, o null si la
 * frecuencia es mensual o el monto no es un número válido.
 */
export function equivalenteMensual(frecuencia: string, montoTexto: string): { corridas: number; totalPesos: number } | null {
  const monto = Number(String(montoTexto ?? '').replace(/,/g, ''));
  if (!Number.isFinite(monto) || monto <= 0) return null;
  if (frecuencia === 'quincenal') return { corridas: 2, totalPesos: Math.round(monto * 2 * 100) / 100 };
  return null;
}
