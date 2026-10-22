'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CalendarClock, CalendarRange, HandCoins } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { ResumenCobro } from '@/lib/administracion-escolar/resumen-cobro';

/**
 * Las cuatro cifras de cobro, con los mismos nombres y colores en todos los
 * paneles (Responsables, Matriculación, Estudiantes). La regla vive en
 * lib/administracion-escolar/resumen-cobro.ts; la ficha de la familia las pinta
 * en grande con esa misma regla y estos mismos textos (`textosResumenCobro`).
 */

const MES = new Intl.DateTimeFormat('es-DO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const mesDe = (fecha: string) => MES.format(new Date(`${fecha}T12:00:00Z`)).replace('.', '');

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que dice debajo de cada cifra. Compartido con la ficha de la familia. */
export function textosResumenCobro(r: ResumenCobro, pagoNota?: string | null) {
  const v = r.vencido;
  const detallesVencido = [
    v.partidas > 0 ? `${plural(v.partidas, 'cobro', 'cobros')}, el más viejo del ${fmtFechaCorta(v.desde)}` : null,
    v.sinFacturaCentavos > 0 ? `${fmtDOP(v.sinFacturaCentavos)} sin factura todavía` : null,
    v.ajenoCentavos > 0 ? `${fmtDOP(v.ajenoCentavos)} de facturas fuera del colegio` : null,
  ].filter(Boolean).join(' · ');
  return {
    vencido: v.centavos > 0 ? detallesVencido : 'Nada vencido',
    proximo: r.proximo.centavos > 0
      ? (r.proximo.fecha ? `Vence el ${fmtFechaCorta(r.proximo.fecha)}` : 'Sin fecha límite: se paga ya')
      : 'Nada por pagar ahora',
    falta: r.falta.centavos > 0
      ? `${plural(r.falta.partidas, 'cuota', 'cuotas')}${r.falta.desde && r.falta.hasta
        ? ` · ${mesDe(r.falta.desde) === mesDe(r.falta.hasta) ? mesDe(r.falta.desde) : `${mesDe(r.falta.desde)} – ${mesDe(r.falta.hasta)}`}`
        : ''} · aún no se deben`
      : 'Nada más este año',
    pagado: pagoNota ?? (r.pagadoCentavos > 0 ? 'Lo cobrado' : 'Todavía sin pagos'),
  };
}

export function ResumenCobroFilas({ resumen, pagoNota }: {
  resumen: ResumenCobro;
  /** Debajo de «Pagado», si se sabe algo mejor que «Lo cobrado» (p. ej. el último pago). */
  pagoNota?: string | null;
}) {
  const t = textosResumenCobro(resumen, pagoNota);
  return (
    <div className="space-y-2.5">
      <Fila icono={<AlertTriangle className="h-4 w-4" />} tono="rojo" etiqueta="Vencido"
        valor={resumen.vencido.centavos} nota={t.vencido} />
      <Fila icono={<CalendarClock className="h-4 w-4" />} tono="ambar" etiqueta="Próximo pago"
        valor={resumen.proximo.centavos} nota={t.proximo} />
      <Fila icono={<CalendarRange className="h-4 w-4" />} tono="gris" etiqueta="Falta del año"
        valor={resumen.falta.centavos} nota={t.falta} />
      <Fila icono={<HandCoins className="h-4 w-4" />} tono="verde" etiqueta="Pagado"
        valor={resumen.pagadoCentavos} nota={t.pagado} />
      <p className="pt-0.5 text-right text-[11px] text-gray-500">
        Total del año: <span className="font-medium tabular-nums text-gray-700">{fmtDOP(resumen.totalCentavos)}</span>
      </p>
    </div>
  );
}

const TONOS = {
  rojo: { caja: 'bg-red-100 text-red-600', valor: 'text-red-600' },
  ambar: { caja: 'bg-amber-100 text-amber-700', valor: 'text-amber-700' },
  gris: { caja: 'bg-gray-100 text-gray-600', valor: 'text-gray-900' },
  verde: { caja: 'bg-emerald-100 text-emerald-700', valor: 'text-emerald-700' },
} as const;

function Fila({ icono, tono, etiqueta, valor, nota }: {
  icono: ReactNode; tono: keyof typeof TONOS; etiqueta: string; valor: number; nota: string;
}) {
  const cero = valor <= 0;
  const t = TONOS[tono];
  return (
    <div className="flex items-start gap-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cero ? 'bg-gray-100 text-gray-400' : t.caja}`}>
        {icono}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-gray-700">{etiqueta}</span>
          <span className={`text-sm font-semibold tabular-nums ${cero ? 'text-gray-400' : t.valor}`}>{fmtDOP(Math.max(0, valor))}</span>
        </div>
        <p className="text-[11px] leading-snug text-gray-500">{nota}</p>
      </div>
    </div>
  );
}
