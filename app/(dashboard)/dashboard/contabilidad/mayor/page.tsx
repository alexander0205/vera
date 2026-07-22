import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fechaValidaISO } from '@/lib/utils/format';
import { cuentasConMovimientos } from '@/lib/contabilidad/libro-diario';
import { mayorGeneral } from '@/lib/contabilidad/reportes';
import { FiltrosPeriodo } from '../_filtros-periodo';
import { SelectorCuenta } from './_selector-cuenta';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

/** 'YYYY-MM-DD' → '24 jun 2026', sin pasar por Date (que restaría un día en RD). */
function fechaCorta(f: string) {
  const [a, m, d] = f.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${meses[Number(m) - 1]} ${a}`;
}

/**
 * Mayor general — subpaso 2 del Paso 6.
 *
 * Los movimientos de una cuenta con su saldo corriente. Es la vista que usa un
 * contador para explicar por qué una cuenta terminó donde terminó: el libro
 * diario cuenta la historia por asiento, el mayor la cuenta por cuenta.
 *
 * No tiene ruta de API propia a propósito. Todo el filtrado va por la URL y lo
 * resuelve el servidor, así que una API sin llamador sería una pieza huérfana
 * de las que ya aparecieron tres veces en este módulo.
 */
export default async function MayorGeneralPage({
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
  const cuentaNum = Number(sp.cuentaId);
  const cuentaId = Number.isInteger(cuentaNum) && cuentaNum > 0 ? cuentaNum : undefined;
  const paginaNum = Number(sp.pagina);
  const pagina = Number.isInteger(paginaNum) && paginaNum > 0 ? paginaNum : 1;

  const [cuentas, primera] = await Promise.all([
    cuentasConMovimientos(teamId),
    cuentaId
      ? mayorGeneral(teamId, cuentaId, {
          desde, hasta, limit: PAGE_SIZE, offset: (pagina - 1) * PAGE_SIZE,
        })
      : Promise.resolve(null),
  ]);

  // Una página fuera de rango cae a la última real, igual que en el libro
  // diario: "?pagina=999" no debe mostrar "sin movimientos" sobre una cuenta
  // que sí los tiene. La consulta extra solo ocurre en ese caso anómalo.
  const paginas = primera ? Math.max(1, Math.ceil(primera.total / PAGE_SIZE)) : 1;
  const paginaReal = Math.min(pagina, paginas);
  const mayor = primera && paginaReal !== pagina
    ? await mayorGeneral(teamId, cuentaId!, {
        desde, hasta, limit: PAGE_SIZE, offset: (paginaReal - 1) * PAGE_SIZE,
      })
    : primera;

  /** URL del mayor conservando cuenta y periodo, cambiando solo la página. */
  const urlPagina = (p: number) => {
    const qs = new URLSearchParams();
    if (cuentaId) qs.set('cuentaId', String(cuentaId));
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);
    if (p > 1) qs.set('pagina', String(p));
    const s = qs.toString();
    return `/dashboard/contabilidad/mayor${s ? `?${s}` : ''}`;
  };

  // Signo del saldo según la naturaleza: un saldo negativo significa que la
  // cuenta está del lado contrario al que le toca, y conviene que se vea rojo.
  const saldoColor = (v: number) => (v < 0 ? '#b91c1c' : '#111827');

  const celdaMonto = {
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
  } as const;

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Mayor general</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Mayor general
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Todo lo que pasó por una cuenta, en orden, con el saldo que iba
          quedando. Elige la cuenta y, si quieres, el periodo.
        </Typography>
      </Box>

      <FiltrosPeriodo
        ruta="/dashboard/contabilidad/mayor"
        periodo={{ desde, hasta }}
        paramsExtra={{ cuentaId }}
        extra={
          <SelectorCuenta
            cuentas={cuentas} cuentaId={cuentaId} desde={desde} hasta={hasta}
          />
        }
      />

      {cuentas.length === 0 && (
        <Typography sx={{ ...CARD, px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          Todavía no hay ninguna cuenta con movimientos.{' '}
          <Box component={Link} href="/dashboard/contabilidad/libro-diario" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
            Genera los asientos en el libro diario
          </Box>{' '}
          y vuelve.
        </Typography>
      )}

      {cuentas.length > 0 && !mayor && (
        <Typography sx={{ ...CARD, px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          {/* Si pidieron una cuenta que no existe o es de otro team, se dice sin
              revelar cuál de las dos cosas fue. */}
          {cuentaId
            ? 'Esa cuenta no existe en este equipo.'
            : 'Elige una cuenta arriba para ver su mayor.'}
        </Typography>
      )}

      {mayor && (
        <>
          <Box sx={{ ...CARD, p: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
              <Typography component="h2" sx={{ fontWeight: 600, color: '#111827' }}>
                <Box component="span" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{mayor.cuenta.codigo}</Box>{' '}
                {mayor.cuenta.nombre}
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {mayor.cuenta.tipo} · naturaleza {mayor.cuenta.naturaleza}
              </Typography>
            </Box>

            <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Saldo inicial</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: saldoColor(mayor.saldoInicialCents) }}>
                  {fmtDOP(mayor.saldoInicialCents)}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Débitos</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#111827' }}>
                  {fmtDOP(mayor.debeCents)}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Créditos</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#111827' }}>
                  {fmtDOP(mayor.haberCents)}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Saldo final</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: saldoColor(mayor.saldoFinalCents) }}>
                  {fmtDOP(mayor.saldoFinalCents)}
                </Typography>
              </Box>
            </Box>

            {!desde && (
              <Typography sx={{ mt: 1.5, fontSize: '0.75rem', color: '#6b7280' }}>
                Sin fecha de inicio, el saldo inicial es cero: todo el histórico
                está en la lista de abajo.
              </Typography>
            )}
          </Box>

          <Box sx={{ ...CARD, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Concepto</TableCell>
                    <TableCell align="right">Debe</TableCell>
                    <TableCell align="right">Haber</TableCell>
                    <TableCell align="right">Saldo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* El saldo con el que arranca la página va como primera fila y
                      no como dato suelto: así la columna de saldo se lee de
                      arriba abajo sin saltos. En la página 1 es el saldo inicial
                      del periodo; en las siguientes, el acumulado de lo anterior. */}
                  {(desde || paginaReal > 1) && (
                    <TableRow sx={{ bgcolor: '#f9fafb' }}>
                      <TableCell colSpan={4} sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {paginaReal > 1
                          ? 'Saldo acumulado de las páginas anteriores'
                          : `Saldo anterior al ${fechaCorta(desde!)}`}
                      </TableCell>
                      <TableCell align="right" sx={{ ...celdaMonto, color: saldoColor(mayor.saldoPrevioPaginaCents) }}>
                        {fmtDOP(mayor.saldoPrevioPaginaCents)}
                      </TableCell>
                    </TableRow>
                  )}

                  {mayor.movimientos.map((m, i) => (
                    <TableRow key={`${m.asientoId}-${i}`} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: '#6b7280' }}>
                        {fechaCorta(m.fecha)}
                      </TableCell>
                      <TableCell sx={{ color: '#111827' }}>
                        {m.concepto}
                        {m.descripcion && (
                          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{m.descripcion}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ ...celdaMonto, color: '#111827' }}>
                        {m.debeCents > 0 ? fmtDOP(m.debeCents) : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ ...celdaMonto, color: '#111827' }}>
                        {m.haberCents > 0 ? fmtDOP(m.haberCents) : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 500, color: saldoColor(m.saldoCents) }}>
                        {fmtDOP(m.saldoCents)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {mayor.movimientos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                        Esta cuenta no tuvo movimientos
                        {desde || hasta ? ' en el periodo elegido' : ''}.
                      </TableCell>
                    </TableRow>
                  )}

                  {mayor.movimientos.length > 0 && (
                    <TableRow sx={{ borderTop: '2px solid #d1d5db', bgcolor: '#f9fafb', '& td': { fontWeight: 500 } }}>
                      <TableCell />
                      <TableCell sx={{ color: '#4b5563' }}>Totales del periodo</TableCell>
                      <TableCell align="right" sx={celdaMonto}>{fmtDOP(mayor.debeCents)}</TableCell>
                      <TableCell align="right" sx={celdaMonto}>{fmtDOP(mayor.haberCents)}</TableCell>
                      <TableCell align="right" sx={{ ...celdaMonto, color: saldoColor(mayor.saldoFinalCents) }}>
                        {fmtDOP(mayor.saldoFinalCents)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            {/* Paginación */}
            {paginas > 1 && (
              <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Página {paginaReal} de {paginas} · mostrando{' '}
                  {(paginaReal - 1) * PAGE_SIZE + 1}–
                  {Math.min(paginaReal * PAGE_SIZE, mayor.total)} de {mayor.total}{' '}
                  movimientos
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    component={Link} href={urlPagina(paginaReal - 1)} nativeButton={false}
                    variant="outlined" color="inherit" size="small"
                    aria-disabled={paginaReal <= 1}
                    sx={{ color: '#374151', borderColor: '#d1d5db', ...(paginaReal <= 1 && { pointerEvents: 'none', opacity: 0.4 }) }}
                  >
                    Anterior
                  </Button>
                  <Button
                    component={Link} href={urlPagina(paginaReal + 1)} nativeButton={false}
                    variant="outlined" color="inherit" size="small"
                    aria-disabled={paginaReal >= paginas}
                    sx={{ color: '#374151', borderColor: '#d1d5db', ...(paginaReal >= paginas && { pointerEvents: 'none', opacity: 0.4 }) }}
                  >
                    Siguiente
                  </Button>
                </Box>
              </Box>
            )}
          </Box>

          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            El saldo sigue la naturaleza de la cuenta: en una cuenta{' '}
            {mayor.cuenta.naturaleza === 'deudora' ? 'deudora' : 'acreedora'} como
            esta, {mayor.cuenta.naturaleza === 'deudora'
              ? 'los débitos suman y los créditos restan'
              : 'los créditos suman y los débitos restan'}. Un saldo en rojo
            significa que quedó del lado contrario al que le corresponde.
          </Typography>
        </>
      )}
    </Box>
  );
}
