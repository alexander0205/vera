import { redirect } from 'next/navigation';
import { ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fechaValidaISO } from '@/lib/utils/format';
import { balanceGeneral, type SeccionBalanceGeneral } from '@/lib/contabilidad/balance-general';
import { FiltrosPeriodo } from '../_filtros-periodo';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

export const dynamic = 'force-dynamic';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

/**
 * Balance general / estado de situación.
 *
 * La foto a una fecha: activo = pasivo + patrimonio. La utilidad del periodo
 * entra como línea de patrimonio (ver `lib/contabilidad/balance-general.ts`).
 * Sin ruta de API: el periodo va por URL, lo resuelve el servidor.
 */
export default async function BalanceGeneralPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const desde = fechaValidaISO(sp.desde);
  const hasta = fechaValidaISO(sp.hasta);

  const bg = await balanceGeneral(teamId, { desde, hasta });

  const celdaMonto = {
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#111827',
  } as const;

  const qs = new URLSearchParams();
  if (desde) qs.set('desde', desde);
  if (hasta) qs.set('hasta', hasta);
  const exportHref = `/api/contabilidad/balance-general/export${qs.toString() ? `?${qs}` : ''}`;

  /** Una sección (Activo, o Pasivo, o Patrimonio) con su encabezado y total. */
  const Seccion = ({ titulo, seccion, totalLabel }: {
    titulo: string; seccion: SeccionBalanceGeneral; totalLabel: string;
  }) => (
    <>
      <TableRow sx={{ bgcolor: '#f9fafb' }}>
        <TableCell colSpan={2} sx={{ fontWeight: 700, color: '#111827', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
          {titulo}
        </TableCell>
      </TableRow>
      {seccion.lineas.map((l, i) => (
        <TableRow key={l.cuentaId ?? `sintetica-${i}`} hover>
          <TableCell sx={{ pl: 4 }}>
            {l.cuentaId !== null ? (
              <Box component="a"
                href={`/dashboard/contabilidad/mayor?cuentaId=${l.cuentaId}${desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`}
                sx={{ color: '#111827', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                <Box component="span" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{l.codigo}</Box>{' '}
                {l.nombre}
              </Box>
            ) : (
              <Box component="span" sx={{ fontStyle: 'italic', color: '#4b5563' }}>{l.nombre}</Box>
            )}
          </TableCell>
          <TableCell align="right" sx={celdaMonto}>{fmtDOP(l.montoCents)}</TableCell>
        </TableRow>
      ))}
      <TableRow sx={{ borderTop: '1px solid #e5e7eb' }}>
        <TableCell sx={{ fontWeight: 600, color: '#374151' }}>{totalLabel}</TableCell>
        <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 600 }}>{fmtDOP(seccion.totalCents)}</TableCell>
      </TableRow>
    </>
  );

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>Balance general</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            Balance general
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            La foto del negocio a una fecha: lo que tiene, lo que debe y lo que
            vale. El activo siempre iguala al pasivo más el patrimonio.
          </Typography>
        </Box>
        {bg.hayDatos && (
          <Box component="a" href={exportHref}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.8125rem', fontWeight: 500,
              px: 1.75, py: 1, borderRadius: '8px', textDecoration: 'none',
              color: '#2a45c4', bgcolor: '#eef2fe', border: '1px solid #c7d2fc',
              '&:hover': { bgcolor: '#e0e7fd' } }}
          >
            Exportar a Excel
          </Box>
        )}
      </Box>

      <FiltrosPeriodo ruta="/dashboard/contabilidad/balance-general" periodo={{ desde, hasta }} />

      {bg.hayDatos && (
        bg.cuadra ? (
          <Alert severity="success" icon={<CheckCircle2 style={{ width: 16, height: 16 }} />}>
            <strong>El balance cuadra.</strong> El activo iguala al pasivo más el
            patrimonio: {fmtDOP(bg.totalActivoCents)}.
          </Alert>
        ) : (
          <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
            <strong>El balance NO cuadra.</strong> Activo {fmtDOP(bg.totalActivoCents)}{' '}
            contra pasivo + patrimonio {fmtDOP(bg.totalPasivoPatrimonioCents)}. No
            debería poder pasar; repórtalo antes de usar estos números.
          </Alert>
        )
      )}

      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableBody>
              {bg.hayDatos ? (
                <>
                  <Seccion titulo="Activo" seccion={bg.activo} totalLabel="Total activo" />
                  <TableRow><TableCell colSpan={2} sx={{ py: 0.5, border: 0 }} /></TableRow>
                  <Seccion titulo="Pasivo" seccion={bg.pasivo} totalLabel="Total pasivo" />
                  <TableRow><TableCell colSpan={2} sx={{ py: 0.5, border: 0 }} /></TableRow>
                  <Seccion titulo="Patrimonio" seccion={bg.patrimonio} totalLabel="Total patrimonio" />

                  <TableRow sx={{ borderTop: '2px solid #d1d5db', bgcolor: '#f9fafb' }}>
                    <TableCell sx={{ fontWeight: 700, color: '#111827' }}>Total pasivo + patrimonio</TableCell>
                    <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 700 }}>
                      {fmtDOP(bg.totalPasivoPatrimonioCents)}
                    </TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={2} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                    {desde || hasta
                      ? 'No hubo movimientos hasta la fecha elegida.'
                      : (
                        <>
                          Todavía no hay movimientos.{' '}
                          <Box component="a" href="/dashboard/contabilidad/libro-diario" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
                            Genera los asientos
                          </Box>{' '}
                          y vuelve.
                        </>
                      )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
        El "Resultado del ejercicio" dentro de patrimonio es la ganancia o pérdida
        acumulada del periodo (la misma cifra del estado de resultados). Es lo que
        hace que el activo cuadre con el pasivo más el patrimonio mientras no se
        haga el cierre anual.
      </Typography>
    </Box>
  );
}
