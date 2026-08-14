'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  DollarSign, Wallet, TrendingUp, Calculator, X, Loader2,
  AlertTriangle, Trash2, FileText, Download, Banknote, Send, Paperclip,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
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
  comprobantes:  number;
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
  // Métodos que esta empresa marcó como "exige comprobante": sin eso, un cobro
  // sin adjunto no es una falta y no se debe señalar.
  const [metodosExige, setMetodosExige] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [rango, setRango]   = useState<RangoKey>('30d');

  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    q: '', metodo: '', dgii: '', agrupar: '',
  });
  const [pagoEliminar, setPagoEliminar] = useState<Pago | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/equipo/perfil')
      .then(r => r.json())
      .then(j => { if (vivo) setMetodosExige(Array.isArray(j.metodosExigeComprobante) ? j.metodosExigeComprobante : []); })
      .catch(() => { if (vivo) setMetodosExige([]); });
    return () => { vivo = false; };
  }, []);

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
        <Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>{fmtFechaCorta(p.fechaPago)}</Typography>
          <Typography sx={{ fontSize: '10px', color: '#9ca3af' }}>{fmtFechaHora(p.createdAt)}</Typography>
        </Box>
      ),
    },
    {
      id: 'documento',
      header: 'Documento',
      render: p => p.docId ? (
        <Box sx={{ minWidth: 0 }}>
          <Box
            component={Link}
            href={`/dashboard/facturas/${p.docId}`}
            sx={{ color: '#3658e1', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            {p.docCodigo ?? p.docEncf ?? `#${p.docId}`}
          </Box>
          {p.pagosDelDoc > 1 && (
            <Typography sx={{ fontSize: '10px', color: '#9ca3af', mt: 0.25 }}>
              {p.pagosDelDoc} pagos en esta factura
            </Typography>
          )}
        </Box>
      ) : <Box component="span" sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</Box>,
    },
    {
      id: 'dgii',
      header: 'DGII',
      align: 'center',
      sortable: true,
      sortAccessor: p => (p.enviadoDgii ? 1 : 0),
      render: p => p.enviadoDgii ? (
        <Chip
          icon={<Send style={{ width: 12, height: 12 }} />}
          label="Enviado"
          size="small"
          title={p.docTrackId ? `TrackID: ${p.docTrackId}` : p.docEstado ?? ''}
          sx={{ height: 22, fontSize: '11px', fontWeight: 500, bgcolor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', '& .MuiChip-label': { px: 0.75 }, '& .MuiChip-icon': { color: '#0369a1', ml: 0.5 } }}
        />
      ) : (
        <Chip
          label="No enviado"
          size="small"
          title={p.docEstado ?? 'Sin enviar'}
          sx={{ height: 22, fontSize: '11px', fontWeight: 500, bgcolor: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', '& .MuiChip-label': { px: 0.75 } }}
        />
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      visibleAt: 'md',
      render: p => (
        <Box sx={{ maxWidth: 200 }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente ?? 'Consumidor Final'}</Typography>
          {p.rncComprador && <Typography sx={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.rncComprador}</Typography>}
        </Box>
      ),
    },
    {
      id: 'metodo',
      header: 'Método',
      render: p => (
        <Chip
          label={labelMetodo(p.metodo)}
          size="small"
          sx={{
            height: 22, fontSize: '11px', fontWeight: 500, '& .MuiChip-label': { px: 0.75 },
            ...(esEfectivo(p.metodo)
              ? { bgcolor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
              : { bgcolor: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb' }),
          }}
        />
      ),
    },
    {
      id: 'referencia',
      header: 'Referencia',
      visibleAt: 'lg',
      render: p => p.referencia
        ? <Box component="span" sx={{ fontSize: '0.75rem', color: '#4b5563', fontFamily: 'monospace' }}>{p.referencia}</Box>
        : <Box component="span" sx={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</Box>,
    },
    {
      id: 'registradoPor',
      header: 'Registrado por',
      visibleAt: 'xl',
      render: p => <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.registradoPor ?? p.registradoPorEmail ?? '—'}</Box>,
    },
    {
      id: 'comprobante',
      header: 'Comp.',
      align: 'center',
      render: p => {
        if (p.comprobantes > 0) {
          return (
            <Link
              href={`/dashboard/facturas/${p.docId}`}
              title={`${p.comprobantes} comprobante${p.comprobantes > 1 ? 's' : ''}`}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-zero-50 text-zero-700 text-[11px] font-medium hover:bg-zero-100"
            >
              <Paperclip className="h-3 w-3" />
              {p.comprobantes}
            </Link>
          );
        }
        // Solo se marca en rojo si la empresa configuró que ese método lo exige.
        // Sin esa configuración, no adjuntar nada es lo normal, no una falta.
        if (metodosExige.includes(p.metodo)) {
          return (
            <span
              title="Este método exige comprobante y el cobro no tiene ninguno"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-red-50 text-red-700 text-[11px] font-medium"
            >
              <AlertTriangle className="h-3 w-3" />
              falta
            </span>
          );
        }
        return <span className="text-gray-300 text-xs">—</span>;
      },
    },
    {
      id: 'monto',
      header: 'Monto',
      align: 'right',
      sortable: true,
      sortAccessor: p => p.monto,
      render: p => <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(p.monto)}</Box>,
    },
  ], [metodosExige]);

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
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' }, justifyContent: { sm: 'space-between' }, gap: 1.5 }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>Pagos recibidos</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            Todos los cobros registrados con su detalle: documento, método, referencia y quién lo registró.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Button
            onClick={exportarCSV}
            disabled={pagosFiltrados.length === 0}
            startIcon={<Download style={{ width: 16, height: 16 }} />}
            sx={{
              textTransform: 'none', px: 1.5, py: 1, fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px',
              bgcolor: '#ffffff', color: '#374151', border: '1px solid #d1d5db',
              '&:hover': { borderColor: '#a5b4f9', color: '#2a45c4', bgcolor: '#ffffff' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}
          >
            Exportar CSV
          </Button>
        </Box>
      </Box>

      {/* Selector de rango (server-side) */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
        {RANGOS.map(r => (
          <Button
            key={r.key}
            onClick={() => setRango(r.key)}
            sx={{
              textTransform: 'none', px: 1.5, py: 0.75, minWidth: 0, fontSize: '0.75rem', fontWeight: 500, borderRadius: '8px', border: '1px solid',
              ...(rango === r.key
                ? { bgcolor: '#3658e1', color: '#ffffff', borderColor: '#3658e1', '&:hover': { bgcolor: '#2a45c4', borderColor: '#2a45c4' } }
                : { bgcolor: '#ffffff', color: '#4b5563', borderColor: '#d1d5db', '&:hover': { borderColor: '#a5b4f9', bgcolor: '#ffffff' } }),
            }}
          >
            {r.label}
          </Button>
        ))}
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <StatCard icon={<DollarSign style={{ width: 20, height: 20 }} />} label="Total cobrado" value={fmtDOP(totales.monto)} color="#111827" />
        <StatCard icon={<Wallet style={{ width: 20, height: 20 }} />} label="Pagos" value={totales.count.toString()} color="#111827" />
        <StatCard icon={<Banknote style={{ width: 20, height: 20 }} />} label="En efectivo" value={fmtDOP(efectivoTotal)} color="#047857" />
        <StatCard icon={<Calculator style={{ width: 20, height: 20 }} />} label="Promedio" value={fmtDOP(promedio)} color="#111827" />
      </Box>

      {/* Desglose por método */}
      {desglose.length > 0 && (
        <Box sx={{ bgcolor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#9ca3af', mb: 1.5 }}>
            <TrendingUp style={{ width: 16, height: 16 }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>Desglose por método</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {desglose.map(([metodo, info]) => {
              const pct = totales.monto > 0 ? (info.monto / totales.monto) * 100 : 0;
              return (
                <Box key={metodo}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', mb: 0.25 }}>
                    <Box component="span" sx={{ color: '#374151', fontWeight: 500 }}>
                      {labelMetodo(metodo)}
                      <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}> · {info.count} pago{info.count !== 1 ? 's' : ''}</Box>
                    </Box>
                    <Box component="span" sx={{ color: '#111827', fontWeight: 600 }}>{fmtDOP(info.monto)} <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}>({pct.toFixed(0)}%)</Box></Box>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      height: 6, borderRadius: '9999px', bgcolor: '#f3f4f6',
                      '& .MuiLinearProgress-bar': { borderRadius: '9999px', bgcolor: esEfectivo(metodo) ? '#10b981' : '#5b73ec' },
                    }}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>
                {key}
                <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}> · {rows.length} pago{rows.length !== 1 ? 's' : ''}</Box>
              </Box>
              <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{fmtDOP(tot)}</Box>
            </Box>
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
    </Box>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <Box sx={{ bgcolor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#9ca3af', mb: 1 }}>
        {icon}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{label}</Typography>
      </Box>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</Typography>
    </Box>
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
    <Dialog
      open
      onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: '12px', width: '100%', maxWidth: 448 } } as object }}
    >
      <DialogTitle sx={{ px: 2.5, py: 2, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
        Eliminar pago
        <IconButton onClick={onClose} sx={{ p: 0.75, borderRadius: '6px', color: '#9ca3af', '&:hover': { bgcolor: '#f3f4f6' } }}>
          <X style={{ width: 16, height: 16 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', mt: 1 }}>
          <AlertTriangle style={{ width: 20, height: 20, color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.875rem', color: '#b91c1c' }}>
            Esto revierte el cobro y recalcula el saldo del documento. La acción no se puede deshacer.
          </Typography>
        </Box>
        <Box sx={{ bgcolor: '#f9fafb', borderRadius: '8px', p: 1.5, fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box component="span" sx={{ color: '#6b7280' }}>Documento</Box><Box component="span" sx={{ color: '#1f2937', fontFamily: 'monospace' }}>{pago.docCodigo ?? pago.docEncf ?? (pago.docId ? `#${pago.docId}` : '—')}</Box></Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box component="span" sx={{ color: '#6b7280' }}>Método</Box><Box component="span" sx={{ color: '#1f2937' }}>{labelMetodo(pago.metodo)}</Box></Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box component="span" sx={{ color: '#6b7280' }}>Fecha</Box><Box component="span" sx={{ color: '#1f2937' }}>{fmtFechaCorta(pago.fechaPago)}</Box></Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', pt: 0.5, mt: 0.5, fontWeight: 500 }}><Box component="span" sx={{ color: '#374151' }}>Monto</Box><Box component="span" sx={{ color: '#111827' }}>{fmtDOP(pago.monto)}</Box></Box>
        </Box>
        {error && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
            <AlertTriangle style={{ width: 16, height: 16, color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>{error}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, pt: 0, gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', px: 2, py: 1, fontSize: '0.875rem', fontWeight: 500, color: '#4b5563', '&:hover': { color: '#1f2937', bgcolor: 'transparent' } }}>Cancelar</Button>
        <Button
          onClick={handleDelete}
          disabled={guardando}
          startIcon={guardando ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : undefined}
          sx={{
            textTransform: 'none', px: 2, py: 1, fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px',
            bgcolor: '#dc2626', color: '#ffffff', '&:hover': { bgcolor: '#b91c1c' },
            '&.Mui-disabled': { bgcolor: '#dc2626', opacity: 0.5, color: '#ffffff' },
          }}
        >
          Eliminar pago
        </Button>
      </DialogActions>
    </Dialog>
  );
}
