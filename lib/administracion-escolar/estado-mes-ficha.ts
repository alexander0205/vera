import { hoyRD } from '@/lib/utils/format';

type CargoDelMes = {
  estado: string;
  fechaVencimiento: string | null;
  ecfDocumentId: number | null;
};

/** Estado visible del mes: la fecha vencida solo aplica a cargos ya facturados. */
export function estadoMes(cargos: CargoDelMes[], hoy = hoyRD()) {
  if (cargos.length === 0) return 'sin-cargo';
  const vivos = cargos.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado));
  if (vivos.length === 0) {
    const futura = cargos.some((c) => c.fechaVencimiento && c.fechaVencimiento >= hoy);
    return futura ? 'adelantado' : 'pagado';
  }
  if (vivos.some((c) => c.ecfDocumentId != null
    && (c.estado === 'vencido' || (c.fechaVencimiento && c.fechaVencimiento < hoy)))) return 'vencido';
  if (vivos.every((c) => c.ecfDocumentId == null)) return 'sin-facturar';
  if (vivos.some((c) => c.estado === 'parcial')) return 'parcial';
  return 'pendiente';
}
