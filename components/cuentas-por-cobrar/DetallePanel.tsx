'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X, Loader2, FileText, Wallet2, AlertTriangle, Receipt, ExternalLink,
} from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import type { DetalleCuenta, EventoCartera } from '@/lib/cobranza/detalle';
import { GestionCobro } from '@/components/cuentas-por-cobrar/GestionCobro';

/** Icono y color por tipo de evento del timeline. */
const EVENTO_UI: Record<EventoCartera['tipo'], {
  Icon: React.ComponentType<{ className?: string }>; punto: string; monto: string;
}> = {
  'emision':      { Icon: FileText,      punto: 'bg-gray-300',    monto: 'text-gray-900' },
  'pago':         { Icon: Wallet2,       punto: 'bg-emerald-500', monto: 'text-emerald-700' },
  'mora':         { Icon: AlertTriangle, punto: 'bg-orange-500',  monto: 'text-orange-700' },
  'nota-credito': { Icon: Receipt,       punto: 'bg-sky-500',     monto: 'text-sky-700' },
};

export function DetallePanel({
  cuenta, onClose, onCobrar,
}: {
  cuenta: Cuenta;
  onClose: () => void;
  onCobrar: (c: Cuenta) => void;
}) {
  const [detalle, setDetalle] = useState<DetalleCuenta | null>(null);
  const [actual, setActual]   = useState<Cuenta>(cuenta);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    fetch(`/api/cuentas-por-cobrar/${cuenta.id}?detalle=1`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Error cargando el detalle');
        return j;
      })
      .then(j => {
        if (!vivo) return;
        setDetalle(j);
        if (j.cuenta) setActual(j.cuenta);
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [cuenta.id]);

  // Cerrar con Escape — el panel no bloquea la lista, pero sí toma el foco.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-label={`Detalle de ${actual.codigo ?? actual.encf}`}
        className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col"
      >
        {/* Encabezado */}
        <header className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {actual.razonSocialComprador ?? 'Consumidor Final'}
            </p>
            <Link
              href={`/dashboard/facturas/${actual.id}`}
              className="text-xs font-mono text-teal-600 hover:underline inline-flex items-center gap-1"
            >
              {actual.codigo ?? actual.encf}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Resumen del saldo — el desglose de la fórmula, no solo el total */}
          <section className="px-4 py-3 border-b border-gray-100">
            <dl className="space-y-1.5 text-sm">
              <Fila label="Total facturado" valor={fmtDOP(actual.montoTotal)} />
              {actual.pagado > 0 && (
                <Fila label="Pagado" valor={`− ${fmtDOP(actual.pagado)}`} clase="text-emerald-700" />
              )}
              {actual.ncAplicado > 0 && (
                <Fila label="Notas de crédito" valor={`− ${fmtDOP(actual.ncAplicado)}`} clase="text-sky-700" />
              )}
              <Fila label="Saldo de la factura" valor={fmtDOP(actual.saldoFactura)} borde />
              {actual.moraSaldo > 0 && (
                <Fila label="Mora pendiente" valor={`+ ${fmtDOP(actual.moraSaldo)}`} clase="text-orange-700" />
              )}
              <div className="flex items-baseline justify-between pt-1.5 border-t border-gray-200">
                <dt className="text-sm font-semibold text-gray-900">Saldo a cobrar</dt>
                <dd className="text-lg font-bold text-gray-900">{fmtDOP(actual.saldo)}</dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center gap-2 text-xs">
              {actual.fechaLimitePago ? (
                <span className={actual.vencida ? 'text-red-700 font-medium' : 'text-gray-500'}>
                  Vence {fmtFechaCorta(actual.fechaLimitePago)}
                  {actual.vencida && ` · ${actual.diasVencido} día${actual.diasVencido !== 1 ? 's' : ''} vencida`}
                </span>
              ) : (
                <span className="text-gray-400">Sin fecha de vencimiento</span>
              )}
            </div>
          </section>

          {/* Timeline */}
          <section className="px-4 py-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Historial
            </h3>

            {loading && (
              <p className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </p>
            )}
            {error && <p className="text-sm text-red-600 py-2">{error}</p>}

            {!loading && !error && detalle && (
              detalle.timeline.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Sin movimientos registrados.</p>
              ) : (
                <ol className="relative space-y-4 pl-5">
                  {/* Línea vertical del timeline */}
                  <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-gray-200" aria-hidden />
                  {detalle.timeline.map((ev, i) => {
                    const ui = EVENTO_UI[ev.tipo];
                    return (
                      <li key={`${ev.tipo}-${i}`} className="relative">
                        <span
                          className={`absolute -left-5 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-white ${ui.punto}`}
                          aria-hidden
                        />
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm text-gray-900 flex items-center gap-1.5">
                            <ui.Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            {ev.titulo}
                          </p>
                          <span className={`text-sm font-medium whitespace-nowrap ${ui.monto}`}>
                            {ev.montoCents < 0 ? '−' : '+'} {fmtDOP(Math.abs(ev.montoCents))}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {fmtFechaCorta(ev.fecha)}
                          {ev.detalle && ` · ${ev.detalle}`}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )
            )}
          </section>

          {/* Gestión de cobro: qué se ha hecho y qué sigue. Separado del
              historial de arriba porque ese es el movimiento del dinero y este
              es la gestión — mezclarlos confundiría lo fiscal con lo interno. */}
          <GestionCobro docId={actual.id} />
        </div>

        {/* Acciones */}
        <footer className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
          <button
            onClick={() => onCobrar(actual)}
            disabled={actual.saldo <= 0}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            <Wallet2 className="h-4 w-4" />
            Registrar pago
          </button>
          <Link
            href={`/dashboard/facturas/${actual.id}`}
            className="px-3 py-2 border border-gray-300 hover:border-teal-300 text-gray-700 hover:text-teal-700 text-sm font-medium rounded-lg"
          >
            Ver factura
          </Link>
        </footer>
      </aside>
    </div>
  );
}

function Fila({ label, valor, clase, borde }: {
  label: string; valor: string; clase?: string; borde?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between ${borde ? 'pt-1.5 border-t border-gray-100' : ''}`}>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium ${clase ?? 'text-gray-900'}`}>{valor}</dd>
    </div>
  );
}
