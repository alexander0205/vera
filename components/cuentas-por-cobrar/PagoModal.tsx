'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { PagoMetodos, pagosValidos, type PagoLinea, type NotaCreditoDisponible } from '@/components/pagos/PagoMetodos';

/**
 * Cuenta por cobrar (factura con saldo pendiente). Shape devuelto por
 * `getCuentasPorCobrar` — compartido entre el módulo de Cuentas por Cobrar y
 * cualquier vista que reutilice el modal de cobro (p. ej. el perfil escolar).
 */
export interface Cuenta {
  id:                   number;
  clientId:             number | null;
  encf:                 string;
  codigo:               string | null;
  tipoEcf:              string;
  fechaEmision:         string;
  fechaLimitePago:      string | null;
  rncComprador:         string | null;
  razonSocialComprador: string | null;
  emailComprador:       string | null;
  estado:               string;
  montoTotal:           number;
  totalItbis:           number;
  pagado:               number;
  // saldo = saldoFactura + moraSaldo (TOTAL combinado a cobrar).
  saldo:                number;
  // Saldo SOLO de la factura (montoTotal − pagado).
  saldoFactura:         number;
  // Saldo combinado de las ND de mora atadas a esta factura.
  moraSaldo:            number;
  // Lista de ND de mora con saldo > 0 (para desglose).
  moraNotas?:           { id: number; codigo: string | null; saldo: number }[];
  vencida:              boolean;
  diasVencido:          number;
}

interface LineaFactura {
  nombreItem?: string;
  cantidadItem?: number | string;
  precioUnitarioItem?: number | string;
}

/**
 * Modal de registro de pago sobre una cuenta por cobrar. Reutilizable: se usa
 * desde el listado de Cuentas por Cobrar y desde el perfil del estudiante (el
 * flujo de datos es idéntico — POST a `/api/cuentas-por-cobrar/[id]/pagos`).
 * Muestra arriba el detalle de la factura asociada.
 */
export function PagoModal({
  cuenta, onClose, onSuccess,
}: {
  cuenta: Cuenta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // saldo = saldoFactura + moraSaldo (combinado). Montos en DOP.
  const saldoDOP        = cuenta.saldo / 100;        // combinado, disponible a abonar
  // El repeater valida contra (total − yaPagado). Con yaPagado=0, el cap es el
  // saldo combinado factura + mora.
  const totalDOP  = saldoDOP;
  const pagadoDOP = 0;
  const [fecha, setFecha]         = useState(today);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // Cuando el pago se bloquea por método que obliga DGII sobre factura no emitida,
  // el backend devuelve el link al detalle para emitirla primero.
  const [emitirUrl, setEmitirUrl] = useState<string | null>(null);

  // Notas de crédito del cliente usables como pago (voucher por código, uso parcial).
  const [notasCredito, setNotasCredito] = useState<NotaCreditoDisponible[]>([]);

  // Detalle de la factura (líneas) para mostrar arriba. Best-effort.
  const [lineasFactura, setLineasFactura] = useState<LineaFactura[]>([]);

  useEffect(() => {
    if (!cuenta.clientId) { setNotasCredito([]); return; }
    let vivo = true;
    fetch(`/api/clientes/${cuenta.clientId}/notas-credito-disponibles`)
      .then(r => r.json())
      .then(j => { if (vivo) setNotasCredito(Array.isArray(j.notas) ? j.notas : []); })
      .catch(() => { if (vivo) setNotasCredito([]); });
    return () => { vivo = false; };
  }, [cuenta.clientId]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/facturas/${cuenta.id}`)
      .then(r => r.json())
      .then(j => { if (vivo) setLineasFactura(Array.isArray(j.lineas) ? j.lineas : []); })
      .catch(() => { if (vivo) setLineasFactura([]); });
    return () => { vivo = false; };
  }, [cuenta.id]);

  // Una o varias líneas (1 línea = pago normal). AR usa referencia.
  const [lineas, setLineas] = useState<PagoLinea[]>([
    { metodo: 'transferencia', valor: '', referencia: '' },
  ]);

  const valido = pagosValidos(lineas, totalDOP, pagadoDOP);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    setError(null);
    setEmitirUrl(null);
    try {
      const pagos = lineas
        .filter(l => (parseFloat(l.valor || '0') || 0) > 0)
        .map(l => ({
          montoDOP:      parseFloat(l.valor),
          metodo:        l.metodo,
          referencia:    l.referencia?.trim() || undefined,
          notaCreditoId: l.notaCreditoId ?? undefined,
        }));

      const res = await fetch(`/api/cuentas-por-cobrar/${cuenta.id}/pagos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaPago: fecha, pagos }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmitirUrl(typeof json.emitirUrl === 'string' ? json.emitirUrl : null);
        throw new Error(json.error ?? 'Error al registrar pago');
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  }

  const cliente = cuenta.razonSocialComprador ?? 'Consumidor final';
  const docRef = cuenta.codigo || cuenta.encf || `Factura #${cuenta.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Registrar pago</h2>
            <p className="text-xs text-gray-500 mt-0.5">{docRef}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Detalle de la factura asociada (arriba) */}
          <div className="border border-gray-200 rounded-lg p-3 text-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{cliente}</p>
                {cuenta.rncComprador && <p className="text-xs text-gray-500">RNC {cuenta.rncComprador}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-500">Emitida {fmtFechaCorta(cuenta.fechaEmision)}</p>
                {cuenta.fechaLimitePago && (
                  <p className={`text-xs ${cuenta.vencida ? 'text-red-600' : 'text-gray-500'}`}>
                    Vence {fmtFechaCorta(cuenta.fechaLimitePago)}
                  </p>
                )}
              </div>
            </div>
            {lineasFactura.length > 0 && (
              <div className="border-t border-gray-100 pt-2 space-y-1">
                {lineasFactura.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-600 truncate">
                      {Number(l.cantidadItem ?? 1)} × {l.nombreItem ?? 'Ítem'}
                    </span>
                    <span className="text-gray-700 shrink-0">
                      {fmtDOP(Math.round(Number(l.precioUnitarioItem ?? 0) * Number(l.cantidadItem ?? 1) * 100))}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-1.5 text-xs">
              <span className="text-gray-500">Total factura (incl. ITBIS)</span>
              <span className="text-gray-700">{fmtDOP(cuenta.montoTotal)}</span>
            </div>
          </div>

          {/* Saldo / total a cobrar */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Saldo factura</span>
              <span className="text-gray-700">{fmtDOP(cuenta.saldoFactura)}</span>
            </div>
            {cuenta.moraSaldo > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Mora</span>
                <span className="text-orange-600">{fmtDOP(cuenta.moraSaldo)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-medium">
              <span className="text-gray-700">Total a cobrar</span>
              <span className="text-gray-900">{fmtDOP(cuenta.saldo)}</span>
            </div>
            {cuenta.moraSaldo > 0 && (
              <p className="text-[11px] text-gray-400 pt-0.5">
                El pago cubre primero la factura; el resto se aplica a la mora.
              </p>
            )}
          </div>

          {/* Fecha (compartida) */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <PagoMetodos
            lineas={lineas}
            onChange={setLineas}
            total={totalDOP}
            yaPagado={pagadoDOP}
            disabled={guardando}
            showReferencia
            notasCredito={notasCredito}
          />

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div className="text-xs text-red-700 space-y-1.5">
                <p>{error}</p>
                {emitirUrl && (
                  <Link
                    href={emitirUrl}
                    className="inline-flex items-center gap-1 font-semibold text-red-800 underline underline-offset-2 hover:text-red-900"
                  >
                    Ir a emitir la factura →
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || !valido}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar pago
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
