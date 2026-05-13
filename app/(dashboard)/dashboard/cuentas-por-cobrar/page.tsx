'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2, AlertTriangle, CheckCircle, Clock, DollarSign,
  X, Wallet, Calendar,
} from 'lucide-react';

interface Cuenta {
  id:                   number;
  encf:                 string;
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
  saldo:                number;
  vencida:              boolean;
  diasVencido:          number;
}

interface Totales {
  pendiente:     number;
  vencido:       number;
  count:         number;
  countVencidas: number;
}

const METODOS = [
  { value: 'efectivo',       label: 'Efectivo' },
  { value: 'transferencia',  label: 'Transferencia' },
  { value: 'tarjeta',        label: 'Tarjeta' },
  { value: 'cheque',         label: 'Cheque' },
  { value: 'deposito',       label: 'Depósito' },
  { value: 'otro',           label: 'Otro' },
];

function fmtDOP(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CuentasPorCobrarPage() {
  const [data, setData]         = useState<{ cuentas: Cuenta[]; totales: Totales } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filtro, setFiltro]     = useState<'todas' | 'vencidas'>('todas');
  const [pagoModal, setPagoModal] = useState<Cuenta | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filtro === 'vencidas'
        ? '/api/cuentas-por-cobrar?soloVencidas=true'
        : '/api/cuentas-por-cobrar';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cuentas por cobrar</h1>
        <p className="text-sm text-gray-500 mt-1">
          Facturas a crédito pendientes de pago. Registra abonos y monitorea vencimientos.
        </p>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Pendiente total"
            value={fmtDOP(data.totales.pendiente)}
            color="text-gray-900"
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Vencido"
            value={fmtDOP(data.totales.vencido)}
            color="text-red-600"
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Facturas activas"
            value={data.totales.count.toString()}
            color="text-gray-900"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Facturas vencidas"
            value={data.totales.countVencidas.toString()}
            color={data.totales.countVencidas > 0 ? 'text-red-600' : 'text-gray-900'}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        <FilterPill active={filtro === 'todas'}    onClick={() => setFiltro('todas')}>Todas</FilterPill>
        <FilterPill active={filtro === 'vencidas'} onClick={() => setFiltro('vencidas')}>Vencidas</FilterPill>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : !data || data.cuentas.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-200" />
            <p className="text-sm font-medium text-gray-700">Sin cuentas por cobrar</p>
            <p className="text-xs mt-1">
              {filtro === 'vencidas'
                ? 'Ninguna factura está vencida actualmente.'
                : 'Todas las facturas a crédito están saldadas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">e-NCF</th>
                  <th className="px-4 py-2.5 text-left">Cliente</th>
                  <th className="px-4 py-2.5 text-left">Emisión</th>
                  <th className="px-4 py-2.5 text-left">Vence</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Pagado</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                  <th className="px-4 py-2.5 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.cuentas.map(c => (
                  <tr key={c.id} className={c.vencida ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/facturas/${c.id}`} className="text-teal-600 hover:underline font-medium">
                        {c.encf}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{c.razonSocialComprador ?? 'Consumidor Final'}</p>
                      {c.rncComprador && <p className="text-xs text-gray-400">{c.rncComprador}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtFecha(c.fechaEmision)}</td>
                    <td className="px-4 py-3">
                      {c.fechaLimitePago ? (
                        <div>
                          <p className={c.vencida ? 'text-red-700 font-medium' : 'text-gray-700'}>
                            {fmtFecha(c.fechaLimitePago)}
                          </p>
                          {c.vencida && (
                            <p className="text-xs text-red-600">{c.diasVencido} día{c.diasVencido !== 1 ? 's' : ''} vencida</p>
                          )}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtDOP(c.montoTotal)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{fmtDOP(c.pagado)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtDOP(c.saldo)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setPagoModal(c)}
                        className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors"
                      >
                        Registrar pago
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal registrar pago */}
      {pagoModal && (
        <PagoModal
          cuenta={pagoModal}
          onClose={() => setPagoModal(null)}
          onSuccess={() => { setPagoModal(null); cargar(); }}
        />
      )}
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FilterPill({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
        active
          ? 'bg-teal-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Modal: registrar pago ───────────────────────────────────────────────────

function PagoModal({
  cuenta, onClose, onSuccess,
}: {
  cuenta: Cuenta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [montoDOP, setMontoDOP]   = useState((cuenta.saldo / 100).toFixed(2));
  const [metodo, setMetodo]       = useState('transferencia');
  const [fecha, setFecha]         = useState(today);
  const [referencia, setReferencia] = useState('');
  const [cuentaBancaria, setCuentaBancaria] = useState('');
  const [notas, setNotas]         = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-por-cobrar/${cuenta.id}/pagos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montoDOP:   parseFloat(montoDOP),
          metodo,
          fechaPago:  fecha,
          referencia: referencia.trim() || undefined,
          cuenta:     cuentaBancaria.trim() || undefined,
          notas:      notas.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al registrar pago');
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Registrar pago</h2>
            <p className="text-xs text-gray-500 mt-0.5">{cuenta.encf}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Total factura</span>
              <span className="text-gray-700">{fmtDOP(cuenta.montoTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ya pagado</span>
              <span className="text-emerald-700">{fmtDOP(cuenta.pagado)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-medium">
              <span className="text-gray-700">Saldo pendiente</span>
              <span className="text-gray-900">{fmtDOP(cuenta.saldo)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Monto (RD$) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={(cuenta.saldo / 100).toFixed(2)}
              value={montoDOP}
              onChange={e => setMontoDOP(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Método *</label>
              <select
                value={metodo}
                onChange={e => setMetodo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
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
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Referencia (opcional)</label>
            <input
              type="text"
              value={referencia}
              onChange={e => setReferencia(e.target.value)}
              placeholder="# cheque, últimos 4 tarjeta, etc."
              maxLength={100}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Cuenta destino (opcional)</label>
            <input
              type="text"
              value={cuentaBancaria}
              onChange={e => setCuentaBancaria(e.target.value)}
              placeholder="Banco Popular - Cuenta operativa"
              maxLength={100}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
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
              disabled={guardando}
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
