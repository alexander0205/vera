import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, AlertTriangle, ExternalLink, Search } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getRangosSecuencias, getLibroComprobantes } from '@/lib/contabilidad/secuencias';
import { TIPO_ECF_NOMBRE } from '@/lib/reportes/shared';
import { LibroFiltros } from './_filtros';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const ESTADO_CLS: Record<string, string> = {
  ACEPTADO:             'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACEPTADO_CONDICIONAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EN_PROCESO:           'bg-blue-50 text-blue-700 border-blue-200',
  RECHAZADO:            'bg-red-50 text-red-700 border-red-200',
  ANULADO:              'bg-gray-100 text-gray-600 border-gray-200',
  BORRADOR:             'bg-amber-50 text-amber-700 border-amber-200',
};

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
    <section className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
        <span>Contabilidad</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-teal-600 font-medium">Secuencias</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Secuencias de comprobantes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Todos los e-NCF emitidos y la factura a la que está atado cada uno.
          </p>
        </div>
        <Link href="/dashboard/contabilidad/consulta-ncf"
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium shrink-0">
          <Search className="h-4 w-4" /> Consultar e-NCF
        </Link>
      </div>

      {/* Alertas de rango */}
      {alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">Secuencias que requieren atención</h2>
          </div>
          <ul className="space-y-1 text-sm text-amber-900">
            {alertas.map(r => (
              <li key={r.id}>
                <strong>e{r.tipoEcf}</strong> — {r.vencida
                  ? `rango vencido el ${r.fechaVencimiento ? fecha(r.fechaVencimiento) : '—'}`
                  : `quedan solo ${r.disponibles.toLocaleString('es-DO')} números disponibles`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rangos configurados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {rangos.map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-bold text-gray-900">e{r.tipoEcf}</span>
              <span className="text-xs text-gray-400">{r.pctUsado}% usado</span>
            </div>
            <p className="text-xs text-gray-500 truncate mb-2">{TIPO_ECF_NOMBRE[r.tipoEcf] ?? r.nombre ?? '—'}</p>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div className={`h-full rounded-full ${r.porAgotarse ? 'bg-amber-500' : 'bg-teal-500'}`}
                   style={{ width: `${r.pctUsado}%` }} />
            </div>
            <p className="text-xs text-gray-500 tabular-nums">
              Próximo: <span className="font-mono font-medium text-gray-700">{r.actual.toLocaleString('es-DO')}</span>
              {' · '}quedan {r.disponibles.toLocaleString('es-DO')}
            </p>
          </div>
        ))}
        {rangos.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 bg-white border border-gray-200 rounded-xl p-6 text-center">
            No hay secuencias configuradas.
          </p>
        )}
      </div>

      {/* Filtros */}
      <LibroFiltros
        tipos={rangos.map(r => r.tipoEcf)}
        valores={{
          tipo: sp.tipo ?? '', estado: sp.estado ?? '', q: sp.q ?? '',
          desde: sp.desde ?? '', hasta: sp.hasta ?? '', errores: sp.errores ?? '',
        }}
      />

      {/* Libro */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Comprobantes ({total.toLocaleString('es-DO')})
          </h2>
          <span className="text-xs text-gray-400">Página {page} de {totalPages}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">e-NCF</th>
                <th className="px-4 py-2.5 text-left">Tipo</th>
                <th className="px-4 py-2.5 text-left">Estado</th>
                <th className="px-4 py-2.5 text-left">Fecha</th>
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-right">Monto</th>
                <th className="px-4 py-2.5 text-right">ITBIS</th>
                <th className="px-4 py-2.5 text-left">Emitido por</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  No hay comprobantes con esos filtros.
                </td></tr>
              ) : filas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">{f.encf}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">e{f.tipoEcf}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${ESTADO_CLS[f.estado] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {f.estado === 'BORRADOR' ? 'Reservado' : f.estado.replace('_', ' ').toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(f.fechaEmision)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {f.cliente ?? <span className="text-gray-300">Consumidor final</span>}
                    {f.rncComprador && <span className="block text-xs text-gray-400 font-mono">{f.rncComprador}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900 font-medium whitespace-nowrap">{dop(f.montoTotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500 whitespace-nowrap">{dop(f.totalItbis)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{f.emitidoPor ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3 justify-end">
                      <Link href={`/dashboard/facturas/${f.id}`} className="text-xs text-teal-600 hover:underline font-medium">
                        Factura
                      </Link>
                      {f.urlVerificacion && (
                        <a href={f.urlVerificacion} target="_blank" rel="noopener noreferrer"
                          title="Verificar en el portal de la DGII"
                          className="text-gray-400 hover:text-teal-600">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Mostrando {((page - 1) * PAGE_SIZE + 1).toLocaleString('es-DO')}–
              {Math.min(page * PAGE_SIZE, total).toLocaleString('es-DO')} de {total.toLocaleString('es-DO')}
            </span>
            <div className="flex gap-2">
              <Link href={pageHref(page - 1)} aria-disabled={page <= 1}
                className={`px-3 py-1.5 text-sm rounded-lg border ${page <= 1 ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                Anterior
              </Link>
              <Link href={pageHref(page + 1)} aria-disabled={page >= totalPages}
                className={`px-3 py-1.5 text-sm rounded-lg border ${page >= totalPages ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                Siguiente
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
