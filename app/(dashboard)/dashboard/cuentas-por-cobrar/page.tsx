'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle, Clock, DollarSign,
  X, Wallet, Loader2, Archive, Wallet2, Eye, PanelRightOpen,
} from 'lucide-react';
import { DetallePanel } from '@/components/cuentas-por-cobrar/DetallePanel';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { NotasMoraTable } from '@/components/notas-mora-table';
import { fmtDOP, fmtFechaCorta, fmtCodigoCorto } from '@/lib/utils/format';
import { PagoMetodos, pagosValidos, type PagoLinea, type NotaCreditoDisponible } from '@/components/pagos/PagoMetodos';
import ComprobantesUploader, { type AdjuntoSubido } from '@/components/pagos/ComprobantesUploader';

interface Cuenta {
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
  // Crédito de notas de crédito ya descontado del saldo de la factura. La API
  // siempre lo devuelve; faltaba declararlo, y sin él la página enseñaba un
  // saldo que descuenta notas sin nombrarlas en ninguna parte.
  ncAplicado:           number;
  // saldo = saldoFactura + moraSaldo (TOTAL combinado a cobrar).
  saldo:                number;
  // Saldo SOLO de la factura (montoTotal − pagado).
  saldoFactura:         number;
  // Saldo combinado de las ND de mora atadas a esta factura.
  moraSaldo:            number;
  // Lista de ND de mora con saldo > 0 (para desglose).
  moraNotas?:           { id: number; codigo: string | null; montoTotal: number; saldo: number; estado: 'PENDIENTE' | 'PARCIAL' }[];
  vencida:              boolean;
  diasVencido:          number;
}

const isHistorica = (c: Cuenta) => c.estado === 'HISTORICA' || c.tipoEcf === '00';

interface Totales {
  pendiente:     number;
  vencido:       number;
  count:         number;
  countVencidas: number;
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CuentasPorCobrarPage() {
  const [data, setData]         = useState<{ cuentas: Cuenta[]; totales: Totales } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  // Filtros 100% client-side sobre el dataset cargado (AR es acotado).
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    cliente: '', tipoDoc: '', estado: '', agrupar: '',
  });
  const [pagoModal, setPagoModal] = useState<Cuenta | null>(null);
  const [detalle, setDetalle] = useState<Cuenta | null>(null);
  const [historicaModal, setHistoricaModal] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cuentas-por-cobrar');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const agrupar = filterValues.agrupar === 'cliente';

  // ── Filtrado client-side: cliente (texto), tipo de documento, vencimiento ──
  const cuentasFiltradas = useMemo(() => {
    let rows = data?.cuentas ?? [];
    const q = (filterValues.cliente ?? '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(c =>
        (c.razonSocialComprador ?? 'consumidor final').toLowerCase().includes(q) ||
        (c.rncComprador ?? '').toLowerCase().includes(q),
      );
    }
    if (filterValues.tipoDoc === 'factura')      rows = rows.filter(c => c.saldoFactura > 0);
    else if (filterValues.tipoDoc === 'nota-debito') rows = rows.filter(c => c.moraSaldo > 0);

    if (filterValues.estado === 'vencidas')   rows = rows.filter(c => c.vencida);
    else if (filterValues.estado === 'al-dia') rows = rows.filter(c => !c.vencida);

    return rows;
  }, [data, filterValues.cliente, filterValues.tipoDoc, filterValues.estado]);

  // Totales reactivos al filtro (las tarjetas reflejan lo que se ve en la tabla).
  const totales: Totales = useMemo(() => ({
    pendiente:     cuentasFiltradas.reduce((s, c) => s + c.saldo, 0),
    vencido:       cuentasFiltradas.filter(c => c.vencida).reduce((s, c) => s + c.saldo, 0),
    count:         cuentasFiltradas.length,
    countVencidas: cuentasFiltradas.filter(c => c.vencida).length,
  }), [cuentasFiltradas]);

  const columns: DataTableColumn<Cuenta>[] = useMemo(() => [
    {
      id: 'codigo',
      header: 'Código',
      render: c => (
        <div className="flex items-center gap-1.5">
          {/* Solo la cola del código: el prefijo (tipo-año-empresa) se repite en
              todas las filas y "FA-2026-YTSY-YH2WR-000038" se comía la columna.
              El completo va en el tooltip. */}
          <Link
            href={`/dashboard/facturas/${c.id}`}
            title={c.codigo ?? `Factura #${c.id}`}
            className="whitespace-nowrap font-mono text-xs font-medium text-teal-600 hover:underline"
          >
            {c.codigo ? fmtCodigoCorto(c.codigo) : `#${c.id}`}
          </Link>
          {isHistorica(c) && (
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
              histórica
            </span>
          )}
          {c.saldoFactura === 0 && c.moraSaldo > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Mora pendiente
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      sortable: true,
      sortAccessor: c => c.razonSocialComprador ?? '',
      // Una línea por celda: el RNC tiene su propia columna. Apilarlo debajo en
      // gris chico obliga a leer cada fila en vez de barrerlas con la vista.
      render: c => (
        // "Consumidor Final" no es un cliente al que llamar: se escribe apagado
        // para que los nombres reales —los que se cobran— destaquen solos.
        c.razonSocialComprador
          ? <p className="max-w-[150px] truncate text-xs text-gray-900" title={c.razonSocialComprador}>{c.razonSocialComprador}</p>
          : <p className="text-xs italic text-gray-400">Consumidor final</p>
      ),
    },
    {
      id: 'rnc',
      header: 'RNC / Cédula',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: c => c.rncComprador ?? '',
      render: c => (
        <span className="font-mono text-xs tabular-nums text-gray-600">
          {c.rncComprador ?? ''}
        </span>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: c => c.fechaEmision ?? '',
      render: c => <span className="text-xs tabular-nums text-gray-600">{fmtFechaCorta(c.fechaEmision)}</span>,
    },
    {
      id: 'vence',
      header: 'Vence',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: c => c.fechaLimitePago ?? '',
      render: c => c.fechaLimitePago
        ? <span className={`text-xs tabular-nums ${c.vencida ? 'font-medium text-red-700' : 'text-gray-700'}`}>{fmtFechaCorta(c.fechaLimitePago)}</span>
        : null,
    },
    {
      id: 'atraso',
      header: 'Atraso',
      visibleAt: 'md',
      sortable: true,
      // Ordenar por atraso es la forma natural de trabajar la cartera: primero
      // el que más días lleva. Por eso es columna propia y no un texto chico.
      sortAccessor: c => (c.vencida ? c.diasVencido : -1),
      // Un solo acento en toda la tabla: el rojo. La intensidad la da el peso
      // de la tipografía, no otro color — con ámbar y verde a la vez la tabla
      // se leía como un semáforo y ningún dato destacaba.
      render: c => c.vencida
        ? (
          <span className={`whitespace-nowrap text-xs tabular-nums text-red-600 ${c.diasVencido > 30 ? 'font-semibold' : ''}`}>
            {c.diasVencido} {c.diasVencido === 1 ? 'día' : 'días'}
          </span>
        )
        : null,
    },
    {
      id: 'total',
      // "Facturado" y no "Total": el otro total de la tabla es el saldo, y dos
      // columnas llamadas Total con significados distintos se confunden solas.
      header: 'Facturado',
      align: 'right',
      visibleAt: 'xl',
      sortable: true,
      sortAccessor: c => c.montoTotal,
      render: c => <span className="whitespace-nowrap text-xs tabular-nums text-gray-400">{fmtDOP(c.montoTotal)}</span>,
    },
    {
      id: 'pagado',
      header: 'Pagado',
      align: 'right',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: c => c.pagado,
      render: c => (
        <span className={`whitespace-nowrap text-xs tabular-nums ${c.pagado > 0 ? 'text-gray-600' : 'text-gray-300'}`}>
          {fmtDOP(c.pagado)}
        </span>
      ),
    },
    {
      id: 'mora',
      // La mora NO es un monto aparte: ya va dentro del saldo. La columna
      // existe para poder ver cuánto del saldo es recargo.
      header: 'Mora incluida',
      align: 'right',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: c => c.moraSaldo,
      render: c => c.moraSaldo > 0
        ? <span className="whitespace-nowrap text-xs tabular-nums text-red-600">{fmtDOP(c.moraSaldo)}</span>
        : null,
    },
    {
      id: 'saldo',
      header: 'Saldo total',
      align: 'right',
      sortable: true,
      sortAccessor: c => c.saldo,
      render: c => (
        <span className={`whitespace-nowrap text-[15px] font-bold tabular-nums ${c.vencida ? 'text-red-700' : 'text-gray-900'}`}>
          {fmtDOP(c.saldo)}
        </span>
      ),
    },
  ], []);

  /**
   * Fuera las columnas que no tienen nada que enseñar.
   *
   * Un colegio que cobra al contado no tiene vencimientos ni mora en ninguna
   * fila: «Vence», «Atraso» y «Mora incluida» le ocupan un tercio del ancho
   * para enseñar guiones, y empujan el saldo —lo único que se mira— fuera de
   * la pantalla. Se decide sobre las filas ya cargadas, sin pedirle nada más
   * al servidor.
   *
   * Se mira TODA la cartera y no solo lo filtrado: si desaparecieran al filtrar
   * y volvieran al quitar el filtro, la tabla bailaría en cada clic.
   */
  const columnasVisibles = useMemo(() => {
    const filas = data?.cuentas ?? [];
    if (filas.length === 0) return columns;
    const conDatos: Record<string, boolean> = {
      vence:  filas.some(c => !!c.fechaLimitePago),
      atraso: filas.some(c => c.diasVencido > 0),
      mora:   filas.some(c => c.moraSaldo > 0),
    };
    return columns.filter(col => conDatos[col.id] ?? true);
  }, [columns, data]);

  // Ambas inline y siempre visibles: sin menú de tres puntos. Cobrar es la
  // acción del día a día; el ojito entra al detalle sin tener que apuntarle
  // al código.
  const rowActions = (c: Cuenta): RowAction[] => [
    { icon: Wallet2, title: 'Registrar pago', onClick: () => setPagoModal(c), primary: true },
    { icon: Eye, title: 'Ver factura', href: `/dashboard/facturas/${c.id}`, primary: true },
    // Al final: el panel EXPLICA el saldo sin sacarte de la lista —de dónde
    // sale, qué se pagó, qué mora se sumó— y por eso va después de las dos
    // acciones que sí te llevan a otro sitio.
    { icon: PanelRightOpen, title: 'Ver movimientos', onClick: () => setDetalle(c), primary: true },
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

      {/* Tabla reutilizable con filtros + agrupación */}
      <DataTable<Cuenta>
        data={cuentasFiltradas}
        loading={loading}
        error={error}
        columns={columnasVisibles}
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
            id: 'agrupar',
            label: 'Agrupar',
            placeholder: 'Sin agrupar',
            options: [
              { value: 'cliente', label: 'Agrupar por cliente' },
            ],
          },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        // Abre por lo más atrasado: es el orden en que se trabaja la cartera.
        // Sin franjas ni fondos de color — la urgencia la comunica el dato en
        // rojo, no rayar la fila entera.
        defaultSort={{ columnId: 'atraso', dir: 'desc' }}
        rowActions={rowActions}
        rowExpandable={c => (c.moraNotas?.length ?? 0) > 0}
        renderExpanded={c => <MoraHijas cuenta={c} />}
        // Pulsar la fila abre el detalle: es lo que se quiere el 90% de las
        // veces. El desglose de mora sigue a un chevron de distancia, y
        // también está dentro del panel.
        onRowClick={c => setDetalle(c)}
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
          // Se cobra la fila de ESTA lista, no la que devuelve el panel: su
          // `Cuenta` es más estrecha (sus notas de mora no traen monto ni
          // estado) y el modal de cobro las necesita para el desglose.
          onCobrar={() => { setPagoModal(detalle); setDetalle(null); }}
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

// ─── Filas hijas: notas de débito por mora de una factura ────────────────────

function MoraHijas({ cuenta }: { cuenta: Cuenta }) {
  return (
    <NotasMoraTable notas={cuenta.moraNotas ?? []} conEstado={false} />
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
  // saldo = saldoFactura + moraSaldo (combinado). Montos en DOP.
  const saldoDOP        = cuenta.saldo / 100;        // combinado, disponible a abonar
  // El repeater valida contra (total − yaPagado). Con yaPagado=0, el cap es el
  // saldo combinado factura + mora.
  const totalDOP  = saldoDOP;
  const pagadoDOP = 0;
  const [fecha, setFecha]         = useState(today);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // Resultado del pago recién registrado → resumen claro (recibido / a factura /
  // a mora / queda pendiente) antes de cerrar. null = aún en el formulario.
  const [resultado, setResultado] = useState<{
    recibidoCents: number;
    facturaCents:  number;
    moraCents:     number;
    saldoNuevo:    number;
    saldado:       boolean;
  } | null>(null);
  // Cuando el pago se bloquea por método que obliga DGII sobre factura no emitida,
  // el backend devuelve el link al detalle para emitirla primero.
  const [emitirUrl, setEmitirUrl] = useState<string | null>(null);

  // Notas de crédito del cliente usables como pago (voucher por código, uso parcial).
  const [notasCredito, setNotasCredito] = useState<NotaCreditoDisponible[]>([]);

  useEffect(() => {
    if (!cuenta.clientId) { setNotasCredito([]); return; }
    let vivo = true;
    fetch(`/api/clientes/${cuenta.clientId}/notas-credito-disponibles`)
      .then(r => r.json())
      .then(j => { if (vivo) setNotasCredito(Array.isArray(j.notas) ? j.notas : []); })
      .catch(() => { if (vivo) setNotasCredito([]); });
    return () => { vivo = false; };
  }, [cuenta.clientId]);

  // Una o varias líneas (1 línea = pago normal). AR usa referencia.
  const [lineas, setLineas] = useState<PagoLinea[]>([
    { metodo: 'transferencia', valor: '', referencia: '' },
  ]);
  const [adjuntos, setAdjuntos] = useState<AdjuntoSubido[]>([]);

  // Métodos que la empresa marcó como "exige comprobante". Si el usuario elige
  // uno, el bloque de comprobantes se marca como requerido y el submit se frena
  // acá mismo — el servidor lo revalida igual.
  const [metodosExige, setMetodosExige] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch('/api/equipo/perfil')
      .then(r => r.json())
      .then(j => { if (vivo) setMetodosExige(Array.isArray(j.metodosExigeComprobante) ? j.metodosExigeComprobante : []); })
      .catch(() => { if (vivo) setMetodosExige([]); });
    return () => { vivo = false; };
  }, []);

  const exigeComprobante = lineas.some(
    l => (parseFloat(l.valor || '0') || 0) > 0 && metodosExige.includes(l.metodo),
  );
  const faltaComprobante = exigeComprobante && adjuntos.length === 0;

  const valido = pagosValidos(lineas, totalDOP, pagadoDOP) && !faltaComprobante;

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
        body: JSON.stringify({
          fechaPago: fecha,
          pagos,
          adjuntoIds: adjuntos.map(a => a.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmitirUrl(typeof json.emitirUrl === 'string' ? json.emitirUrl : null);
        throw new Error(json.error ?? 'Error al registrar pago');
      }
      const recibidoCents = pagos.reduce((s, p) => s + Math.round(p.montoDOP * 100), 0);
      setResultado({
        recibidoCents,
        facturaCents: json.repartido?.facturaCents ?? 0,
        moraCents:    json.repartido?.moraCents ?? 0,
        saldoNuevo:   json.saldoNuevo ?? 0,
        saldado:      !!json.saldado,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {resultado ? 'Pago registrado' : 'Registrar pago'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{cuenta.codigo ?? `Factura #${cuenta.id}`}</p>
          </div>
          <button
            onClick={() => (resultado ? onSuccess() : onClose())}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {resultado ? (
          <ResumenPago resultado={resultado} onListo={onSuccess} />
        ) : (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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

          <ComprobantesUploader
            docId={cuenta.id}
            adjuntos={adjuntos}
            onChange={setAdjuntos}
            disabled={guardando}
            obligatorio={exigeComprobante}
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
        )}
      </div>
    </div>
  );
}

// ─── Resumen del pago registrado (recibido / a factura / a mora / pendiente) ──

function ResumenPago({
  resultado, onListo,
}: {
  resultado: { recibidoCents: number; facturaCents: number; moraCents: number; saldoNuevo: number; saldado: boolean };
  onListo: () => void;
}) {
  const { recibidoCents, facturaCents, moraCents, saldoNuevo, saldado } = resultado;
  return (
    <div className="p-5 space-y-4">
      <div className={`flex items-start gap-2 p-3 rounded-lg border ${
        saldado ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
      }`}>
        <CheckCircle className={`h-5 w-5 mt-0.5 shrink-0 ${saldado ? 'text-emerald-600' : 'text-amber-600'}`} />
        <p className="text-sm text-gray-800">
          {saldado
            ? 'Pago registrado. La cuenta quedó saldada por completo (factura y mora).'
            : 'Pago registrado. Quedó un saldo pendiente — revisa el desglose.'}
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
        <div className="flex justify-between">
          <span className="text-gray-500">Recibido</span>
          <span className="text-gray-900 font-medium tabular-nums">{fmtDOP(recibidoCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Aplicado a la factura</span>
          <span className="text-gray-700 tabular-nums">{fmtDOP(facturaCents)}</span>
        </div>
        {moraCents > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Aplicado a la mora</span>
            <span className="text-orange-600 tabular-nums">{fmtDOP(moraCents)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5 font-medium">
          <span className="text-gray-700">Queda pendiente</span>
          <span className={`tabular-nums ${saldoNuevo > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {fmtDOP(saldoNuevo)}
          </span>
        </div>
        {saldoNuevo > 0 && (
          <p className="text-[11px] text-gray-400 pt-0.5">
            El pago cubre primero la factura; el resto se aplica a la mora. Lo que reste queda como saldo pendiente.
          </p>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onListo}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg"
        >
          Listo
        </button>
      </div>
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
  const today = new Date().toISOString().slice(0, 10);
  const vencDefault = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
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
