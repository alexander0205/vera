'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ShoppingCart, FileText, Plus, PackagePlus, UserRound } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtFechaCorta, fmtDOP, hoyRD } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { rangoDelMes } from '@/lib/nomina/periodos';
import { analizarNcf } from '@/lib/compras/fiscal';
import type { RecepcionEcfDto } from '@/lib/ecf-api/client';
import type { FilaCompra } from '@/lib/compras/consultas';
import CapturaEnlaceBoton from './_captura-enlace-boton';
import CapturasTab from './_capturas-tab';

const ESTADO_CHIP: Record<string, { label: string; bgcolor: string; color: string; border: string }> = {
  ACEPTADO:             { label: 'Aceptado',    bgcolor: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', bgcolor: '#fffbeb', color: '#92400e', border: '#fde68a' },
  RECHAZADO:            { label: 'Rechazado',   bgcolor: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  RECIBIDO:             { label: 'Recibido',    bgcolor: '#e0f2fe', color: '#0c4a6e', border: '#7dd3fc' },
  PENDIENTE:            { label: 'Pendiente',   bgcolor: '#f3f4f6', color: '#4b5563', border: '#d1d5db' },
};

const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito', '41': 'Compras', '43': 'Gastos Men.',
  '44': 'Reg. Único',   '45': 'Gub.',    '46': 'Export.', '47': 'Otros',
};

function tipoFromEncf(item: RecepcionEcfDto): string {
  const code = item.tipoECF || item.tipoComprobante || item.eNcf?.match(/^E(\d{2})/)?.[1] || '';
  return code ? (TIPO_LABELS[code] ?? `e${code}`) : '—';
}

function fmtMonto(item: RecepcionEcfDto): string {
  const xml = item.xmlFirmado ?? item.xmlOriginal;
  const m = xml?.match(/<MontoTotal>\s*([\d.]+)\s*<\/MontoTotal>/i);
  if (!m) return '—';
  return `RD$${Number(m[1]).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ComprasResponse { items?: RecepcionEcfDto[]; sinContribuyente?: boolean; error?: string }

const fetcher = (url: string) => fetch(url).then(r => r.json());

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
function ultimosMeses(hoy: string, n = 12): string[] {
  const [y, m] = hoy.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

// ─── e-CF recibidos ────────────────────────────────────────────────────────────

const columnasRecibidas = (puedeRegistrar: boolean): DataTableColumn<RecepcionEcfDto>[] => [
  {
    id: 'emisor', header: 'Emisor (RNC)',
    render: item => (
      <Link href={`/dashboard/compras/${item.id}`} style={{ textDecoration: 'none' }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#2a45c4', '&:hover': { textDecoration: 'underline' } }}>
          {item.rncEmisor ?? item.rnc}
        </Typography>
      </Link>
    ),
  },
  { id: 'encf', header: 'e-NCF', render: item => <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151' }}>{item.eNcf}</Typography> },
  { id: 'tipo', header: 'Tipo', visibleAt: 'md', render: item => <Typography sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{tipoFromEncf(item)}</Typography> },
  {
    id: 'fecha', header: 'Fecha', visibleAt: 'md',
    render: item => <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', whiteSpace: 'nowrap' }}>{fmtFechaCorta(item.fechaRecepcion ?? item.createdAt)}</Typography>,
  },
  {
    id: 'estado', header: 'Estado', align: 'center',
    render: item => {
      const chip = ESTADO_CHIP[item.estado ?? 'PENDIENTE'] ?? { label: item.estado ?? '', bgcolor: '#f3f4f6', color: '#6b7280', border: '#d1d5db' };
      return <Chip label={chip.label} size="small" sx={{ bgcolor: chip.bgcolor, color: chip.color, border: `1px solid ${chip.border}`, fontSize: '0.6875rem', fontWeight: 500 }} />;
    },
  },
  { id: 'monto', header: 'Monto', align: 'right', render: item => <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMonto(item)}</Typography> },
  ...(puedeRegistrar ? [{
    id: 'registrar', header: '', align: 'right' as const,
    render: (item: RecepcionEcfDto) => (
      <Link href={`/dashboard/compras/registrar?ecf=${item.id}`} style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3658e1', whiteSpace: 'nowrap' }}>
        Registrar compra
      </Link>
    ),
  }] : []),
];

// ─── Compras registradas ───────────────────────────────────────────────────────

function EstadoCompra({ c }: { c: FilaCompra }) {
  if (c.estado === 'anulada') return <Chip label="Anulada" size="small" sx={{ bgcolor: '#fef2f2', color: '#b91c1c', fontSize: '0.6875rem' }} />;
  if (c.saldoCents > 0) {
    return (
      <Box sx={{ textAlign: 'center' }}>
        <Chip label="Por pagar" size="small" sx={{ bgcolor: '#fffbeb', color: '#b45309', fontSize: '0.6875rem' }} />
        <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>saldo {fmtDOP(c.saldoCents)}</Typography>
      </Box>
    );
  }
  return <Chip label="Pagada" size="small" sx={{ bgcolor: '#f1f5f9', color: '#475569', fontSize: '0.6875rem' }} />;
}

const tachado = (c: FilaCompra) => (c.estado === 'anulada' ? { textDecoration: 'line-through', color: '#9ca3af' } : {});

const columnasRegistradas: DataTableColumn<FilaCompra>[] = [
  { id: 'fecha', header: 'Fecha', render: c => <Typography component="span" sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap', ...tachado(c) }}>{fmtFechaCorta(c.fecha)}</Typography> },
  {
    id: 'proveedor', header: 'Proveedor',
    render: c => (
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...tachado(c) }}>{c.proveedorNombre ?? '—'}</Typography>
        {c.proveedorRnc && <Typography sx={{ fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{c.proveedorRnc}</Typography>}
      </Box>
    ),
  },
  {
    id: 'ncf', header: 'Comprobante', visibleAt: 'md',
    render: c => {
      const info = analizarNcf(c.ncf);
      return (
        <Box>
          <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', ...tachado(c) }}>{c.ncf ?? '—'}</Typography>
          <Typography sx={{ fontSize: '11px', color: '#9ca3af' }}>{info.valido ? info.nombre : ''}{c.conInventario ? ' · inventario' : ''}</Typography>
        </Box>
      );
    },
  },
  {
    id: 'retenciones', header: 'Retenciones', align: 'right', visibleAt: 'md',
    render: c => <Typography component="span" sx={{ fontSize: '0.8125rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{c.retencionesCents ? fmtDOP(c.retencionesCents) : '—'}</Typography>,
  },
  { id: 'estado', header: 'Pago', align: 'center', render: c => <EstadoCompra c={c} /> },
  {
    id: 'monto', header: 'Total', align: 'right',
    render: c => <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, whiteSpace: 'nowrap', ...tachado(c) }}>{fmtDOP(c.montoTotal)}</Typography>,
  },
];

function Tarjeta({ titulo, valor, sub, destacado }: { titulo: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', p: 1.75, bgcolor: destacado ? '#eef2fe' : '#fff', minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{titulo}</Typography>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: destacado ? '#2a45c4' : '#111827', whiteSpace: 'nowrap' }}>{valor}</Typography>
      {sub && <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{sub}</Typography>}
    </Box>
  );
}

export default function ComprasPage() {
  const { can, isLoading: permLoading } = usePermissions();
  const canVerRecibidas = can('compras:ver');
  const canRegistrar = can('productos:gestionar');
  const canVerRegistradas = canRegistrar || can('productos:ver');

  const hoy = hoyRD();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [tab, setTab] = useState<'registradas' | 'recibidas' | 'capturas'>('registradas');
  const rango = mes ? rangoDelMes(mes) : null;

  const { data: recibidas, isLoading: cargandoRecibidas } = useSWR<ComprasResponse>(
    !permLoading && canVerRecibidas && tab === 'recibidas' ? '/api/compras' : null, fetcher, { revalidateOnFocus: false },
  );
  const { data: registradas, isLoading: cargandoRegistradas } = useSWR<{ compras?: FilaCompra[]; error?: string }>(
    !permLoading && canVerRegistradas ? `/api/compras/local?clase=compra${rango ? `&desde=${rango.inicio}&hasta=${rango.fin}` : ''}` : null, fetcher,
  );
  const compras = registradas?.compras ?? [];

  const resumen = useMemo(() => {
    const vivas = compras.filter(c => c.estado === 'registrada');
    return {
      total: vivas.reduce((s, c) => s + c.montoTotal, 0),
      adelantar: vivas.reduce((s, c) => s + c.itbisAdelantarCents, 0),
      retenciones: vivas.reduce((s, c) => s + c.retencionesCents, 0),
      porPagar: vivas.reduce((s, c) => s + c.saldoCents, 0),
      cantidad: vivas.length,
    };
  }, [compras]);

  if (!permLoading && !canVerRecibidas && !canVerRegistradas) {
    return <Box sx={{ p: 3 }}><Alert severity="info">No tienes permiso para ver esta sección.</Alert></Box>;
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#eef2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShoppingCart color="#3658e1" style={{ width: 20, height: 20 }} />
          </Box>
          <Box>
            <Typography component="h1" sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>Compras</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.25 }}>
              Los comprobantes de tus proveedores: inventario, retenciones, 606 y cuentas por pagar.
            </Typography>
          </Box>
        </Box>
        {canRegistrar && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <CapturaEnlaceBoton />
            <Button component={Link} href="/dashboard/compras/nueva" variant="outlined" size="small" startIcon={<UserRound style={{ width: 16, height: 16 }} />}
              title="Para personas sin RNC que no pueden darte comprobante: lo emites tú (e41)">
              Compra a informal (e41)
            </Button>
            <Button component={Link} href="/dashboard/compras/registrar" variant="contained" size="small" startIcon={<Plus style={{ width: 16, height: 16 }} />}>
              Registrar compra
            </Button>
          </Box>
        )}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        {canVerRegistradas && <Tab value="registradas" label="Compras registradas" />}
        {canVerRecibidas && <Tab value="recibidas" label="e-CF recibidos" />}
        {canRegistrar && <Tab value="capturas" label="Capturas" />}
      </Tabs>

      {tab === 'registradas' && canVerRegistradas && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NativeSelect aria-label="Mes" value={mes} onChange={e => setMes(e.target.value)} style={{ width: 'auto', height: 34 }}>
              {ultimosMeses(hoy).map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
              <option value="">Todos los meses</option>
            </NativeSelect>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }} data-testid="resumen-compras">
            <Tarjeta titulo="Comprado" valor={fmtDOP(resumen.total)} sub={`${resumen.cantidad} comprobante${resumen.cantidad === 1 ? '' : 's'}`} destacado />
            <Tarjeta titulo="ITBIS por adelantar" valor={fmtDOP(resumen.adelantar)} sub="Crédito para el IT-1" />
            <Tarjeta titulo="Retenciones" valor={fmtDOP(resumen.retenciones)} sub="A pagar a la DGII" />
            <Tarjeta titulo="Por pagar" valor={fmtDOP(resumen.porPagar)} sub="Compras a crédito" />
          </Box>
          <DataTable<FilaCompra>
            data={compras}
            loading={permLoading || cargandoRegistradas}
            columns={columnasRegistradas}
            rowHref={c => `/dashboard/compras/local/${c.id}`}
            title="Compras registradas"
            emptyState={{
              icon: PackagePlus,
              title: mes ? `No hay compras registradas en ${nombreMes(mes).toLowerCase()}` : 'No has registrado compras',
              hint: 'Registra el comprobante de tu proveedor: suma inventario, arma el 606 y va a contabilidad.',
            }}
          />
        </>
      )}

      {tab === 'capturas' && canRegistrar && <CapturasTab />}

      {tab === 'recibidas' && canVerRecibidas && (
        <>
          {recibidas?.error && <Alert severity="error" sx={{ borderRadius: '10px' }}>{recibidas.error}</Alert>}
          <DataTable<RecepcionEcfDto>
            data={recibidas?.items ?? []}
            loading={permLoading || cargandoRecibidas}
            columns={columnasRecibidas(canRegistrar)}
            title="e-CF recibidos"
            emptyState={{
              icon: recibidas?.sinContribuyente ? ShoppingCart : FileText,
              title: recibidas?.sinContribuyente ? 'Tu empresa aún no está registrada para recibir e-CF' : 'No has recibido e-CF todavía',
              hint: recibidas?.sinContribuyente
                ? 'Configura el certificado digital y regístrate en la DGII para recibir las facturas electrónicas de tus proveedores.'
                : 'Aquí aparecen las facturas electrónicas que te emiten tus proveedores. Regístralas para que cuenten en el 606.',
            }}
          />
        </>
      )}
    </Box>
  );
}
