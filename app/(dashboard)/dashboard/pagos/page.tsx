'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  DollarSign, Wallet, TrendingUp, Calculator, X, Loader2,
  AlertTriangle, Trash2, FileText, Download, Banknote, Send,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta, fmtFechaHora } from '@/lib/utils/format';
import { labelMetodo, esEfectivo } from '@/lib/pagos/metodos';
import { usePermissions } from '@/lib/hooks/usePermissions';

interface Pago {
  id:            number;
  monto:         number;          // centavos
  metodo:        string;
  referencia:    string | null;
  cuenta:        string | null;
  fechaPago:     string;          // YYYY-MM-DD
  notas:         string | null;
  createdAt:     string;
  turnoCajaId:   number | null;
  notaCreditoId: number | null;
  docId:         number | null;
  docCodigo:     string | null;
  docEncf:       string | null;
  docTipoEcf:    string | null;
  docEstado:     string | null;
  docTrackId:    string | null;
  docMontoTotal: number | null;
  enviadoDgii:   boolean;
  pagosDelDoc:   number;
  clientId:      number | null;
  cliente:       string | null;
  rncComprador:  string | null;
  registradoPor: string | null;
  registradoPorEmail: string | null;
}

interface Totales {
  monto: number;
  count: number;
  porMetodo: Record<string, { monto: number; count: number }>;
}

// ─── Rango de fechas: presets server-side ──────────────────────────────────────

type RangoKey = 'hoy' | '7d' | '30d' | 'mes' | 'todo';

function rangoFechas(key: RangoKey): { desde?: string; hasta?: string } {
  const hoy = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (key === 'todo') return {};
  if (key === 'hoy') return { desde: iso(hoy), hasta: iso(hoy) };
  if (key === 'mes') {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde: iso(primero), hasta: iso(hoy) };
  }
  const dias = key === '7d' ? 7 : 30;
  const d = new Date(hoy);
  d.setDate(d.getDate() - (dias - 1));
  return { desde: iso(d), hasta: iso(hoy) };
}

const RANGOS: { key: RangoKey; label: string }[] = [
  { key: 'hoy',  label: 'Hoy' },
  { key: '7d',   label: '7 días' },
  { key: '30d',  label: '30 días' },
  { key: 'mes',  label: 'Este mes' },
  { key: 'todo', label: 'Todo' },
];

// ─── Página ─────────────────────────────────────────────────────────────────

export default function PagosPage() {
  const { can } = usePermissions();
  const puedeEliminar = can('facturas:anular');

  const [pagos, setPagos]   = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [rango, setRango]   = useState<RangoKey>('30d');

  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    q: '', metodo: '', dgii: '', agrupar: '',
  });
  const [pagoEliminar, setPagoEliminar] = useState<Pago | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { desde, hasta } = rangoFechas(rango);
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const res = await fetch(`/api/pagos/listado?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando pagos');
      setPagos(json.pagos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [rango]);

  useEffect(() => { cargar(); }, [cargar]);

  // Opciones de método derivadas del dataset cargado (para que el dropdown solo
  // muestre métodos realmente usados en el rango).
  const metodoOptions = useMemo(() => {
    const set = new Set(pagos.map(p => (p.metodo ?? 'otro').toLowerCase()));
    return Array.from(set).sort().map(m => ({ value: m, label: labelMetodo(m) }));
  }, [pagos]);

  // ── Filtrado client-side: búsqueda libre + método ──
  const agrupar = filterValues.agrupar;
  const pagosFiltrados = useMemo(() => {
    let rows = pagos;
    const q = (filterValues.q ?? '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(p =>
        (p.cliente ?? 'consumidor final').toLowerCase().includes(q) ||
        (p.rncComprador ?? '').toLowerCase().includes(q) ||
        (p.referencia ?? '').toLowerCase().includes(q) ||
        (p.docCodigo ?? '').toLowerCase().includes(q) ||
        (p.docEncf ?? '').toLowerCase().includes(q),
      );
    }
    if (filterValues.metodo) {
      rows = rows.filter(p => (p.metodo ?? 'otro').toLowerCase() === filterValues.metodo);
    }
    if (filterValues.dgii === 'enviado')    rows = rows.filter(p => p.enviadoDgii);
    else if (filterValues.dgii === 'no')    rows = rows.filter(p => !p.enviadoDgii);
    return rows;
  }, [pagos, filterValues.q, filterValues.metodo, filterValues.dgii]);

  // Totales reactivos al filtro (las tarjetas reflejan lo que se ve).
  const totales: Totales = useMemo(() => {
    const porMetodo: Record<string, { monto: number; count: number }> = {};
    let monto = 0;
    for (const p of pagosFiltrados) {
      monto += p.monto;
      const k = (p.metodo ?? 'otro').toLowerCase();
      porMetodo[k] = porMetodo[k] ?? { monto: 0, count: 0 };
      porMetodo[k].monto += p.monto;
      porMetodo[k].count += 1;
    }
    return { monto, count: pagosFiltrados.length, porMetodo };
  }, [pagosFiltrados]);

  const efectivoTotal = useMemo(
    () => pagosFiltrados.filter(p => esEfectivo(p.metodo)).reduce((s, p) => s + p.monto, 0),
    [pagosFiltrados],
  );
  const promedio = totales.count > 0 ? Math.round(totales.monto / totales.count) : 0;

  // Desglose por método ordenado por monto desc (para el panel de chips).
  const desglose = useMemo(
    () => Object.entries(totales.porMetodo).sort((a, b) => b[1].monto - a[1].monto),
    [totales.porMetodo],
  );

  function exportarCSV() {
    const header = ['Fecha', 'Documento', 'NCF', 'Cliente', 'RNC', 'Método', 'DGII', 'Referencia', 'Registrado por', 'Monto'];
    const escape = (v: string | number | null) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = pagosFiltrados.map(p => [
      p.fechaPago,
      p.docCodigo ?? (p.docId ? `#${p.docId}` : ''),
      p.docEncf ?? '',
      p.cliente ?? 'Consumidor Final',
      p.rncComprador ?? '',
      labelMetodo(p.metodo),
      p.enviadoDgii ? 'Enviado' : 'No enviado',
      p.referencia ?? '',
      p.registradoPor ?? p.registradoPorEmail ?? '',
      (p.monto / 100).toFixed(2),
    ].map(escape).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos-${rango}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: DataTableColumn<Pago>[] = useMemo(() => [
    {
      id: 'fechaPago',
      header: 'Fecha',
      sortable: true,
      sortAccessor: p => p.fechaPago,
      render: p => (
        <div>
          <p className="text-xs text-gray-700">{fmtFechaCorta(p.fechaPago)}</p>
          <p className="text-[10px] text-gray-400">{fmtFechaHora(p.createdAt)}</p>
        </div>
      ),
    },
    {
      id: 'documento',
      header: 'Documento',
      render: p => p.docId ? (
        <div className="min-w-0">
          <Link href={`/dashboard/facturas/${p.docId}`} className="text-teal-600 hover:underline font-mono text-xs font-medium">
            {p.docCodigo ?? p.docEncf ?? `#${p.docId}`}
          </Link>
          {p.pagosDelDoc > 1 && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {p.pagosDelDoc} pagos en esta factura
            </p>
          )}
        </div>
      ) : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      id: 'dgii',
      header: 'DGII',
      align: 'center',
      sortable: true,
      sortAccessor: p => (p.enviadoDgii ? 1 : 0),
      render: p => p.enviadoDgii ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200" title={p.docTrackId ? `TrackID: ${p.docTrackId}` : p.docEstado ?? ''}>
          <Send className="h-3 w-3" /> Enviado
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200" title={p.docEstado ?? 'Sin enviar'}>
          No enviado
        </span>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      visibleAt: 'md',
      render: p => (
        <div className="max-w-[200px]">
          <p className="text-sm text-gray-900 truncate">{p.cliente ?? 'Consumidor Final'}</p>
          {p.rncComprador && <p className="text-[11px] text-gray-400 font-mono">{p.rncComprador}</p>}
        </div>
      ),
    },
    {
      id: 'metodo',
      header: 'Método',
      render: p => (
        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${
          esEfectivo(p.metodo)
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-gray-50 text-gray-600 border-gray-200'
        }`}>
          {labelMetodo(p.metodo)}
        </span>
      ),
    },
    {
      id: 'referencia',
      header: 'Referencia',
      visibleAt: 'lg',
      render: p => p.referencia
        ? <span className="text-xs text-gray-600 font-mono">{p.referencia}</span>
        : <span className="text-gray-300 text-xs">—</span>,
    },
    {
      id: 'registradoPor',
      header: 'Registrado por',
      visibleAt: 'xl',
      render: p => <span className="text-xs text-gray-500">{p.registradoPor ?? p.registradoPorEmail ?? '—'}</span>,
    },
    {
      id: 'monto',
      header: 'Monto',
      align: 'right',
      sortable: true,
      sortAccessor: p => p.monto,
      render: p => <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtDOP(p.monto)}</span>,
    },
  ], []);

  const rowActions = (p: Pago): RowAction[] => {
    const actions: RowAction[] = [];
    if (p.docId) {
      actions.push({ icon: FileText, title: 'Ver factura', href: `/dashboard/facturas/${p.docId}` });
    }
    if (puedeEliminar) {
      actions.push({ icon: Trash2, title: 'Eliminar pago', variant: 'danger', onClick: () => setPagoEliminar(p) });
    }
    return actions;
  };

  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos recibidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Todos los cobros registrados con su detalle: documento, método, referencia y quién lo registró.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportarCSV}
            disabled={pagosFiltrados.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:border-teal-300 text-gray-700 hover:text-teal-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Selector de rango (server-side) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGOS.map(r => (
          <button
            key={r.key}
            onClick={() => setRango(r.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              rango === r.key
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Total cobrado" value={fmtDOP(totales.monto)} color="text-gray-900" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Pagos" value={totales.count.toString()} color="text-gray-900" />
        <StatCard icon={<Banknote className="h-5 w-5" />} label="En efectivo" value={fmtDOP(efectivoTotal)} color="text-emerald-700" />
        <StatCard icon={<Calculator className="h-5 w-5" />} label="Promedio" value={fmtDOP(promedio)} color="text-gray-900" />
      </div>

      {/* Desglose por método */}
      {desglose.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <TrendingUp className="h-4 w-4" />
            <p className="text-xs font-medium">Desglose por método</p>
          </div>
          <div className="space-y-2">
            {desglose.map(([metodo, info]) => {
              const pct = totales.monto > 0 ? (info.monto / totales.monto) * 100 : 0;
              return (
                <div key={metodo}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-700 font-medium">
                      {labelMetodo(metodo)}
                      <span className="text-gray-400 font-normal"> · {info.count} pago{info.count !== 1 ? 's' : ''}</span>
                    </span>
                    <span className="text-gray-900 font-semibold">{fmtDOP(info.monto)} <span className="text-gray-400 font-normal">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${esEfectivo(metodo) ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla */}
      <DataTable<Pago>
        data={pagosFiltrados}
        loading={loading}
        error={error}
        columns={columns}
        filters={[
          { type: 'search', id: 'q', placeholder: 'Buscar cliente, RNC, referencia o NCF…' },
          {
            type: 'select',
            id: 'metodo',
            label: 'Método',
            placeholder: 'Todos los métodos',
            options: metodoOptions,
          },
          {
            type: 'select',
            id: 'dgii',
            label: 'DGII',
            placeholder: 'Enviados y no enviados',
            options: [
              { value: 'enviado', label: 'Enviados a DGII' },
              { value: 'no',      label: 'No enviados a DGII' },
            ],
          },
          {
            type: 'select',
            id: 'agrupar',
            label: 'Agrupar',
            placeholder: 'Sin agrupar',
            options: [
              { value: 'factura', label: 'Por factura' },
              { value: 'metodo',  label: 'Por método' },
              { value: 'cliente', label: 'Por cliente' },
              { value: 'fecha',   label: 'Por fecha' },
            ],
          },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        rowActions={rowActions}
        groupBy={
          agrupar === 'factura' ? (p => p.docCodigo ?? p.docEncf ?? (p.docId ? `#${p.docId}` : 'Sin documento')) :
          agrupar === 'metodo'  ? (p => labelMetodo(p.metodo)) :
          agrupar === 'cliente' ? (p => p.cliente ?? 'Consumidor Final') :
          agrupar === 'fecha'   ? (p => fmtFechaCorta(p.fechaPago)) :
          undefined
        }
        renderGroupHeader={agrupar ? ((key, rows) => {
          const tot = rows.reduce((s, p) => s + p.monto, 0);
          return (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-800">
                {key}
                <span className="text-gray-400 font-normal"> · {rows.length} pago{rows.length !== 1 ? 's' : ''}</span>
              </span>
              <span className="text-xs font-bold text-gray-900 whitespace-nowrap">{fmtDOP(tot)}</span>
            </div>
          );
        }) : undefined}
        emptyState={{
          icon: Wallet,
          title: 'Sin pagos registrados',
          hint: (filterValues.q || filterValues.metodo || filterValues.dgii)
            ? 'Ningún pago coincide con los filtros.'
            : 'No hay pagos en el rango seleccionado. Registra cobros desde Cuentas por cobrar o al emitir facturas.',
        }}
      />

      {/* Modal eliminar pago */}
      {pagoEliminar && (
        <EliminarPagoModal
          pago={pagoEliminar}
          onClose={() => setPagoEliminar(null)}
          onSuccess={() => { setPagoEliminar(null); cargar(); }}
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

function EliminarPagoModal({ pago, onClose, onSuccess }: {
  pago: Pago; onClose: () => void; onSuccess: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagos/${pago.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al eliminar el pago');
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Eliminar pago</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">
              Esto revierte el cobro y recalcula el saldo del documento. La acción no se puede deshacer.
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Documento</span><span className="text-gray-800 font-mono">{pago.docCodigo ?? pago.docEncf ?? (pago.docId ? `#${pago.docId}` : '—')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Método</span><span className="text-gray-800">{labelMetodo(pago.metodo)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Fecha</span><span className="text-gray-800">{fmtFechaCorta(pago.fechaPago)}</span></div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1 font-medium"><span className="text-gray-700">Monto</span><span className="text-gray-900">{fmtDOP(pago.monto)}</span></div>
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancelar</button>
            <button
              onClick={handleDelete}
              disabled={guardando}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar pago
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
