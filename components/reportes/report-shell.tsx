/**
 * Shell server-safe para páginas de reporte: breadcrumb + header + filtro de
 * fecha (form GET) + botón de descarga. Sin 'use client' — se renderiza en el
 * server. Reutilizado por todos los reportes analíticos.
 */
import Link from 'next/link';
import { ChevronRight, Calendar, Download } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

export function ReportShell({
  titulo, descripcion, migaja, desde, hasta, exportHref, children,
}: {
  titulo: string;
  descripcion: string;
  migaja: string;
  desde: string;   // YYYY-MM-DD
  hasta: string;
  exportHref?: string;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, color: '#6b7280' }}>
        <Link href="/dashboard/reportes" style={{ textDecoration: 'none' }}>
          <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280', '&:hover': { color: '#0d9488' } }}>
            Reportes
          </Typography>
        </Link>
        <ChevronRight style={{ width: 14, height: 14 }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>{migaja}</Typography>
      </Box>

      {/* Header + export */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' }, gap: 1.5, mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{titulo}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>{descripcion}</Typography>
        </Box>
        {exportHref && (
          <Button
            component="a"
            href={exportHref}
            nativeButton={false}
            variant="contained"
            disableElevation
            startIcon={<Download style={{ width: 16, height: 16 }} />}
            sx={{ px: 2, py: 1, borderRadius: '8px', textTransform: 'none', fontWeight: 500, bgcolor: '#0d9488', color: '#fff', '&:hover': { bgcolor: '#0f766e' }, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Descargar Excel
          </Button>
        )}
      </Box>

      {/* Filtro de fecha */}
      <Box component="form" method="get" sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2, mb: 2.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #d1d5db', borderRadius: '8px', px: 1.5, py: 0.75 }}>
            <Calendar style={{ width: 16, height: 16, color: '#9ca3af' }} />
            <Box component="input" type="date" name="desde" defaultValue={desde} sx={{ bgcolor: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', color: '#374151' }} />
            <Typography component="span" sx={{ color: '#9ca3af', fontSize: '0.875rem' }}>—</Typography>
            <Box component="input" type="date" name="hasta" defaultValue={hasta} sx={{ bgcolor: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', color: '#374151' }} />
          </Box>
          <Button type="submit" variant="contained" disableElevation sx={{ px: 1.5, py: 0.75, borderRadius: '8px', textTransform: 'none', fontSize: '0.875rem', fontWeight: 500, bgcolor: '#111827', color: '#fff', '&:hover': { bgcolor: '#1f2937' } }}>
            Aplicar
          </Button>
        </Box>
      </Box>

      {children}
    </Box>
  );
}

/** Tarjeta KPI compartida. `tone` colorea el valor. */
export function KpiCard({
  label, value, sub, tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'teal' | 'amber' | 'red' | 'emerald';
}) {
  const toneColor = {
    default: '#111827',
    teal: '#0f766e',
    amber: '#d97706',
    red: '#dc2626',
    emerald: '#059669',
  }[tone];
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: toneColor, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>{sub}</Typography>}
    </Box>
  );
}

/** Panel blanco con título — contenedor de charts/tablas. */
export function Panel({ titulo, children, right }: { titulo: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{titulo}</Typography>
        {right}
      </Box>
      {children}
    </Box>
  );
}
