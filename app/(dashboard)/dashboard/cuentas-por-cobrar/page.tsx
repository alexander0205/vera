'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle, Clock, DollarSign,
  Wallet, Archive, Wallet2,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
// PagoModal vive fuera: lo reusa el perfil del estudiante (módulo escolar).
import { PagoModal, type Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';

const isHistorica = (c: Cuenta) => c.estado === 'HISTORICA' || c.tipoEcf === '00';

interface Totales {
  pendiente:     number;
  vencido:       number;
  count:         number;
  countVencidas: number;
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color?: string;
}) {
  return (
    <Box sx={{ bgcolor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.disabled', mb: 1 }}>
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography>
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: color ?? 'text.primary' }}>{value}</Typography>
    </Box>
  );
}

export default function CuentasPorCobrarPage() {
  const [data, setData]         = useState<{ cuentas: Cuenta[]; totales: Totales } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  // Filtros 100% client-side sobre el dataset cargado (AR es acotado).
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    cliente: '', tipoDoc: '', estado: '', agrupar: '',
  });
  const [pagoModal, setPagoModal] = useState<Cuenta | null>(null);
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

  // Deep-link `?pagar=<docId>`: al llegar desde otro módulo (p. ej. un cargo
  // escolar) abre directo el modal de cobro de esa factura. Se consume una vez.
  const [pagarConsumido, setPagarConsumido] = useState(false);
  useEffect(() => {
    if (!data || pagarConsumido) return;
    const pagarId = new URLSearchParams(window.location.search).get('pagar');
    if (!pagarId) return;
    const cuenta = data.cuentas.find((c) => String(c.id) === pagarId);
    if (cuenta) { setPagoModal(cuenta); setPagarConsumido(true); }
  }, [data, pagarConsumido]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Link href={`/dashboard/facturas/${c.id}`} style={{ textDecoration: 'none' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
              {c.codigo ?? `Factura #${c.id}`}
            </Typography>
          </Link>
          {isHistorica(c) && (
            <Chip label="histórica" size="small"
              sx={{ height: 18, fontSize: '0.625rem', fontWeight: 600, bgcolor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', '& .MuiChip-label': { px: 0.75 } }} />
          )}
        </Box>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      render: c => (
        <Box sx={{ maxWidth: 220 }}>
          <Typography variant="body2" sx={{ color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.razonSocialComprador ?? 'Consumidor Final'}
          </Typography>
          {c.rncComprador && (
            <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', display: 'block' }}>{c.rncComprador}</Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      render: c => <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtFechaCorta(c.fechaEmision)}</Typography>,
    },
    {
      id: 'vence',
      header: 'Vence',
      visibleAt: 'lg',
      render: c => c.fechaLimitePago ? (
        <Box>
          <Typography variant="caption" sx={{ color: c.vencida ? 'error.main' : 'text.secondary', fontWeight: c.vencida ? 700 : 400, display: 'block' }}>
            {fmtFechaCorta(c.fechaLimitePago)}
          </Typography>
          {c.vencida && (
            <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
              {c.diasVencido} día{c.diasVencido !== 1 ? 's' : ''} vencida
            </Typography>
          )}
        </Box>
      ) : <Typography variant="caption" sx={{ color: 'text.disabled' }}>—</Typography>,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      visibleAt: 'md',
      render: c => <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{fmtDOP(c.montoTotal)}</Typography>,
    },
    {
      id: 'pagado',
      header: 'Pagado',
      align: 'right',
      visibleAt: 'lg',
      render: c => <Typography variant="caption" sx={{ color: '#059669', whiteSpace: 'nowrap' }}>{fmtDOP(c.pagado)}</Typography>,
    },
    {
      id: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: c => (
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {fmtDOP(c.saldo)}
          </Typography>
          {c.moraSaldo > 0 && (
            <Typography variant="caption" sx={{ color: '#ea580c', display: 'block', whiteSpace: 'nowrap' }}>
              incl. mora {fmtDOP(c.moraSaldo)}
            </Typography>
          )}
        </Box>
      ),
    },
  ], []);

  const rowActions = (c: Cuenta): RowAction[] => [
    { icon: Wallet2, title: 'Registrar pago', onClick: () => setPagoModal(c) },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' }, justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Cuentas por cobrar</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Facturas a crédito pendientes de pago. Registra abonos y monitorea vencimientos.
          </Typography>
        </Box>
        <MuiButton variant="outlined" size="small"
          startIcon={<Archive style={{ width: 14, height: 14 }} />}
          onClick={() => setHistoricaModal(true)}
          title="Importar factura previa al uso de Zero (no va a DGII)"
          sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider', color: 'text.secondary', flexShrink: 0 }}>
          Agregar cuenta histórica
        </MuiButton>
      </Box>

      {/* Stats — reflejan el filtro activo (totales reactivos a cuentasFiltradas) */}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
          <StatCard icon={<DollarSign style={{ width: 18, height: 18 }} />} label="Pendiente" value={fmtDOP(totales.pendiente)} />
          <StatCard icon={<AlertTriangle style={{ width: 18, height: 18 }} />} label="Vencido" value={fmtDOP(totales.vencido)} color="#dc2626" />
          <StatCard icon={<Wallet style={{ width: 18, height: 18 }} />} label="Cuentas" value={totales.count.toString()} />
          <StatCard icon={<Clock style={{ width: 18, height: 18 }} />} label="Vencidas" value={totales.countVencidas.toString()}
            color={totales.countVencidas > 0 ? '#dc2626' : undefined} />
        </Box>
      )}

      {/* Tabla reutilizable con filtros + agrupación */}
      <DataTable<Cuenta>
        data={cuentasFiltradas}
        loading={loading}
        error={error}
        columns={columns}
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
        rowActions={rowActions}
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
              <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{fmtDOP(tot)}</Typography>
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

      {/* Modal: Registrar pago */}
      {pagoModal && (
        <PagoModal
          cuenta={pagoModal}
          onClose={() => setPagoModal(null)}
          onSuccess={() => { setPagoModal(null); cargar(); }}
        />
      )}

      {/* Modal: Agregar cuenta histórica */}
      {historicaModal && (
        <HistoricaModal
          onClose={() => setHistoricaModal(false)}
          onSuccess={() => { setHistoricaModal(false); cargar(); }}
        />
      )}
    </Box>
  );
}

// ─── Modal: agregar cuenta histórica (factura previa, no DGII) ──────────────

function HistoricaModal({ onClose, onSuccess }: {
  onClose: () => void; onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const vencDefault = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  })();

  const [encf, setEncf]                 = useState('');
  const [razonSocial, setRazonSocial]   = useState('');
  const [rnc, setRnc]                   = useState('');
  const [fechaEmision, setFechaEmision] = useState(today);
  const [fechaLimite, setFechaLimite]   = useState(vencDefault);
  const [montoDOP, setMontoDOP]         = useState('');
  const [yaPagadoDOP, setYaPagadoDOP]   = useState('0');
  const [notas, setNotas]               = useState('');
  const [guardando, setGuardando]       = useState(false);
  const [error, setError]               = useState<string | null>(null);

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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
      <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
        Agregar cuenta histórica
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
          Factura previa al uso de Zero — solo tracking de cobranza. No se envía a DGII.
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        <Box component="form" id="historica-form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <MuiTextField
              label="NCF / Referencia" placeholder="B01000000001 (opcional)"
              value={encf} size="small" fullWidth
              slotProps={{ htmlInput: { maxLength: 40, style: { fontFamily: 'monospace', textTransform: 'uppercase' } } }}
              onChange={e => setEncf(e.target.value.toUpperCase())}
              helperText="Si lo dejas vacío se genera automáticamente."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <MuiTextField
              label="RNC / Cédula" placeholder="131988032"
              value={rnc} size="small" fullWidth
              slotProps={{ htmlInput: { maxLength: 20 } }}
              onChange={e => setRnc(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <MuiTextField
            label="Cliente *" placeholder="Razón social del cliente"
            value={razonSocial} size="small" fullWidth required
            slotProps={{ htmlInput: { maxLength: 255 } }}
            onChange={e => setRazonSocial(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <MuiTextField
              label="Fecha emisión *" type="date" value={fechaEmision} size="small" fullWidth required
              onChange={e => setFechaEmision(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <MuiTextField
              label="Vencimiento *" type="date" value={fechaLimite} size="small" fullWidth required
              onChange={e => setFechaLimite(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <MuiTextField
              label="Monto total RD$ *" type="number" placeholder="0.00"
              value={montoDOP} size="small" fullWidth required
              slotProps={{ htmlInput: { step: 0.01, min: 0.01 } }}
              onChange={e => setMontoDOP(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <MuiTextField
              label="Ya pagado RD$" type="number" placeholder="0.00"
              value={yaPagadoDOP} size="small" fullWidth
              slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
              onChange={e => setYaPagadoDOP(e.target.value)}
              helperText="Abonos previos al sistema."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <MuiTextField
            label="Notas (opcional)" placeholder="Factura preimpresa serie B01 julio 2025, etc."
            value={notas} size="small" fullWidth multiline rows={2}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            onChange={e => setNotas(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          {error && (
            <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <MuiButton variant="outlined" onClick={onClose} sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
        <MuiButton type="submit" form="historica-form" variant="contained" disableElevation
          disabled={guardando}
          startIcon={guardando ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
          Agregar cuenta
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
}
