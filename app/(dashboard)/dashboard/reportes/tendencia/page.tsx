import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { parseRango, type Granularidad } from '@/lib/reportes/shared';
import { getTendencia } from '@/lib/reportes/queries';
import { ReportShell, Panel } from '@/components/reportes/report-shell';
import { TrendChart } from '@/components/reportes/charts';

const GRANS: [Granularidad, string][] = [['dia', 'Diario'], ['semana', 'Semanal'], ['mes', 'Mensual']];

const headCellSx = {
  px: 2, py: 1.5, fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', bgcolor: '#f9fafb',
  borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
} as const;
const bodyCellSx = {
  px: 2, py: 1.5, fontSize: '0.875rem', borderBottom: '1px solid #f3f4f6',
} as const;

export default async function TendenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; g?: string }>;
}) {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const { desde, hasta } = parseRango(sp.desde, sp.hasta);
  const g: Granularidad = sp.g === 'semana' || sp.g === 'mes' ? sp.g : 'dia';
  const d0 = desde.toISOString().slice(0, 10);
  const d1 = hasta.toISOString().slice(0, 10);

  const serie = await getTendencia(teamId, desde, hasta, g);
  const totalIngresos = serie.reduce((s, p) => s + p.ingresosCents, 0);
  const totalFacturas = serie.reduce((s, p) => s + p.numFacturas, 0);

  return (
    <ReportShell
      titulo="Tendencia de ingresos"
      descripcion="Evolución de las ventas en el tiempo. Cambia la granularidad y el rango."
      migaja="Tendencia"
      desde={d0}
      hasta={d1}
      exportHref={`/api/reportes/export?report=tendencia&desde=${d0}&hasta=${d1}&g=${g}`}
    >
      <Panel
        titulo={`Ingresos — ${fmtDOP(totalIngresos)} · ${totalFacturas} facturas`}
        right={
          <Box sx={{ display: 'flex', bgcolor: '#f3f4f6', borderRadius: '8px', p: 0.5 }}>
            {GRANS.map(([v, label]) => (
              <Link
                key={v}
                href={`?desde=${d0}&hasta=${d1}&g=${v}`}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  borderRadius: '6px',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                  ...(g === v
                    ? { backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', color: '#111827' }
                    : { color: '#6b7280' }),
                }}
              >
                {label}
              </Link>
            ))}
          </Box>
        }
      >
        <TrendChart data={serie} />
      </Panel>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Detalle por período ({serie.length})
          </Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="left" sx={headCellSx}>Período</TableCell>
                <TableCell align="right" sx={headCellSx}>Facturas</TableCell>
                <TableCell align="right" sx={headCellSx}>ITBIS</TableCell>
                <TableCell align="right" sx={headCellSx}>Ingresos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {serie.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ ...bodyCellSx, py: 4, color: '#9ca3af', borderBottom: 0 }}>
                    Sin datos en este rango.
                  </TableCell>
                </TableRow>
              ) : serie.map(p => (
                <TableRow key={p.periodo} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                  <TableCell sx={{ ...bodyCellSx, color: '#374151' }}>{fmtFechaCorta(p.periodo)}</TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{p.numFacturas}</TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(p.itbisCents)}</TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(p.ingresosCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </ReportShell>
  );
}
