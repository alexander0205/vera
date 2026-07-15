import Link from 'next/link';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { Calendar, Download, ChevronRight } from 'lucide-react';
import { getUser, getTeamIdForUser, getVentasGenerales } from '@/lib/db/queries';
import { userCanForTeam } from '@/lib/auth/permissions';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura',
  '32': 'Factura Consumo',
  '33': 'Nota Débito',
  '34': 'Nota Crédito',
  '41': 'Compra',
  '43': 'Gasto Menor',
  '44': 'Régimen Especial',
  '45': 'Gubernamental',
  '46': 'Exportación',
  '47': 'Pago Exterior',
};

const ESTADO_LABEL: Record<string, { label: string; bgcolor: string; color: string; border: string }> = {
  ACEPTADO:             { label: 'Cobrada',     bgcolor: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', bgcolor: '#fffbeb', color: '#92400e', border: '#fde68a' },
  EN_PROCESO:           { label: 'En Proceso',  bgcolor: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  RECHAZADO:            { label: 'Rechazada',   bgcolor: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  ANULADO:              { label: 'Anulada',     bgcolor: '#f9fafb', color: '#4b5563', border: '#d1d5db' },
  BORRADOR:             { label: 'Sin comprobante', bgcolor: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
};

function fmtDOP(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseRangeFromQuery(desde?: string, hasta?: string): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const from = desde ? new Date(desde) : defaultFrom;
  const to   = hasta ? new Date(hasta + 'T23:59:59') : defaultTo;
  return { from, to };
}

export default async function VentasGeneralesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'reportes:ver')) {
    redirect('/dashboard?error=sin_permiso');
  }

  const params = await searchParams;
  const { from, to } = parseRangeFromQuery(params.desde, params.hasta);

  const data = await getVentasGenerales(teamId, from, to);

  const desdeStr = from.toISOString().slice(0, 10);
  const hastaStr = to.toISOString().slice(0, 10);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <Link href="/dashboard/reportes" style={{ textDecoration: 'none' }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', '&:hover': { color: '#0d9488' } }}>Reportes</Typography>
        </Link>
        <ChevronRight size={14} color="#9ca3af" />
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Ventas</Typography>
        <ChevronRight size={14} color="#9ca3af" />
        <Typography sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Ventas generales</Typography>
      </Box>

      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Ventas generales</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            Obtén una visión detallada de tus ventas y devoluciones para diseñar estrategias comerciales.
          </Typography>
        </Box>
        <Button
          component="a"
          href={`/api/reportes/ventas-generales/export?desde=${desdeStr}&hasta=${hastaStr}`}
          variant="contained"
          disableElevation
          startIcon={<Download size={16} />}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Descargar
        </Button>
      </Box>

      {/* Filtros */}
      <Box
        component="form"
        method="get"
        sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2, mb: 2.5 }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #d1d5db', borderRadius: '8px', px: 1.5, py: 0.75 }}>
            <Calendar size={16} color="#9ca3af" />
            <Box
              component="input"
              type="date"
              name="desde"
              defaultValue={desdeStr}
              sx={{ bgcolor: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', color: '#374151' }}
            />
            <Typography sx={{ color: '#9ca3af', fontSize: '0.875rem' }}>—</Typography>
            <Box
              component="input"
              type="date"
              name="hasta"
              defaultValue={hastaStr}
              sx={{ bgcolor: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', color: '#374151' }}
            />
          </Box>
          <Button
            type="submit"
            variant="contained"
            disableElevation
            size="small"
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#111827', '&:hover': { bgcolor: '#1f2937' } }}
          >
            Aplicar
          </Button>
        </Box>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(5, 1fr)' }, gap: 1.5, mb: 3 }}>
        <StatCard label="Ventas brutas"        value={data.montos.ventasBrutas} />
        <StatCard label="Notas crédito"        value={data.montos.notasCredito}   separator="−" />
        <StatCard label="Antes de impuestos"   value={data.montos.antesImpuestos} separator="=" highlight />
        <StatCard label="Impuestos"            value={data.montos.impuestos}      separator="+" />
        <StatCard label="Después de impuestos" value={data.montos.despuesImpuestos} separator="=" highlight />
      </Box>

      {/* Gráfica */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Total ventas</Typography>
          <Box sx={{ display: 'flex', bgcolor: '#f3f4f6', borderRadius: '8px', p: 0.5 }}>
            <Typography sx={{ px: 1.5, py: 0.5, fontSize: '0.75rem', fontWeight: 500, bgcolor: '#fff', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>Diario</Typography>
            <Typography sx={{ px: 1.5, py: 0.5, fontSize: '0.75rem', fontWeight: 500, color: '#6b7280' }}>Mensual</Typography>
          </Box>
        </Box>
        <SimpleBarChart docs={data.documentos} />
      </Box>

      {/* Tabla documentos */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Documentos ({data.documentos.length})
          </Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <Box component="thead">
              <Box component="tr" sx={{ bgcolor: '#f9fafb' }}>
                {['Documento', 'Cliente', 'Estado', 'Creación', 'Subtotal', 'Impuestos', 'Total'].map((h, i) => (
                  <Box component="th" key={h} sx={{ px: 2, py: 1.5, textAlign: i >= 4 ? 'right' : 'left', fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {data.documentos.length === 0 ? (
                <Box component="tr">
                  <Box component="td" colSpan={7} sx={{ px: 2, py: 6, textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                    Sin documentos en este rango.
                  </Box>
                </Box>
              ) : data.documentos.map(d => {
                const estado  = ESTADO_LABEL[d.estado] ?? { label: d.estado, bgcolor: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
                const subtotal = d.montoTotal - d.totalItbis;
                return (
                  <Box component="tr" key={d.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, borderBottom: '1px solid #f3f4f6' }}>
                    <Box component="td" sx={{ px: 2, py: 1.5 }}>
                      <Link href={`/dashboard/facturas/${d.id}`} style={{ textDecoration: 'none', color: '#0d9488', fontWeight: 600 }}>
                        {d.encf}
                      </Link>
                      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{TIPO_NOMBRE[d.tipoEcf] ?? `Tipo ${d.tipoEcf}`}</Typography>
                    </Box>
                    <Box component="td" sx={{ px: 2, py: 1.5 }}>
                      <Typography sx={{ color: '#111827', fontSize: '0.875rem' }}>{d.razonSocialComprador ?? 'Consumidor Final'}</Typography>
                      {d.rncComprador && <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{d.rncComprador}</Typography>}
                    </Box>
                    <Box component="td" sx={{ px: 2, py: 1.5 }}>
                      <Chip label={estado.label} size="small" sx={{ bgcolor: estado.bgcolor, color: estado.color, border: `1px solid ${estado.border}`, fontSize: '0.6875rem', height: 20 }} />
                    </Box>
                    <Box component="td" sx={{ px: 2, py: 1.5, color: '#374151', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{fmtFecha(d.fechaEmision)}</Box>
                    <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right', color: '#374151', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{fmtDOP(subtotal)}</Box>
                    <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right', color: '#374151', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{fmtDOP(d.totalItbis)}</Box>
                    <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right', fontWeight: 600, color: '#111827', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{fmtDOP(d.montoTotal)}</Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  separator,
  highlight,
}: {
  label:      string;
  value:      number;
  separator?: '+' | '−' | '=';
  highlight?: boolean;
}) {
  return (
    <Box sx={{ position: 'relative', bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
      {separator && (
        <Box sx={{
          position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)',
          display: { xs: 'none', lg: 'flex' }, height: 20, width: 20, alignItems: 'center', justifyContent: 'center',
          bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '50%',
          fontSize: '0.6875rem', fontWeight: 700, color: '#6b7280',
        }}>
          {separator}
        </Box>
      )}
      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: highlight ? '1.125rem' : '1rem' }}>
        {fmtDOP(value)}
      </Typography>
    </Box>
  );
}

function SimpleBarChart({
  docs,
}: {
  docs: Array<{ fechaEmision: Date; montoTotal: number }>;
}) {
  if (docs.length === 0) {
    return (
      <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', textAlign: 'center', py: 4 }}>
        Sin datos en este rango.
      </Typography>
    );
  }

  const byDay = new Map<string, number>();
  for (const d of docs) {
    const key = new Date(d.fechaEmision).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + d.montoTotal);
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 160, px: 1 }}>
      {entries.map(([day, total]) => {
        const heightPct = (total / max) * 100;
        return (
          <Box key={day} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 0, '&:hover .bar': { bgcolor: '#0f766e' } }}>
            <Box
              className="bar"
              title={`${day}: ${fmtDOP(total)}`}
              sx={{ width: '100%', bgcolor: '#0d9488', borderRadius: '3px 3px 0 0', transition: 'background 0.15s', height: `${heightPct}%`, minHeight: 2 }}
            />
            <Typography sx={{ fontSize: '0.5625rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
              {day.slice(8, 10)}/{day.slice(5, 7)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
