'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle, Clock, DollarSign,
  X, Wallet, Loader2, Archive, Wallet2, PanelRightOpen,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { PagoMetodos, pagosValidos, type PagoLinea } from '@/components/pagos/PagoMetodos';
import { PagoModal, type Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import { DetallePanel } from '@/components/cuentas-por-cobrar/DetallePanel';

const isHistorica = (c: Cuenta) => c.estado === 'HISTORICA' || c.tipoEcf === '00';

interface Totales {
  pendiente:     number;
  vencido:       number;
  count:         number;
  countVencidas: number;
}

type Cubeta = 'porVencer' | 'd1a30' | 'd31a60' | 'd61a90' | 'd90mas';
type Antiguedad = Record<Cubeta, { saldo: number; count: number }>;

/** Cubetas en orden de urgencia creciente, con su etiqueta y color. */
const CUBETAS: { id: Cubeta; label: string; hint: string; tono: string; activo: string }[] = [
  { id: 'porVencer', label: 'Por vencer', hint: 'aún no vencen',
    tono: 'border-gray-200 hover:border-teal-300',   activo: 'border-teal-500 bg-teal-50' },
  { id: 'd1a30',     label: '1-30 días',  hint: 'de atraso',
    tono: 'border-gray-200 hover:border-amber-300',  activo: 'border-amber-500 bg-amber-50' },
  { id: 'd31a60',    label: '31-60 días', hint: 'de atraso',
    tono: 'border-gray-200 hover:border-orange-300', activo: 'border-orange-500 bg-orange-50' },
  { id: 'd61a90',    label: '61-90 días', hint: 'de atraso',
    tono: 'border-gray-200 hover:border-orange-400', activo: 'border-orange-600 bg-orange-50' },
  { id: 'd90mas',    label: '+90 días',   hint: 'de atraso',
    tono: 'border-gray-200 hover:border-red-300',    activo: 'border-red-500 bg-red-50' },
];

const ANTIGUEDAD_VACIA: Antiguedad = {
  porVencer: { saldo: 0, count: 0 }, d1a30: { saldo: 0, count: 0 },
  d31a60:    { saldo: 0, count: 0 }, d61a90: { saldo: 0, count: 0 },
  d90mas:    { saldo: 0, count: 0 },
};

// ─── Componente principal ──────────────────────────────────────────────────────

// Al agrupar por cliente se piden más filas de una vez: agrupar solo la página
// visible daría grupos partidos. Igual hay techo — el aviso lo dice si se corta.
const PAGE_SIZE          = 25;
const PAGE_SIZE_AGRUPADO = 500;

export default function CuentasPorCobrarPage() {
  const [data, setData]         = useState<{ cuentas: Cuenta[]; totales: Totales; antiguedad: Antiguedad } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  // Filtros, orden y paginación son server-side: el saldo se calcula en SQL, así
  // que filtrar en memoria mostraría totales de la página en vez de la cartera.
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    cliente: '', tipoDoc: '', estado: '', agrupar: '', orden: '',
  });
  const [page, setPage] = useState(1);
  const [cubeta, setCubeta] = useState<Cubeta | null>(null);
  const [detalle, setDetalle] = useState<Cuenta | null>(null);
  const [pagoModal, setPagoModal] = useState<Cuenta | null>(null);
  const [historicaModal, setHistoricaModal] = useState(false);

  const agrupar  = filterValues.agrupar === 'cliente';
  const pageSize = agrupar ? PAGE_SIZE_AGRUPADO : PAGE_SIZE;

  // La búsqueda dispara un fetch por tecla; se espera a que el usuario pare.
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(filterValues.cliente ?? ''), 300);
    return () => clearTimeout(t);
  }, [filterValues.cliente]);

  // Cualquier cambio de filtro invalida la página actual. Se resetea en el mismo
  // handler que cambia el filtro (no en un efecto aparte): si no, estando en la
  // página 2 el cambio disparaba DOS consultas — una con el offset viejo y otra
  // tras el reset. React agrupa ambos setState en un solo render.
  const cambiarFiltros = useCallback((v: Record<string, string>) => {
    setFilterValues(v);
    setPage(1);
  }, []);

  // Clic en una tarjeta de antigüedad: alterna esa cubeta y vuelve a la página 1.
  const alternarCubeta = useCallback((c: Cubeta) => {
    setCubeta(prev => (prev === c ? null : c));
    setPage(1);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        limit:  String(pageSize),
        offset: String((page - 1) * pageSize),
        ...(busqueda.trim()        && { search:  busqueda.trim() }),
        ...(filterValues.tipoDoc   && { tipoDoc: filterValues.tipoDoc }),
        ...(filterValues.estado    && { estado:  filterValues.estado }),
        ...(filterValues.orden     && { orden:   filterValues.orden }),
        ...(cubeta                 && { cubeta }),
      });
      const res = await fetch(`/api/cuentas-por-cobrar?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, busqueda, cubeta, filterValues.tipoDoc, filterValues.estado, filterValues.orden]);

  useEffect(() => { cargar(); }, [cargar]);

  // Deep-link `?pagar=<docId>`: al llegar desde otro módulo (p. ej. un cargo
  // escolar) abre directo el modal de cobro de esa factura. Se pide por id — con
  // la lista paginada la factura puede no estar en la página cargada.
  const [pagarConsumido, setPagarConsumido] = useState(false);
  useEffect(() => {
    if (pagarConsumido) return;
    const pagarId = new URLSearchParams(window.location.search).get('pagar');
    if (!pagarId) return;
    setPagarConsumido(true);
    fetch(`/api/cuentas-por-cobrar/${pagarId}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.cuenta) setPagoModal(j.cuenta); })
      .catch(() => {});
  }, [pagarConsumido]);

  const cuentas = data?.cuentas ?? [];
  // Totales del servidor: cubren toda la cartera filtrada, no solo esta página.
  const totales: Totales = data?.totales ?? { pendiente: 0, vencido: 0, count: 0, countVencidas: 0 };
  const antiguedad = data?.antiguedad ?? ANTIGUEDAD_VACIA;
  const truncadoAlAgrupar = agrupar && totales.count > cuentas.length;

  const columns: DataTableColumn<Cuenta>[] = useMemo(() => [
    {
      id: 'codigo',
      header: 'Código',
      render: c => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link href={`/dashboard/facturas/${c.id}`} className="text-teal-600 hover:underline font-mono text-xs font-medium">
            {c.codigo ?? `Factura #${c.id}`}
          </Link>
          {isHistorica(c) && (
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
              histórica
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      render: c => (
        <div className="max-w-[220px]">
          <p className="text-sm text-gray-900 truncate">{c.razonSocialComprador ?? 'Consumidor Final'}</p>
          {c.rncComprador && <p className="text-[11px] text-gray-400 font-mono">{c.rncComprador}</p>}
        </div>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      render: c => <span className="text-xs text-gray-600">{fmtFechaCorta(c.fechaEmision)}</span>,
    },
    {
      id: 'vence',
      header: 'Vence',
      visibleAt: 'lg',
      render: c => c.fechaLimitePago ? (
        <div>
          <p className={`text-xs ${c.vencida ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
            {fmtFechaCorta(c.fechaLimitePago)}
          </p>
          {c.vencida && (
            <p className="text-[11px] text-red-600">{c.diasVencido} día{c.diasVencido !== 1 ? 's' : ''} vencida</p>
          )}
        </div>
      ) : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      visibleAt: 'md',
      render: c => <span className="text-xs text-gray-600 whitespace-nowrap">{fmtDOP(c.montoTotal)}</span>,
    },
    {
      id: 'pagado',
      header: 'Pagado',
      align: 'right',
      visibleAt: 'lg',
      render: c => <span className="text-xs text-emerald-700 whitespace-nowrap">{fmtDOP(c.pagado)}</span>,
    },
    {
      id: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: c => (
        <div className="text-right">
          <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtDOP(c.saldo)}</span>
          {c.moraSaldo > 0 && (
            <p className="text-[11px] text-orange-600 whitespace-nowrap">incl. mora {fmtDOP(c.moraSaldo)}</p>
          )}
        </div>
      ),
    },
  ], []);

  const rowActions = (c: Cuenta): RowAction[] => [
    { icon: PanelRightOpen, title: 'Ver detalle',    onClick: () => setDetalle(c),   primary: true },
    { icon: Wallet2,        title: 'Registrar pago', onClick: () => setPagoModal(c), primary: true },
  ];

  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cuentas por cobrar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Facturas a crédito pendientes de pago. Registra abonos y monitorea vencimientos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setHistoricaModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:border-teal-300 text-gray-700 hover:text-teal-700 text-sm font-medium rounded-lg transition-colors"
            title="Importar factura previa al uso de Zero (no va a DGII)"
          >
            <Archive className="h-4 w-4" />
            Agregar cuenta histórica
          </button>
        </div>
      </div>

      {/* Stats — reflejan el filtro activo */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Pendiente"
            value={fmtDOP(totales.pendiente)}
            color="text-gray-900"
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Vencido"
            value={fmtDOP(totales.vencido)}
            color="text-red-600"
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Cuentas"
            value={totales.count.toString()}
            color="text-gray-900"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Vencidas"
            value={totales.countVencidas.toString()}
            color={totales.countVencidas > 0 ? 'text-red-600' : 'text-gray-900'}
          />
        </div>
      )}

      {/* Antigüedad de saldos — clic para filtrar por cubeta. Los montos NO
          cambian al elegir una: siempre muestran la distribución completa, para
          poder saltar entre cubetas sin perder la referencia. */}
      {data && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Antigüedad de saldos
            </h2>
            {cubeta && (
              <button
                onClick={() => { setCubeta(null); setPage(1); }}
                className="text-xs text-teal-600 hover:text-teal-700 hover:underline"
              >
                Ver toda la cartera
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {CUBETAS.map(c => {
              const d = antiguedad[c.id];
              const activa = cubeta === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => alternarCubeta(c.id)}
                  aria-pressed={activa}
                  className={`text-left bg-white border rounded-xl px-3 py-2.5 transition-colors ${activa ? c.activo : c.tono}`}
                >
                  <p className="text-[11px] font-medium text-gray-500">{c.label}</p>
                  <p className={`text-base font-bold ${d.saldo > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                    {fmtDOP(d.saldo)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {d.count} cuenta{d.count !== 1 ? 's' : ''} · {c.hint}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {truncadoAlAgrupar && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          <span>
            Agrupando las primeras {cuentas.length} de {totales.count} cuentas. Filtra para
            reducir la cartera y ver los grupos completos.
          </span>
        </div>
      )}

      {/* Tabla reutilizable con filtros + agrupación */}
      <DataTable<Cuenta>
        data={cuentas}
        loading={loading}
        error={error}
        columns={columns}
        pagination={agrupar ? undefined : {
          page,
          pageSize,
          total: totales.count,
          onPageChange: setPage,
        }}
        filters={[
          { type: 'search', id: 'cliente', placeholder: 'Buscar cliente o RNC…' },
          {
            type: 'select',
            id: 'tipoDoc',
            label: 'Tipo',
            placeholder: 'Todos los tipos',
            options: [
              { value: 'factura',     label: 'Facturas' },
              { value: 'nota-debito', label: 'Notas de débito (mora)' },
            ],
          },
          {
            type: 'select',
            id: 'estado',
            label: 'Estado',
            placeholder: 'Vencidas y al día',
            options: [
              { value: 'vencidas', label: 'Solo vencidas' },
              { value: 'al-dia',   label: 'Solo al día' },
            ],
          },
          {
            type: 'select',
            id: 'orden',
            label: 'Ordenar',
            placeholder: 'Más recientes',
            options: [
              { value: 'vencimiento', label: 'Vencidas primero' },
              { value: 'monto',       label: 'Mayor saldo' },
              { value: 'antiguo',     label: 'Más antiguas' },
            ],
          },
          {
            type: 'select',
            id: 'agrupar',
            label: 'Agrupar',
            placeholder: 'Sin agrupar',
            options: [
              { value: 'cliente', label: 'Agrupar por cliente' },
            ],
          },
        ]}
        filterValues={filterValues}
        onFilterChange={cambiarFiltros}
        rowActions={rowActions}
        groupBy={agrupar ? (c => c.razonSocialComprador ?? 'Consumidor Final') : undefined}
        renderGroupHeader={agrupar ? ((key, rows) => {
          const tot  = rows.reduce((s, c) => s + c.saldo, 0);
          const venc = rows.filter(c => c.vencida).length;
          return (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-800">
                {key}
                <span className="text-gray-400 font-normal"> · {rows.length} cuenta{rows.length !== 1 ? 's' : ''}</span>
                {venc > 0 && (
                  <span className="text-red-600 font-normal"> · {venc} vencida{venc !== 1 ? 's' : ''}</span>
                )}
              </span>
              <span className="text-xs font-bold text-gray-900 whitespace-nowrap">{fmtDOP(tot)}</span>
            </div>
          );
        }) : undefined}
        emptyState={{
          icon: CheckCircle,
          title: 'Sin cuentas por cobrar',
          hint: (filterValues.cliente || filterValues.tipoDoc || filterValues.estado)
            ? 'Ninguna cuenta coincide con los filtros.'
            : 'Todas las facturas a crédito están saldadas.',
        }}
      />

      {/* Panel lateral de detalle — se cierra al abrir el cobro para no apilar
          dos capas encima de la lista. */}
      {detalle && (
        <DetallePanel
          cuenta={detalle}
          onClose={() => setDetalle(null)}
          onCobrar={(c) => { setDetalle(null); setPagoModal(c); }}
        />
      )}

      {/* Modal registrar pago */}
      {pagoModal && (
        <PagoModal
          cuenta={pagoModal}
          onClose={() => setPagoModal(null)}
          onSuccess={() => { setPagoModal(null); cargar(); }}
        />
      )}

      {/* Modal agregar cuenta histórica */}
      {historicaModal && (
        <HistoricaModal
          onClose={() => setHistoricaModal(false)}
          onSuccess={() => { setHistoricaModal(false); cargar(); }}
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

// ─── Modal: agregar cuenta histórica (factura previa, no DGII) ──────────────

function HistoricaModal({
  onClose, onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = hoyRD();
  // Vencimiento sugerido: 15 días desde hoy (RD). Se opera en UTC sobre la
  // fecha calendario RD para que sumar días no arrastre desfase de zona.
  const vencDefault = (() => {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 15));
    return dt.toISOString().slice(0, 10);
  })();

  const [encf, setEncf]               = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [rnc, setRnc]                 = useState('');
  const [fechaEmision, setFechaEmision] = useState(today);
  const [fechaLimite, setFechaLimite] = useState(vencDefault);
  const [montoDOP, setMontoDOP]       = useState('');
  const [yaPagadoDOP, setYaPagadoDOP] = useState('0');
  const [notas, setNotas]             = useState('');
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/cuentas-por-cobrar/historica', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encf:                 encf.trim() || undefined,
          rncComprador:         rnc.trim() || undefined,
          razonSocialComprador: razonSocial.trim() || undefined,
          fechaEmision,
          fechaLimitePago:      fechaLimite,
          montoTotalDOP:        parseFloat(montoDOP),
          montoYaPagadoDOP:     parseFloat(yaPagadoDOP || '0'),
          notas:                notas.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error agregando cuenta histórica');
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Agregar cuenta histórica</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Factura previa al uso de Zero — solo tracking de cobranza. No se envía a DGII.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* NCF + Razón social */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">NCF / Referencia</label>
              <input
                type="text"
                value={encf}
                onChange={e => setEncf(e.target.value.toUpperCase())}
                placeholder="B01000000001 (opcional)"
                maxLength={40}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-1">Si lo dejas vacío se genera automáticamente.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">RNC / Cédula</label>
              <input
                type="text"
                value={rnc}
                onChange={e => setRnc(e.target.value)}
                placeholder="131988032"
                maxLength={20}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Cliente *</label>
            <input
              type="text"
              value={razonSocial}
              onChange={e => setRazonSocial(e.target.value)}
              required
              placeholder="Razón social del cliente"
              maxLength={255}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Fecha emisión *</label>
              <input
                type="date"
                value={fechaEmision}
                onChange={e => setFechaEmision(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Vencimiento *</label>
              <input
                type="date"
                value={fechaLimite}
                onChange={e => setFechaLimite(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Montos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Monto total RD$ *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={montoDOP}
                onChange={e => setMontoDOP(e.target.value)}
                required
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Ya pagado RD$</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={yaPagadoDOP}
                onChange={e => setYaPagadoDOP(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">Abonos previos al sistema.</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Factura preimpresa serie B01 julio 2025, etc."
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
              Agregar cuenta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
