'use client';

import useSWR from 'swr';
import { ArrowDownRight, ArrowUpRight, Briefcase, CalendarRange, Loader2, Receipt, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';
import { mesCorto, nombreDeMes } from '@/lib/administracion-escolar/serie-mensual';
import {
  armarGanancias, totalesPorTipo, type GastoMes, type IngresoMes,
} from '@/lib/administracion-escolar/panorama-gastos';
import type { GastosDelPeriodo } from '@/lib/administracion-escolar/panorama-gastos-datos';

/**
 * Las vistas Gastos y Ganancias del Panorama.
 *
 * El Panorama enseñaba solo lo que entra. Lizandro quiere ver lo que de verdad
 * queda: aquí va lo que sale —nómina, gastos y compras— y la resta. Mismo año
 * escolar y mismo selector de mes que la vista de ingresos; sin mes, el año.
 *
 * Los ingresos salen de la serie que la página ya tiene (lo que entró en caja
 * cada mes y lo que se esperaba cobrar), así que esto solo pide los gastos.
 */

export type VistaPanorama = 'ingresos' | 'gastos' | 'ganancias';

const COLOR = { nomina: '#2a45c4', gastos: '#f59e0b', compras: '#14b8a6' } as const;

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudieron leer los gastos del colegio');
  return r.json();
});

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const signo = (c: number) => (c < 0 ? 'text-red-700' : 'text-gray-900');

export function PanoramaGastos({ vista, periodoId, ingresos, mes, hoy }: {
  vista: Exclude<VistaPanorama, 'ingresos'>;
  periodoId: number;
  /** De la serie del Panorama: caja y lo esperado de cada mes. */
  ingresos: IngresoMes[];
  /** El mes elegido arriba, o null para el año. */
  mes: string | null;
  hoy: string;
}) {
  const { data, error, isLoading } = useSWR<{ datos: GastosDelPeriodo | null }>(
    `/api/administracion-escolar/dashboard/gastos?periodoId=${periodoId}`, traer, { keepPreviousData: true },
  );

  if (!data && isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-zero-600" /></div>;
  }
  if (error || !data?.datos) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        No se pudieron leer los gastos del colegio.
      </p>
    );
  }

  const { gastos, porCategoria, conNomina } = data.datos;
  const avisoNomina = !conNomina && (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Sin la nómina: tu usuario no ve empleados o el colegio no tiene el módulo de Nómina. Las cifras no la incluyen.
    </p>
  );

  return vista === 'gastos'
    ? <>{avisoNomina}<VistaGastos gastos={gastos} porCategoria={porCategoria} mes={mes} conNomina={conNomina} /></>
    : <>{avisoNomina}<VistaGanancias gastos={gastos} ingresos={ingresos} mes={mes} hoy={hoy} /></>;
}

/* ------------------------------------------------------------------ */

function VistaGastos({ gastos, porCategoria, mes, conNomina }: {
  gastos: GastoMes[];
  porCategoria: GastosDelPeriodo['porCategoria'];
  mes: string | null;
  conNomina: boolean;
}) {
  const delMes = mes ? gastos.find((g) => g.key === mes) : null;
  const tipos = totalesPorTipo(delMes ? [delMes] : gastos);
  const de = (t: string) => tipos.find((x) => x.tipo === t)?.centavos ?? 0;
  const total = tipos.reduce((s, t) => s + t.centavos, 0);
  const estimado = delMes?.nominaEstimada ? delMes.nominaCentavos : 0;
  const titulo = mes ? `de ${nombreDeMes(mes)}` : 'del año';
  const maximo = Math.max(1, ...gastos.map((g) => g.totalCentavos));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra icono={<Receipt className="h-4 w-4" />} titulo={`Gastos ${titulo}`} valor={fmtDOP(total)}
          nota="Lo que salió: nómina, gastos y compras. Lo anulado no cuenta." />
        <Cifra icono={<Briefcase className="h-4 w-4" />} titulo="Nómina" valor={conNomina ? fmtDOP(de('nomina')) : '—'}
          nota={estimado > 0
            ? `Aprobada. Faltan ~${fmtDOP(estimado - de('nomina'))} por aprobar este mes (estimado con el mes anterior).`
            : 'Corridas aprobadas: salarios + aportes patronales TSS + INFOTEP.'} />
        <Cifra icono={<Wallet className="h-4 w-4" />} titulo="Gastos" valor={fmtDOP(de('gastos'))}
          nota="Lo registrado en Facturación › Gastos: luz, alquiler, honorarios…" />
        <Cifra icono={<ShoppingCart className="h-4 w-4" />} titulo="Compras" valor={fmtDOP(de('compras'))}
          nota="Mercancía para el inventario: uniformes, libros para vender." />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Mes a mes" sub="Lo que salió cada mes, por tipo. Rayado: nómina estimada que falta aprobar." className="lg:col-span-2">
          <ul className="space-y-2">
            {gastos.map((g) => (
              <li key={g.key} className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-sm ${mes && mes !== g.key ? 'opacity-50' : ''}`}>
                <span className="text-gray-600">{mayuscula(mesCorto(Number(g.key.slice(5))))} <span className="text-[10px] text-gray-400">{g.key.slice(2, 4)}</span></span>
                <span className="flex h-3 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                  {(['nomina', 'gastos', 'compras'] as const).map((t) => {
                    const v = t === 'nomina' ? g.nominaCentavos : t === 'gastos' ? g.gastosCentavos : g.comprasCentavos;
                    if (v <= 0) return null;
                    return (
                      <span key={t} style={{
                        width: `${(v / maximo) * 100}%`, backgroundColor: COLOR[t],
                        ...(t === 'nomina' && g.nominaEstimada
                          ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 4px, transparent 4px 8px)' } : {}),
                      }} />
                    );
                  })}
                </span>
                <span className="tabular-nums text-gray-900">
                  {fmtDOP(g.totalCentavos)}{g.nominaEstimada && <span className="ml-1 text-xs text-gray-400">est.</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
            {(['nomina', 'gastos', 'compras'] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR[t] }} />
                {t === 'nomina' ? 'Nómina' : t === 'gastos' ? 'Gastos' : 'Compras'}
              </span>
            ))}
          </div>
        </Panel>

        <Panel titulo="Por categoría" sub="Gastos y compras del año. La nómina va aparte.">
          {porCategoria.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Todavía no hay gastos registrados este año.</p>
          ) : (
            <ul className="space-y-3">
              {porCategoria.map((c) => (
                <li key={c.categoria ?? 'sin'}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-gray-800">{c.label}</span>
                    <span className="shrink-0 tabular-nums text-gray-900">{fmtDOP(c.centavos)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${(c.centavos / porCategoria[0].centavos) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VistaGanancias({ gastos, ingresos, mes, hoy }: {
  gastos: GastoMes[]; ingresos: IngresoMes[]; mes: string | null; hoy: string;
}) {
  const r = armarGanancias(ingresos, gastos, hoy);
  const delMes = mes ? r.meses.find((m) => m.key === mes) : null;
  const hayEstimado = r.meses.some((m) => m.nominaEstimada);

  return (
    <div className="space-y-6">
      {delMes ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra icono={<ArrowDownRight className="h-4 w-4" />} titulo={`Entró en ${nombreDeMes(delMes.key)}`}
            valor={fmtDOP(delMes.ingresosCentavos)} nota="Lo cobrado en caja ese mes, sea de la cuota que sea." />
          <Cifra icono={<ArrowUpRight className="h-4 w-4" />} titulo="Salió" valor={fmtDOP(delMes.gastosCentavos)}
            nota={delMes.nominaEstimada ? 'Con la nómina estimada: falta aprobarla.' : 'Nómina, gastos y compras del mes.'} />
          <Cifra icono={<TrendingUp className="h-4 w-4" />} titulo="Ganancia del mes" valor={fmtDOP(delMes.gananciaCentavos)}
            tono={delMes.gananciaCentavos} nota={delMes.transcurrido ? 'Lo que entró menos lo que salió.' : 'El mes no ha llegado: mira la proyectada.'} />
          <Cifra icono={<CalendarRange className="h-4 w-4" />} titulo="Proyectada del mes" valor={fmtDOP(delMes.gananciaProyectadaCentavos)}
            tono={delMes.gananciaProyectadaCentavos} nota="Si se cobra todo lo de ese mes." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra icono={<ArrowDownRight className="h-4 w-4" />} titulo="Entró en lo que va" valor={fmtDOP(r.hastaHoy.ingresosCentavos)}
            nota="Lo cobrado en caja, del primer mes del año hasta hoy." />
          <Cifra icono={<ArrowUpRight className="h-4 w-4" />} titulo="Salió en lo que va" valor={fmtDOP(r.hastaHoy.gastosCentavos)}
            nota={hayEstimado ? 'Este mes lleva la nómina estimada si falta aprobarla.' : 'Nómina, gastos y compras.'} />
          <Cifra icono={<TrendingUp className="h-4 w-4" />} titulo="Ganancia en lo que va" valor={fmtDOP(r.hastaHoy.gananciaCentavos)}
            tono={r.hastaHoy.gananciaCentavos} nota="Lo que de verdad queda hasta hoy." />
          <Cifra icono={<CalendarRange className="h-4 w-4" />} titulo="Proyectada del año" valor={fmtDOP(r.proyectado.gananciaCentavos)}
            tono={r.proyectado.gananciaCentavos}
            nota={`Si se cobra todo lo del año (${fmtDOP(r.proyectado.ingresosCentavos)}) y la nómina sigue igual.`} />
        </div>
      )}

      <Panel titulo="Mes a mes" sub="Entró, salió y lo que queda. La proyectada supone que se cobra todo lo del mes.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 font-semibold">Mes</th>
                <th className="py-2 text-right font-semibold">Entró</th>
                <th className="py-2 text-right font-semibold">Salió</th>
                <th className="py-2 text-right font-semibold">Ganancia</th>
                <th className="py-2 text-right font-semibold">Proyectada</th>
              </tr>
            </thead>
            <tbody>
              {r.meses.map((m) => (
                <tr key={m.key} className={`border-b border-gray-100 ${mes === m.key ? 'bg-zero-50' : ''}`}>
                  <td className="py-2 text-gray-700">{mayuscula(nombreDeMes(m.key))}</td>
                  <td className="py-2 text-right tabular-nums">{m.transcurrido ? fmtDOP(m.ingresosCentavos) : <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtDOP(m.gastosCentavos)}{m.nominaEstimada && <span className="ml-1 text-xs text-gray-400">est.</span>}
                  </td>
                  <td className={`py-2 text-right font-medium tabular-nums ${m.transcurrido ? signo(m.gananciaCentavos) : 'text-gray-400'}`}>
                    {m.transcurrido ? fmtDOP(m.gananciaCentavos) : '—'}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${signo(m.gananciaProyectadaCentavos)}`}>{fmtDOP(m.gananciaProyectadaCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Cifra({ icono, titulo, valor, nota, tono }: {
  icono: React.ReactNode; titulo: string; valor: string; nota: string;
  /** Con un número, el valor sale en rojo si es negativo. */
  tono?: number;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span className="text-gray-400">{icono}</span>{titulo}
      </span>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tono != null ? signo(tono) : 'text-gray-900'}`}>{valor}</p>
      <p className="mt-2 text-xs leading-snug text-gray-400">{nota}</p>
    </div>
  );
}

function Panel({ titulo, sub, children, className = '' }: {
  titulo: string; sub: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
      <p className="mb-4 mt-0.5 text-xs text-gray-500">{sub}</p>
      {children}
    </div>
  );
}
