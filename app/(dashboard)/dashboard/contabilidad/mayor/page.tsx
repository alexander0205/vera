import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fechaValidaISO } from '@/lib/utils/format';
import { cuentasConMovimientos } from '@/lib/contabilidad/libro-diario';
import { mayorGeneral } from '@/lib/contabilidad/reportes';
import { FiltrosPeriodo } from '../_filtros-periodo';
import { SelectorCuenta } from './_selector-cuenta';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

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
  const saldoCls = (v: number) => (v < 0 ? 'text-red-700' : 'text-gray-900');

  return (
    <section className="p-4 lg:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Mayor general</h1>
        <p className="text-sm text-gray-500">
          Todo lo que pasó por una cuenta, en orden, con el saldo que iba
          quedando. Elige la cuenta y, si quieres, el periodo.
        </p>
      </header>

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
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Todavía no hay ninguna cuenta con movimientos.{' '}
          <Link href="/dashboard/contabilidad/libro-diario" className="font-medium underline">
            Genera los asientos en el libro diario
          </Link>{' '}
          y vuelve.
        </div>
      )}

      {cuentas.length > 0 && !mayor && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {/* Si pidieron una cuenta que no existe o es de otro team, se dice sin
              revelar cuál de las dos cosas fue. */}
          {cuentaId
            ? 'Esa cuenta no existe en este equipo.'
            : 'Elige una cuenta arriba para ver su mayor.'}
        </div>
      )}

      {mayor && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium text-gray-900">
                <span className="font-mono text-gray-500">{mayor.cuenta.codigo}</span>{' '}
                {mayor.cuenta.nombre}
              </h2>
              <span className="text-xs text-gray-500">
                {mayor.cuenta.tipo} · naturaleza {mayor.cuenta.naturaleza}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-500">Saldo inicial</dt>
                <dd className={`text-sm font-medium tabular-nums ${saldoCls(mayor.saldoInicialCents)}`}>
                  {fmtDOP(mayor.saldoInicialCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Débitos</dt>
                <dd className="text-sm font-medium tabular-nums text-gray-900">
                  {fmtDOP(mayor.debeCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Créditos</dt>
                <dd className="text-sm font-medium tabular-nums text-gray-900">
                  {fmtDOP(mayor.haberCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Saldo final</dt>
                <dd className={`text-sm font-semibold tabular-nums ${saldoCls(mayor.saldoFinalCents)}`}>
                  {fmtDOP(mayor.saldoFinalCents)}
                </dd>
              </div>
            </dl>

            {!desde && (
              <p className="mt-3 text-xs text-gray-500">
                Sin fecha de inicio, el saldo inicial es cero: todo el histórico
                está en la lista de abajo.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Concepto</th>
                  <th className="px-4 py-3 font-medium text-right">Debe</th>
                  <th className="px-4 py-3 font-medium text-right">Haber</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* El saldo con el que arranca la página va como primera fila y
                    no como dato suelto: así la columna de saldo se lee de
                    arriba abajo sin saltos. En la página 1 es el saldo inicial
                    del periodo; en las siguientes, el acumulado de lo anterior. */}
                {(desde || paginaReal > 1) && (
                  <tr className="bg-gray-50/60 text-gray-500">
                    <td className="px-4 py-2 text-xs" colSpan={4}>
                      {paginaReal > 1
                        ? 'Saldo acumulado de las páginas anteriores'
                        : `Saldo anterior al ${fechaCorta(desde!)}`}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${saldoCls(mayor.saldoPrevioPaginaCents)}`}>
                      {fmtDOP(mayor.saldoPrevioPaginaCents)}
                    </td>
                  </tr>
                )}

                {mayor.movimientos.map((m, i) => (
                  <tr key={`${m.asientoId}-${i}`} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                      {fechaCorta(m.fecha)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {m.concepto}
                      {m.descripcion && (
                        <span className="block text-xs text-gray-500">{m.descripcion}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {m.debeCents > 0 ? fmtDOP(m.debeCents) : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {m.haberCents > 0 ? fmtDOP(m.haberCents) : ''}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums font-medium ${saldoCls(m.saldoCents)}`}>
                      {fmtDOP(m.saldoCents)}
                    </td>
                  </tr>
                ))}

                {mayor.movimientos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                      Esta cuenta no tuvo movimientos
                      {desde || hasta ? ' en el periodo elegido' : ''}.
                    </td>
                  </tr>
                )}

                {mayor.movimientos.length > 0 && (
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-gray-600">Totales del periodo</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                      {fmtDOP(mayor.debeCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                      {fmtDOP(mayor.haberCents)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${saldoCls(mayor.saldoFinalCents)}`}>
                      {fmtDOP(mayor.saldoFinalCents)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {paginas > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Página {paginaReal} de {paginas} · mostrando{' '}
                {(paginaReal - 1) * PAGE_SIZE + 1}–
                {Math.min(paginaReal * PAGE_SIZE, mayor.total)} de {mayor.total}{' '}
                movimientos
              </p>
              <div className="flex gap-2">
                {paginaReal > 1 ? (
                  <Link
                    href={urlPagina(paginaReal - 1)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Anterior
                  </Link>
                ) : (
                  <span className="rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-300">
                    Anterior
                  </span>
                )}
                {paginaReal < paginas ? (
                  <Link
                    href={urlPagina(paginaReal + 1)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span className="rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-300">
                    Siguiente
                  </span>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            El saldo sigue la naturaleza de la cuenta: en una cuenta{' '}
            {mayor.cuenta.naturaleza === 'deudora' ? 'deudora' : 'acreedora'} como
            esta, {mayor.cuenta.naturaleza === 'deudora'
              ? 'los débitos suman y los créditos restan'
              : 'los créditos suman y los débitos restan'}. Un saldo en rojo
            significa que quedó del lado contrario al que le corresponde.
          </p>
        </>
      )}
    </section>
  );
}
