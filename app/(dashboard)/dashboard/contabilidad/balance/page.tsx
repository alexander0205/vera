import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fechaValidaISO } from '@/lib/utils/format';
import { balanceComprobacion } from '@/lib/contabilidad/reportes';
import { FiltrosPeriodo } from '../_filtros-periodo';

export const dynamic = 'force-dynamic';

/**
 * Balance de comprobación — subpaso 3 del Paso 6.
 *
 * Todas las cuentas con movimientos, sus sumas y sus saldos, más la validación
 * de cuadre que pide el plan. Es el reporte con el que un contador comprueba de
 * un vistazo que la contabilidad no se rompió.
 *
 * Sin ruta de API, por lo mismo que el mayor: el filtrado va por URL y lo
 * resuelve el servidor.
 */
export default async function BalancePage({
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

  const balance = await balanceComprobacion(teamId, { desde, hasta });
  const anomalas = balance.filas.filter((f) => f.anomala);

  return (
    <section className="p-4 lg:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Balance de comprobación
        </h1>
        <p className="text-sm text-gray-500">
          Todas las cuentas con movimientos, con lo que entró y lo que salió por
          cada una. Si la contabilidad está bien, las dos columnas de abajo dan
          exactamente lo mismo.
        </p>
      </header>

      <FiltrosPeriodo ruta="/dashboard/contabilidad/balance" periodo={{ desde, hasta }} />

      {/* El cuadre es el punto del reporte, así que se dice arriba y en grande,
          no como una nota al pie que nadie lee. */}
      {balance.filas.length > 0 && (
        balance.cuadra ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <strong>El balance cuadra.</strong> Débitos y créditos suman lo
              mismo: {fmtDOP(balance.totales.debeCents)}.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              El balance NO cuadra
            </div>
            <p className="mt-1 text-xs">
              Débitos {fmtDOP(balance.totales.debeCents)} contra créditos{' '}
              {fmtDOP(balance.totales.haberCents)} · diferencia{' '}
              {fmtDOP(Math.abs(balance.totales.debeCents - balance.totales.haberCents))}.
              Esto no debería poder pasar: la aplicación impide guardar asientos
              descuadrados. Repórtalo antes de usar estos números para declarar.
            </p>
          </div>
        )
      )}

      {anomalas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">
            {anomalas.length} cuenta(s) con saldo del lado contrario al esperado
          </div>
          <p className="mt-1 text-xs">
            No es necesariamente un error —una cuenta de banco puede quedar en
            descubierto— pero conviene mirarlas:{' '}
            {anomalas.map((f) => `${f.codigo} ${f.nombre}`).join(', ')}.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 font-medium text-right">Debe</th>
              <th className="px-4 py-3 font-medium text-right">Haber</th>
              <th className="px-4 py-3 font-medium text-right">Saldo deudor</th>
              <th className="px-4 py-3 font-medium text-right">Saldo acreedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {balance.filas.map((f) => (
              <tr key={f.cuentaId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/dashboard/contabilidad/mayor?cuentaId=${f.cuentaId}${
                      desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`}
                    className="text-gray-900 hover:underline"
                  >
                    <span className="font-mono text-gray-500">{f.codigo}</span>{' '}
                    {f.nombre}
                  </Link>
                  {f.anomala && (
                    <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      saldo invertido
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {f.debeCents > 0 ? fmtDOP(f.debeCents) : ''}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {f.haberCents > 0 ? fmtDOP(f.haberCents) : ''}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {f.saldoDeudorCents > 0 ? fmtDOP(f.saldoDeudorCents) : ''}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {f.saldoAcreedorCents > 0 ? fmtDOP(f.saldoAcreedorCents) : ''}
                </td>
              </tr>
            ))}

            {balance.filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  {desde || hasta ? (
                    'Ninguna cuenta tuvo movimientos en el periodo elegido.'
                  ) : (
                    <>
                      Todavía no hay movimientos que balancear.{' '}
                      <Link
                        href="/dashboard/contabilidad/libro-diario"
                        className="font-medium underline"
                      >
                        Genera los asientos en el libro diario
                      </Link>{' '}
                      y vuelve.
                    </>
                  )}
                </td>
              </tr>
            )}

            {balance.filas.length > 0 && (
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-700">Totales</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {fmtDOP(balance.totales.debeCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {fmtDOP(balance.totales.haberCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {fmtDOP(balance.totales.saldoDeudorCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {fmtDOP(balance.totales.saldoAcreedorCents)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Solo aparecen las cuentas que tuvieron movimientos. Las columnas de saldo
        son la resta de las dos anteriores: cada cuenta cae en una sola de ellas.
        Pulsa una cuenta para ver su mayor.
      </p>
    </section>
  );
}
