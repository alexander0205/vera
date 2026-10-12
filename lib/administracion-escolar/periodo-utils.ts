export interface MesDelPeriodo {
  mes: number;
  anio: number;
  key: string;
}

function parseFecha(fecha: string | null | undefined): { anio: number; mes: number } | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const [anio, mes] = fecha.split('-').map(Number);
  if (!Number.isInteger(anio) || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

function indiceMes(anio: number, mes: number) {
  return anio * 12 + mes - 1;
}

/**
 * Meses académicos en orden cronológico real. Un período 2025-08-01 →
 * 2026-06-30 devuelve agosto 2025 hasta junio 2026; nunca enero→diciembre
 * por defecto. Períodos históricos sin rango devuelven [] para que la UI los
 * identifique como no configurados, sin inventar un calendario.
 */
export function mesesDelPeriodo(
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
): MesDelPeriodo[] {
  const inicio = parseFecha(fechaInicio);
  const fin = parseFecha(fechaFin);
  if (!inicio || !fin) return [];

  const desde = indiceMes(inicio.anio, inicio.mes);
  const hasta = indiceMes(fin.anio, fin.mes);
  if (hasta < desde) return [];

  return Array.from({ length: hasta - desde + 1 }, (_, i) => {
    const indice = desde + i;
    const anio = Math.floor(indice / 12);
    const mes = (indice % 12) + 1;
    return { mes, anio, key: `${anio}-${String(mes).padStart(2, '0')}` };
  });
}

export function rangoPeriodoEsValido(
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
): boolean {
  const inicio = parseFecha(fechaInicio);
  const fin = parseFecha(fechaFin);
  return !!inicio && !!fin && indiceMes(fin.anio, fin.mes) >= indiceMes(inicio.anio, inicio.mes);
}

export function mesPerteneceAlPeriodo(
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
  mes: unknown,
  anio: unknown,
): boolean {
  if (!Number.isInteger(mes) || !Number.isInteger(anio) || Number(mes) < 1 || Number(mes) > 12) return false;
  // Períodos creados antes de MD3 no tienen rango. Se conservan editables;
  // la UI los señala para que se les configure el calendario real.
  if (!fechaInicio && !fechaFin) return true;
  return mesesDelPeriodo(fechaInicio, fechaFin)
    .some((m) => m.mes === mes && m.anio === anio);
}
