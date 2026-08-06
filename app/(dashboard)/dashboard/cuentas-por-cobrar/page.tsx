'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle, Clock, DollarSign,
  X, Wallet, Loader2, Archive, Wallet2, PanelRightOpen, Download, Mail,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { DataTable, type DataTableColumn, type RowAction, type BulkAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { PagoModal, type Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import { DetallePanel } from '@/components/cuentas-por-cobrar/DetallePanel';
import { RecordatoriosModal, MAX_POR_LOTE } from '@/components/cuentas-por-cobrar/RecordatoriosModal';

const isHistorica = (c: Cuenta) => c.estado === 'HISTORICA' || c.tipoEcf === '00';

interface Totales {
  pendiente:     number;
  vencido:       number;
  count:         number;
  countVencidas: number;
}

type Cubeta = 'porVencer' | 'd1a30' | 'd31a60' | 'd61a90' | 'd90mas';
type Antiguedad = Record<Cubeta, { saldo: number; count: number }>;

/** Promesas de pago del team completo (no de la cartera filtrada). */
interface Promesas {
  pendientes:     number;
  incumplidas:    number;
  montoPendiente: number;
}

/** Cubetas en orden de urgencia creciente, con su etiqueta y color. */
const CUBETAS: { id: Cubeta; label: string; hint: string; hover: string; activoBorder: string; activoBg: string }[] = [
  { id: 'porVencer', label: 'Por vencer', hint: 'aún no vencen',
    hover: '#a5b4f9', activoBorder: '#5b73ec', activoBg: '#eef2fe' },
  { id: 'd1a30',     label: '1-30 días',  hint: 'de atraso',
    hover: '#fcd34d', activoBorder: '#f59e0b', activoBg: '#fffbeb' },
  { id: 'd31a60',    label: '31-60 días', hint: 'de atraso',
    hover: '#fdba74', activoBorder: '#f97316', activoBg: '#fff7ed' },
  { id: 'd61a90',    label: '61-90 días', hint: 'de atraso',
    hover: '#fb923c', activoBorder: '#ea580c', activoBg: '#fff7ed' },
  { id: 'd90mas',    label: '+90 días',   hint: 'de atraso',
    hover: '#fca5a5', activoBorder: '#ef4444', activoBg: '#fef2f2' },
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
  const [data, setData]         = useState<{ cuentas: Cuenta[]; totales: Totales; antiguedad: Antiguedad; promesas?: Promesas } | null>(null);
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
  // Cuentas a las que se les va a mandar recordatorio. null = modal cerrado.
  const [recordatorioDocs, setRecordatorioDocs] = useState<number[] | null>(null);
  const [avisoLote, setAvisoLote] = useState<string | null>(null);

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

  // Exporta lo que se está viendo: mismos filtros, sin la paginación (el
  // archivo trae toda la cartera filtrada, no la página).
  const exportHref = (() => {
    const sp = new URLSearchParams({
      ...(busqueda.trim()      && { search:  busqueda.trim() }),
      ...(filterValues.tipoDoc && { tipoDoc: filterValues.tipoDoc }),
      ...(filterValues.estado  && { estado:  filterValues.estado }),
      ...(filterValues.orden   && { orden:   filterValues.orden }),
      ...(cubeta               && { cubeta }),
    });
    const q = sp.toString();
    return `/api/cuentas-por-cobrar/export${q ? `?${q}` : ''}`;
  })();

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
  const promesas = data?.promesas;
  // Solo se muestra si hay algo que mostrar: un team que nunca registró una
  // promesa no gana nada con una tarjeta en cero permanente.
  const hayPromesas = !!promesas && (promesas.pendientes > 0 || promesas.incumplidas > 0);
  const truncadoAlAgrupar = agrupar && totales.count > cuentas.length;

  const columns: DataTableColumn<Cuenta>[] = useMemo(() => [
    {
      id: 'codigo',
      header: 'Código',
      render: c => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Box
            component={Link}
            href={`/dashboard/facturas/${c.id}`}
            sx={{
              color: '#3658e1', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 500,
              textDecoration: 'none', '&:hover': { textDecoration: 'underline' },
            }}
          >
            {c.codigo ?? `Factura #${c.id}`}
          </Box>
          {isHistorica(c) && (
            <Box component="span" sx={{
              fontSize: '10px', px: 0.75, py: 0.25, borderRadius: '9999px',
              bgcolor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
            }}>
              histórica
            </Box>
          )}
        </Box>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      render: c => (
        <Box sx={{ maxWidth: 220 }}>
          <Typography noWrap sx={{ fontSize: '0.875rem', color: '#111827' }}>
            {c.razonSocialComprador ?? 'Consumidor Final'}
          </Typography>
          {c.rncComprador && (
            <Typography sx={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{c.rncComprador}</Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      render: c => <Box component="span" sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{fmtFechaCorta(c.fechaEmision)}</Box>,
    },
    {
      id: 'vence',
      header: 'Vence',
      visibleAt: 'lg',
      render: c => c.fechaLimitePago ? (
        <Box>
          <Typography sx={{ fontSize: '0.75rem', ...(c.vencida ? { color: '#b91c1c', fontWeight: 500 } : { color: '#374151' }) }}>
            {fmtFechaCorta(c.fechaLimitePago)}
          </Typography>
          {c.vencida && (
            <Typography sx={{ fontSize: '11px', color: '#dc2626' }}>
              {c.diasVencido} día{c.diasVencido !== 1 ? 's' : ''} vencida
            </Typography>
          )}
        </Box>
      ) : <Box component="span" sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</Box>,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      visibleAt: 'md',
      render: c => <Box component="span" sx={{ fontSize: '0.75rem', color: '#4b5563', whiteSpace: 'nowrap' }}>{fmtDOP(c.montoTotal)}</Box>,
    },
    {
      id: 'pagado',
      header: 'Pagado',
      align: 'right',
      visibleAt: 'lg',
      render: c => <Box component="span" sx={{ fontSize: '0.75rem', color: '#047857', whiteSpace: 'nowrap' }}>{fmtDOP(c.pagado)}</Box>,
    },
    {
      id: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: c => (
        <Box sx={{ textAlign: 'right' }}>
          <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
            {fmtDOP(c.saldo)}
          </Box>
          {c.moraSaldo > 0 && (
            <Typography sx={{ fontSize: '11px', color: '#ea580c', whiteSpace: 'nowrap' }}>
              incl. mora {fmtDOP(c.moraSaldo)}
            </Typography>
          )}
        </Box>
      ),
    },
  ], []);

  const rowActions = (c: Cuenta): RowAction[] => [
    { icon: PanelRightOpen, title: 'Ver detalle',    onClick: () => setDetalle(c),   primary: true },
    { icon: Wallet2,        title: 'Registrar pago', onClick: () => setPagoModal(c), primary: true },
    // Sin `primary`: va en el menú de 3 puntos. Escribirle a un cliente no es
    // una acción que convenga tener a un clic de distancia en cada fila.
    { icon: Mail, title: 'Enviar recordatorio de pago', onClick: () => setRecordatorioDocs([c.id]) },
  ];

  // El endpoint tope 50 por lote, para que un clic no se convierta en cientos de
  // correos. Se corta aquí también y se avisa, en vez de dejar que la API
  // rechace el lote entero con un 400.
  const bulkActions: BulkAction<Cuenta>[] = [
    {
      label: 'Enviar recordatorio',
      icon:  Mail,
      onClick: (ids) => {
        const nums = ids.map(Number);
        if (nums.length > MAX_POR_LOTE) {
          setAvisoLote(
            `Seleccionaste ${nums.length} cuentas y el máximo por envío es ${MAX_POR_LOTE}. ` +
            `Se van a preparar las primeras ${MAX_POR_LOTE}.`,
          );
        }
        setRecordatorioDocs(nums.slice(0, MAX_POR_LOTE));
      },
    },
  ];

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' }, justifyContent: { sm: 'space-between' }, gap: 1.5 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            Cuentas por cobrar
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            Facturas a crédito pendientes de pago. Registra abonos y monitorea vencimientos.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Button
            component="a" href={exportHref} nativeButton={false}
            variant="outlined" color="inherit"
            title="Descargar en Excel la cartera con los filtros activos"
            startIcon={<Download style={{ width: 16, height: 16 }} />}
            sx={{ color: '#374151', borderColor: '#d1d5db', bgcolor: '#fff', whiteSpace: 'nowrap' }}
          >
            Exportar
          </Button>
          <Button
            variant="outlined" color="inherit"
            onClick={() => setHistoricaModal(true)}
            title="Importar factura previa al uso de Zero (no va a DGII)"
            startIcon={<Archive style={{ width: 16, height: 16 }} />}
            sx={{ color: '#374151', borderColor: '#d1d5db', bgcolor: '#fff', whiteSpace: 'nowrap' }}
          >
            Agregar cuenta histórica
          </Button>
        </Box>
      </Box>

      {/* Stats — reflejan el filtro activo */}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          <StatCard
            icon={<DollarSign style={{ width: 20, height: 20 }} />}
            label="Pendiente"
            value={fmtDOP(totales.pendiente)}
            color="#111827"
          />
          <StatCard
            icon={<AlertTriangle style={{ width: 20, height: 20 }} />}
            label="Vencido"
            value={fmtDOP(totales.vencido)}
            color="#dc2626"
          />
          <StatCard
            icon={<Wallet style={{ width: 20, height: 20 }} />}
            label="Cuentas"
            value={totales.count.toString()}
            color="#111827"
          />
          <StatCard
            icon={<Clock style={{ width: 20, height: 20 }} />}
            label="Vencidas"
            value={totales.countVencidas.toString()}
            color={totales.countVencidas > 0 ? '#dc2626' : '#111827'}
          />
        </Box>
      )}

      {/* Promesas de pago. A diferencia de los stats de arriba, estas NO siguen
          el filtro activo: son del team completo. Una promesa incumplida no deja
          de serlo porque el usuario esté mirando otra cubeta. */}
      {hayPromesas && promesas && (
        <Box sx={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2.5, rowGap: 1,
          border: '1px solid #e5e7eb', bgcolor: '#fff', borderRadius: '12px', px: 2, py: 1.25,
        }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Promesas de pago
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
            <Box component="span" sx={{ fontWeight: 600, color: '#111827' }}>{promesas.pendientes}</Box> pendiente
            {promesas.pendientes !== 1 ? 's' : ''}
            {promesas.montoPendiente > 0 && (
              <Box component="span" sx={{ color: '#6b7280' }}> · {fmtDOP(promesas.montoPendiente)} comprometido</Box>
            )}
          </Typography>
          {promesas.incumplidas > 0 && (
            <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: '#dc2626' }}>
              <AlertTriangle style={{ width: 14, height: 14 }} />
              <Box component="span" sx={{ fontWeight: 600 }}>{promesas.incumplidas}</Box> incumplida
              {promesas.incumplidas !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
      )}

      {/* Antigüedad de saldos — clic para filtrar por cubeta. Los montos NO
          cambian al elegir una: siempre muestran la distribución completa, para
          poder saltar entre cubetas sin perder la referencia. */}
      {data && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
            <Typography component="h2" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Antigüedad de saldos
            </Typography>
            {cubeta && (
              <Box
                component="button"
                onClick={() => { setCubeta(null); setPage(1); }}
                sx={{
                  fontSize: '0.75rem', color: '#3658e1', bgcolor: 'transparent', border: 0,
                  cursor: 'pointer', p: 0, '&:hover': { color: '#2a45c4', textDecoration: 'underline' },
                }}
              >
                Ver toda la cartera
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 1 }}>
            {CUBETAS.map(c => {
              const d = antiguedad[c.id];
              const activa = cubeta === c.id;
              return (
                <Box
                  component="button"
                  key={c.id}
                  onClick={() => alternarCubeta(c.id)}
                  aria-pressed={activa}
                  sx={{
                    textAlign: 'left', borderRadius: '12px', px: 1.5, py: 1.25,
                    cursor: 'pointer', transition: 'border-color .15s, background-color .15s',
                    ...(activa
                      ? { border: `1px solid ${c.activoBorder}`, bgcolor: c.activoBg }
                      : { border: '1px solid #e5e7eb', bgcolor: '#fff', '&:hover': { borderColor: c.hover } }),
                  }}
                >
                  <Typography sx={{ fontSize: '11px', fontWeight: 500, color: '#6b7280' }}>{c.label}</Typography>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: d.saldo > 0 ? '#111827' : '#d1d5db' }}>
                    {fmtDOP(d.saldo)}
                  </Typography>
                  <Typography sx={{ fontSize: '11px', color: '#9ca3af' }}>
                    {d.count} cuenta{d.count !== 1 ? 's' : ''} · {c.hint}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {avisoLote && (
        <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
          {avisoLote}
        </Alert>
      )}

      {truncadoAlAgrupar && (
        <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
          Agrupando las primeras {cuentas.length} de {totales.count} cuentas. Filtra para
          reducir la cartera y ver los grupos completos.
        </Alert>
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
        bulkActions={bulkActions}
        groupBy={agrupar ? (c => c.razonSocialComprador ?? 'Consumidor Final') : undefined}
        renderGroupHeader={agrupar ? ((key, rows) => {
          const tot  = rows.reduce((s, c) => s + c.saldo, 0);
          const venc = rows.filter(c => c.vencida).length;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>
                {key}
                <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}> · {rows.length} cuenta{rows.length !== 1 ? 's' : ''}</Box>
                {venc > 0 && (
                  <Box component="span" sx={{ color: '#dc2626', fontWeight: 400 }}> · {venc} vencida{venc !== 1 ? 's' : ''}</Box>
                )}
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
                {fmtDOP(tot)}
              </Typography>
            </Box>
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

      {/* Modal de recordatorios (previsualiza y, con confirmación, envía) */}
      {recordatorioDocs && (
        <RecordatoriosModal
          docIds={recordatorioDocs}
          onClose={() => { setRecordatorioDocs(null); setAvisoLote(null); }}
          // El envío deja un evento de contacto en cada cuenta: se recarga para
          // que el panel de detalle muestre el historial al día.
          onEnviado={cargar}
        />
      )}
    </Box>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#9ca3af', mb: 1 }}>
        {icon}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{label}</Typography>
      </Box>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</Typography>
    </Box>
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, pb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            Agregar cuenta histórica
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>
            Factura previa al uso de Zero — solo tracking de cobranza. No se envía a DGII.
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#9ca3af' }}>
          <X style={{ width: 16, height: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* NCF + Razón social */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <Box>
              <TextField
                label="NCF / Referencia" fullWidth
                value={encf}
                onChange={e => setEncf(e.target.value.toUpperCase())}
                placeholder="B01000000001 (opcional)"
                slotProps={{
                  htmlInput: { maxLength: 40 },
                  input: { sx: { fontFamily: 'monospace' } },
                }}
              />
              <Typography sx={{ fontSize: '10px', color: '#9ca3af', mt: 0.5 }}>
                Si lo dejas vacío se genera automáticamente.
              </Typography>
            </Box>
            <TextField
              label="RNC / Cédula" fullWidth
              value={rnc}
              onChange={e => setRnc(e.target.value)}
              placeholder="131988032"
              slotProps={{ htmlInput: { maxLength: 20 } }}
            />
          </Box>

          <TextField
            label="Cliente" required fullWidth
            value={razonSocial}
            onChange={e => setRazonSocial(e.target.value)}
            placeholder="Razón social del cliente"
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />

          {/* Fechas */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              label="Fecha emisión" type="date" required fullWidth
              value={fechaEmision}
              onChange={e => setFechaEmision(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Vencimiento" type="date" required fullWidth
              value={fechaLimite}
              onChange={e => setFechaLimite(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>

          {/* Montos */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              label="Monto total RD$" type="number" required fullWidth
              value={montoDOP}
              onChange={e => setMontoDOP(e.target.value)}
              placeholder="0.00"
              slotProps={{ htmlInput: { step: 0.01, min: 0.01 } }}
            />
            <Box>
              <TextField
                label="Ya pagado RD$" type="number" fullWidth
                value={yaPagadoDOP}
                onChange={e => setYaPagadoDOP(e.target.value)}
                placeholder="0.00"
                slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
              />
              <Typography sx={{ fontSize: '10px', color: '#9ca3af', mt: 0.5 }}>
                Abonos previos al sistema.
              </Typography>
            </Box>
          </Box>

          <TextField
            label="Notas (opcional)" fullWidth multiline rows={2}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Factura preimpresa serie B01 julio 2025, etc."
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />

          {error && (
            <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 1 }}>
            <Button color="inherit" onClick={onClose} sx={{ color: '#4b5563' }}>
              Cancelar
            </Button>
            <Button
              type="submit" variant="contained"
              disabled={guardando}
              startIcon={guardando ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : undefined}
            >
              Agregar cuenta
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
