'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, BarChart3, AlertTriangle, TrendingUp, FileX, Globe, Loader2, LineChart, ChevronRight, LayoutDashboard, Package, Wallet, Receipt, Users, HandCoins, UserCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';

type ReporteId = '606' | '607' | '608' | '609';

interface ReporteCard {
  id: ReporteId;
  titulo: string;
  descripcion: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  chipColor: 'primary' | 'success' | 'error' | 'secondary';
  badge: string;
}

const REPORTES: ReporteCard[] = [
  {
    id: '606',
    titulo: 'Formato 606',
    descripcion: 'Compras de bienes y servicios a proveedores del RNC. Incluye tipos e-CF 41 (Compras) y 43 (Gastos Menores).',
    icon: TrendingUp,
    iconColor: '#1d4ed8',
    iconBg: '#eff6ff',
    chipColor: 'primary',
    badge: 'Compras',
  },
  {
    id: '607',
    titulo: 'Formato 607',
    descripcion: 'Ventas y retenciones del período. Incluye tipos e-CF 31, 32, 33, 34, 44, 45 y 46.',
    icon: BarChart3,
    iconColor: '#3658e1',
    iconBg: '#eef2fe',
    chipColor: 'success',
    badge: 'Ventas',
  },
  {
    id: '608',
    titulo: 'Formato 608',
    descripcion: 'Comprobantes anulados en el período. Todos los e-CF con estado ANULADO.',
    icon: FileX,
    iconColor: '#dc2626',
    iconBg: '#fef2f2',
    chipColor: 'error',
    badge: 'Anulados',
  },
  {
    id: '609',
    titulo: 'Formato 609',
    descripcion: 'Pagos por servicios al exterior. Tipo e-CF 47 (Pagos al Exterior) con ISR retenido.',
    icon: Globe,
    iconColor: '#7c3aed',
    iconBg: '#faf5ff',
    chipColor: 'secondary',
    badge: 'Exterior',
  },
];

const ANALISIS: { href: string; titulo: string; descripcion: string; icon: React.ElementType; color: string }[] = [
  {
    href: '/dashboard/reportes/panel',
    titulo: 'Panel financiero',
    descripcion: 'KPIs del período: ingresos, ITBIS, cartera y aceptación DGII en una vista.',
    icon: LayoutDashboard,
    color: 'bg-zero-50 text-zero-600',
  },
  {
    href: '/dashboard/reportes/tendencia',
    titulo: 'Tendencia de ingresos',
    descripcion: 'Evolución de ventas por día, semana o mes. Gráfica y exportable a Excel.',
    icon: TrendingUp,
    color: 'bg-sky-50 text-sky-600',
  },
  {
    href: '/dashboard/reportes/por-producto',
    titulo: 'Ingresos por producto',
    descripcion: 'Qué productos/servicios generan tus ingresos. Incluye análisis Pareto (80/20).',
    icon: Package,
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    href: '/dashboard/reportes/cuentas-por-cobrar',
    titulo: 'Cuentas por cobrar',
    descripcion: 'Antigüedad de saldos (aging) de tu cartera abierta y facturas vencidas.',
    icon: Wallet,
    color: 'bg-amber-50 text-amber-600',
  },
  {
    href: '/dashboard/reportes/por-tipo',
    titulo: 'Por tipo de comprobante',
    descripcion: 'Desglose por tipo de e-CF DGII: e31 crédito fiscal, e32 consumo, notas, etc.',
    icon: Receipt,
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    href: '/dashboard/reportes/por-cliente',
    titulo: 'Ingresos por cliente',
    descripcion: 'Ranking de clientes por facturación en el período.',
    icon: UserCircle,
    color: 'bg-violet-50 text-violet-600',
  },
  {
    href: '/dashboard/reportes/por-usuario',
    titulo: 'Ventas por usuario',
    descripcion: 'Quién emitió cada factura. Ranking por monto facturado.',
    icon: Users,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    href: '/dashboard/reportes/por-usuario-pago',
    titulo: 'Cobros por usuario',
    descripcion: 'Quién registró cada pago recibido. Ranking por monto cobrado.',
    icon: HandCoins,
    color: 'bg-rose-50 text-rose-600',
  },
  {
    href: '/dashboard/reportes/ventas-generales',
    titulo: 'Ventas generales',
    descripcion: 'Visión detallada de ventas y devoluciones. Filtros por fecha, exportable a CSV.',
    icon: LineChart,
    color: 'bg-emerald-50 text-emerald-600',
  },
];

const MESES: [string, string][] = [
  ['01', 'Enero'],     ['02', 'Febrero'],  ['03', 'Marzo'],     ['04', 'Abril'],
  ['05', 'Mayo'],      ['06', 'Junio'],    ['07', 'Julio'],      ['08', 'Agosto'],
  ['09', 'Septiembre'],['10', 'Octubre'],  ['11', 'Noviembre'], ['12', 'Diciembre'],
];

export default function ReportesPage() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear().toString());
  const [mes, setMes]   = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [loadingId, setLoadingId] = useState<ReporteId | null>(null);

  const mesLabel = MESES.find(([v]) => v === mes)?.[1] ?? mes;
  const anios = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  function downloadReporte(id: ReporteId) {
    setLoadingId(id);
    const url = `/api/reportes/${id}?anio=${anio}&mes=${mes}`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
    setTimeout(() => setLoadingId(null), 2000);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Reportes DGII
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Genera los archivos TXT para enviar al portal OFV de la DGII — Norma General 07-18
        </Typography>
      </Box>

      {/* Reportes gerenciales (no DGII) — análisis comercial */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5, display: 'block' }}>
          Análisis comercial
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' } }}>
          {ANALISIS.map(a => {
            const [bg, fg] = ({
              'bg-zero-50 text-zero-600':       ['#eef2fe', '#3658e1'],
              'bg-sky-50 text-sky-600':         ['#f0f9ff', '#0284c7'],
              'bg-indigo-50 text-indigo-600':   ['#eef2ff', '#4f46e5'],
              'bg-amber-50 text-amber-600':     ['#fffbeb', '#d97706'],
              'bg-cyan-50 text-cyan-600':       ['#ecfeff', '#0891b2'],
              'bg-violet-50 text-violet-600':   ['#f5f3ff', '#7c3aed'],
              'bg-rose-50 text-rose-600':       ['#fff1f2', '#e11d48'],
              'bg-emerald-50 text-emerald-600': ['#ecfdf5', '#059669'],
            } as Record<string, [string, string]>)[a.color] ?? ['#eef2fe', '#3658e1'];
            return (
              <Card
                key={a.href}
                component={Link}
                href={a.href}
                elevation={0}
                sx={{ textDecoration: 'none', border: '1px solid #e5e7eb', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s', '&:hover': { borderColor: 'primary.main', boxShadow: '0 2px 8px rgba(13,148,136,0.12)' } }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: '16px !important' }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <a.icon style={{ width: 20, height: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{a.titulo}</Typography>
                      <ChevronRight style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{a.descripcion}</Typography>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Box>

      {/* Período de reporte */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 3 }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
            Período de reporte
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={mes}
                onChange={e => setMes(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                {MESES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={anio}
                onChange={e => setAnio(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                {anios.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </Select>
            </FormControl>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              → Archivo del período {mes}/{anio}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Tarjetas de reporte */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {REPORTES.map(r => (
          <Card key={r.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: '20px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: r.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <r.icon style={{ width: 20, height: 20, color: r.iconColor }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>{r.titulo}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{mesLabel} {anio}</Typography>
                  </Box>
                </Box>
                <Chip label={r.badge} color={r.chipColor} size="small" sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 22 }} />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6, flex: 1, display: 'block' }}>
                {r.descripcion}
              </Typography>
              <MuiButton
                variant="contained"
                color="primary"
                disableElevation
                fullWidth
                onClick={() => downloadReporte(r.id)}
                disabled={loadingId === r.id}
                startIcon={loadingId === r.id
                  ? <CircularProgress size={16} color="inherit" />
                  : <Download style={{ width: 16, height: 16 }} />
                }
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
              >
                {loadingId === r.id ? 'Generando...' : 'Descargar TXT'}
              </MuiButton>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Instrucciones */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 3 }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
            Instrucciones de envío
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 3, '& li': { mb: 0.75 } }}>
            {[
              'Descarga el archivo TXT del período que deseas reportar.',
              <>Ingresa al portal <Box component="code" sx={{ bgcolor: 'grey.100', px: 0.75, py: 0.25, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.8125rem' }}>dgii.gov.do/ofv</Box> con tu usuario y contraseña.</>,
              <>Ve a <strong>Enviar Archivos</strong> y selecciona el tipo de formato (606, 607, 608 o 609).</>,
              <>Adjunta el archivo TXT descargado y haz clic en <strong>Enviar Datos</strong>.</>,
              <>Si el período no tuvo operaciones, usa <strong>Declaraciones en Cero</strong>.</>,
            ].map((item, i) => (
              <Typography key={i} component="li" variant="caption" sx={{ color: 'text.secondary', display: 'list-item' }}>
                {item}
              </Typography>
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1.5 }}>
            Fecha límite: día 15 del mes siguiente al período reportado.
          </Typography>
        </CardContent>
      </Card>

      {/* Advertencia */}
      <Alert
        severity="warning"
        icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        sx={{ borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Verifica los datos antes de enviar
        </Typography>
        <Typography variant="caption">
          Los archivos se generan desde los comprobantes registrados en Zero. Asegúrate de que
          todos los e-CF del período estén correctamente emitidos y aceptados por la DGII antes de
          enviar el reporte. Los comprobantes anulados aparecen en el 608 automáticamente.
        </Typography>
      </Alert>
    </Box>
  );
}
