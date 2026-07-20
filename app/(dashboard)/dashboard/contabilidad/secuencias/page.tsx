import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, AlertTriangle, ExternalLink, Search } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getRangosSecuencias, getLibroComprobantes } from '@/lib/contabilidad/secuencias';
import { TIPO_ECF_NOMBRE } from '@/lib/reportes/shared';
import { LibroFiltros } from './_filtros';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

/** Etiqueta y colores en lenguaje de contabilidad (no el estado técnico). */
const ESTADO_UI: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  ACEPTADO:             { label: 'Válido',             bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  ACEPTADO_CONDICIONAL: { label: 'Válido (observado)', bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  EN_PROCESO:           { label: 'Esperando DGII',     bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  RECHAZADO:            { label: 'Rechazado',          bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  ANULADO:              { label: 'Anulado',            bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb' },
  BORRADOR:             { label: 'Apartado',           bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
};
const ESTADO_FALLBACK = { bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb' };

function dop(cents: number) {
  return (cents / 100).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
}
function fecha(d: Date) {
  return new Date(d).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function SecuenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const filtros = {
    tipoEcf: sp.tipo || undefined,
    estado: sp.estado || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    q: sp.q || undefined,
    soloErrores: sp.errores === '1',
  };

  const [rangos, { filas, total }] = await Promise.all([
    getRangosSecuencias(teamId),
    getLibroComprobantes(teamId, filtros, page, PAGE_SIZE),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const alertas = rangos.filter(r => r.vencida || r.porAgotarse);

  function pageHref(p: number) {
    const q = new URLSearchParams();
    Object.entries(sp).forEach(([k, v]) => { if (v && k !== 'page') q.set(k, v); });
    q.set('page', String(p));
    return `?${q.toString()}`;
  }

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Secuencias</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' }, gap: 1.5, mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            Secuencias de comprobantes
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            Todos los e-NCF emitidos y la factura a la que está atado cada uno.
          </Typography>
        </Box>
        <Button
          component={Link}
          href="/dashboard/contabilidad/consulta-ncf"
          nativeButton={false}
          variant="contained"
          startIcon={<Search style={{ width: 16, height: 16 }} />}
          sx={{ px: 2, py: 1, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Consultar e-NCF
        </Button>
      </Box>

      {/* Alertas de rango */}
      {alertas.length > 0 && (
        <Alert
          severity="warning"
          icon={<AlertTriangle style={{ width: 16, height: 16 }} />}
          sx={{ mb: 2.5 }}
        >
          <AlertTitle sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Secuencias que requieren atención</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {alertas.map(r => (
              <Box component="li" key={r.id} sx={{ fontSize: '0.875rem' }}>
                <strong>e{r.tipoEcf}</strong> — {r.vencida
                  ? `rango vencido el ${r.fechaVencimiento ? fecha(r.fechaVencimiento) : '—'}`
                  : `quedan solo ${r.disponibles.toLocaleString('es-DO')} números disponibles`}
              </Box>
            ))}
          </Box>
        </Alert>
      )}

      {/* Rangos configurados */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
        {rangos.map(r => (
          <Box key={r.id} sx={{ ...CARD, p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>e{r.tipoEcf}</Typography>
              <Typography component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{r.pctUsado}% usado</Typography>
            </Box>
            <Typography noWrap sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 1 }}>
              {TIPO_ECF_NOMBRE[r.tipoEcf] ?? r.nombre ?? '—'}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, r.pctUsado)}
              color={r.porAgotarse ? 'warning' : 'primary'}
              sx={{ height: 6, borderRadius: 4, mb: 1, bgcolor: '#f3f4f6' }}
            />
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
              Próximo:{' '}
              <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 500, color: '#374151' }}>
                {r.actual.toLocaleString('es-DO')}
              </Box>
              {' · '}quedan {r.disponibles.toLocaleString('es-DO')}
            </Typography>
          </Box>
        ))}
        {rangos.length === 0 && (
          <Typography sx={{ ...CARD, gridColumn: '1 / -1', fontSize: '0.875rem', color: '#9ca3af', p: 3, textAlign: 'center' }}>
            No hay secuencias configuradas.
          </Typography>
        )}
      </Box>

      {/* Filtros */}
      <LibroFiltros
        tipos={rangos.map(r => r.tipoEcf)}
        valores={{
          tipo: sp.tipo ?? '', estado: sp.estado ?? '', q: sp.q ?? '',
          desde: sp.desde ?? '', hasta: sp.hasta ?? '', errores: sp.errores ?? '',
        }}
      />

      {/* Libro */}
      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Comprobantes ({total.toLocaleString('es-DO')})
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Página {page} de {totalPages}</Typography>
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1000 }}>
            <TableHead>
              <TableRow>
                <TableCell>e-NCF</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell align="right">ITBIS</TableCell>
                <TableCell>Emitido por</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                    No hay comprobantes con esos filtros.
                  </TableCell>
                </TableRow>
              ) : filas.map(f => {
                const e = ESTADO_UI[f.estado];
                const tono = e ?? ESTADO_FALLBACK;
                return (
                  <TableRow key={f.id}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#111827', whiteSpace: 'nowrap' }}>{f.encf}</TableCell>
                    <TableCell sx={{ color: '#6b7280', whiteSpace: 'nowrap' }}>e{f.tipoEcf}</TableCell>
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block', fontSize: '0.75rem', fontWeight: 500,
                          px: 1, py: 0.25, borderRadius: '9999px', whiteSpace: 'nowrap',
                          bgcolor: tono.bg, color: tono.fg, border: `1px solid ${tono.border}`,
                        }}
                      >
                        {e?.label ?? f.estado}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{fecha(f.fechaEmision)}</TableCell>
                    <TableCell>
                      {f.cliente ?? <Box component="span" sx={{ color: '#d1d5db' }}>Consumidor final</Box>}
                      {f.rncComprador && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>{f.rncComprador}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#111827', fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{dop(f.montoTotal)}</TableCell>
                    <TableCell align="right" sx={{ color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{dop(f.totalItbis)}</TableCell>
                    <TableCell sx={{ color: '#6b7280', fontSize: '0.75rem' }}>{f.emitidoPor ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-end' }}>
                        <Link href={`/dashboard/facturas/${f.id}`} style={{ textDecoration: 'none' }}>
                          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#0d9488', '&:hover': { textDecoration: 'underline' } }}>
                            Factura
                          </Typography>
                        </Link>
                        {f.urlVerificacion && (
                          <Box
                            component="a" href={f.urlVerificacion} target="_blank" rel="noopener noreferrer"
                            title="Verificar en el portal de la DGII"
                            sx={{ display: 'inline-flex', color: '#9ca3af', '&:hover': { color: '#0d9488' } }}
                          >
                            <ExternalLink style={{ width: 14, height: 14 }} />
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>

        {/* Paginación */}
        {totalPages > 1 && (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Mostrando {((page - 1) * PAGE_SIZE + 1).toLocaleString('es-DO')}–
              {Math.min(page * PAGE_SIZE, total).toLocaleString('es-DO')} de {total.toLocaleString('es-DO')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                component={Link} href={pageHref(page - 1)} nativeButton={false}
                variant="outlined" color="inherit" size="small"
                aria-disabled={page <= 1}
                sx={{ color: '#374151', borderColor: '#d1d5db', ...(page <= 1 && { pointerEvents: 'none', opacity: 0.4 }) }}
              >
                Anterior
              </Button>
              <Button
                component={Link} href={pageHref(page + 1)} nativeButton={false}
                variant="outlined" color="inherit" size="small"
                aria-disabled={page >= totalPages}
                sx={{ color: '#374151', borderColor: '#d1d5db', ...(page >= totalPages && { pointerEvents: 'none', opacity: 0.4 }) }}
              >
                Siguiente
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
