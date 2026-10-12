'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarRange, CheckCircle2, FileWarning,
  Loader2, RefreshCw, TrendingUp, Users, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP } from '@/lib/utils/format';
import { useUrlParams } from '@/lib/hooks/useUrlEstado';
import { TRAMOS, tramoDeAtraso, type TramoKey } from '@/lib/administracion-escolar/cartera';
import { mesCorto, nombreDeMes } from '@/lib/administracion-escolar/serie-mensual';
// Solo el tipo: `dashboard.ts` es `server-only` y la importación de tipo se
// borra al compilar, así que nada de la base llega al bundle del navegador.
import type { DashboardEscolar, PuntoMensual } from '@/lib/administracion-escolar/dashboard';

/**
 * El panorama financiero del colegio.
 *
 * Está ordenada como se piensa la pregunta, no como salen los datos: arriba se
 * elige DE QUÉ se habla —el año completo o un mes, un concepto, un grado—,
 * después las cuatro cifras que se miran de pie (¿cuánto es?, ¿cuánto cobré?,
 * ¿cuánto me deben?, ¿cuánto entró?), el año mes a mes, y al final el detalle
 * por concepto y por grado y a quién llamar.
 *
 * Los filtros recortan TODO lo que hay debajo salvo el «mes a mes», que enseña
 * siempre el año entero: es de donde se elige el mes.
 *
 * Los filtros viven en la URL. Recargar, o mandarle el enlace a alguien, abre
 * lo mismo que se estaba mirando.
 *
 * Sin librerías de gráficos: la CSP del despliegue no deja cargar nada externo,
 * y para doce barras y un donut no hace falta. Todo es SVG a mano o divs.
 */

interface Respuesta {
  periodos: { id: number; nombre: string; activo: boolean }[];
  datos: DashboardEscolar | null;
}

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo leer el panorama del colegio');
  return r.json();
});

/** Color por tramo: cuanto más viejo el atraso, más oscuro el rojo. */
const COLOR_TRAMO: Record<TramoKey, string> = {
  porVencer: '#94a3b8',
  d1a30:     '#fbbf24',
  d31a60:    '#f97316',
  d61a90:    '#ef4444',
  d90mas:    '#991b1b',
};

/** Los métodos de cobro, en el mismo azul del módulo y bajando en intensidad. */
const COLOR_METODO = ['#2a45c4', '#4f6ae0', '#7d92ec', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  saldo_favor: 'Saldo a favor',
  nota_credito: 'Nota de crédito',
  otro: 'Otro',
};

/** Porcentaje entero y sin dividir por cero. */
function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 100);
}

/**
 * El porcentaje cobrado, sin redondear a favor.
 *
 * Con un peso pendiente no puede decir «100%», y con un peso cobrado no puede
 * decir «0%»: son justo los dos números que se leen sin mirar la cifra de al
 * lado.
 */
function pctCobrado(cobrado: number, total: number): number {
  if (total <= 0) return 0;
  if (cobrado >= total) return 100;
  if (cobrado <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round((cobrado / total) * 100)));
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function DashboardEscolarClient() {
  const { params, setParams } = useUrlParams();

  // Lo que se pide es lo que dice la URL, tal cual: quién es un mes, un
  // concepto o un grado válido lo decide el servidor y lo devuelve en
  // `datos.filtros`, que es de donde lee la pantalla.
  const pedido = new URLSearchParams();
  for (const [clave, enUrl] of [['periodoId', 'periodo'], ['mes', 'mes'], ['conceptoId', 'concepto'], ['gradoId', 'grado']] as const) {
    const v = params.get(enUrl);
    if (v) pedido.set(clave, v);
  }
  const qs = pedido.toString();

  // `keepPreviousData`: al cambiar de mes se siguen viendo las cifras de antes,
  // atenuadas, hasta que llegan las nuevas. Sin esto cada clic en un mes
  // vaciaba la pantalla entera y la volvía a pintar.
  const { data, error, isLoading, mutate, isValidating } = useSWR<Respuesta>(
    `/api/administracion-escolar/dashboard${qs ? `?${qs}` : ''}`,
    traer,
    { keepPreviousData: true },
  );

  if (!data && isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>;
  }
  if (!data) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">No se pudo leer el panorama del colegio.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>Reintentar</Button>
      </section>
    );
  }

  const d = data.datos;

  // Sin año escolar no hay nada que resumir, y enseñar ceros haría creer que el
  // colegio no ha cobrado nada. Se manda a configurarlo, que es lo que falta.
  if (!d) {
    return (
      <section className="space-y-4 p-6">
        <h1 className="text-2xl font-bold text-gray-900">Panorama financiero</h1>
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Todavía no hay un año escolar</p>
            <p className="mt-0.5 text-sm text-amber-800">
              El panorama se calcula sobre un año escolar. Crea el tuyo en Configuración y
              vuelve: aquí verás el cobro del año en cuanto haya matrículas.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/escolar/configuracion">Ir a Configuración</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const { cartera, caja, filtros } = d;
  const concepto = d.opciones.conceptos.find((c) => c.id === filtros.conceptoId) ?? null;
  const grado = d.opciones.grados.find((g) => g.id === filtros.gradoId) ?? null;
  const hayFiltro = filtros.mes != null || concepto != null || grado != null;

  // De qué se está hablando, dicho con palabras. Va encima de las cifras y en
  // los subtítulos: con tres filtros combinables, una cifra sin su «de qué» no
  // se puede leer.
  const periodoTexto = filtros.mes ? nombreDeMes(filtros.mes) : `el año ${d.periodo}`;
  const dePeriodo = filtros.mes ? `de ${nombreDeMes(filtros.mes)}` : 'del año';
  const recorte = [concepto?.nombre, grado?.grado].filter(Boolean).join(' · ');

  const mesDeCaja = nombreDeMes(caja.mes);
  const variacionCaja = pct(caja.esteMesCentavos - caja.mesAnteriorCentavos, caja.mesAnteriorCentavos);
  // Lo que se espera incluye las cuotas del calendario que todavía no son
  // cargo: en un colegio que devenga mes a mes, «el año» es mucho más que lo
  // que ya está cargado.
  const esperado = cartera.devengadoCentavos + d.porDevengarCentavos;
  const cargando = isLoading || isValidating;

  const elegirMes = (mes: string | null) => setParams({ mes });

  return (
    <section className="space-y-6 p-6">
      {/* ── Cabecera ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panorama financiero</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cómo va el cobro del colegio. Los cargos anulados no cuentan en ninguna cifra.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-48">
            <NativeSelect
              aria-label="Año escolar"
              value={String(d.periodoId)}
              // Cambiar de año borra los otros filtros: el mes, el concepto y
              // el grado elegidos son del año que se deja.
              onChange={(e) => setParams({ periodo: e.target.value, mes: null, concepto: null, grado: null })}
            >
              {data.periodos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (activo)' : ''}</option>
              ))}
            </NativeSelect>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={cargando}>
            {cargando
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Calculando…</>
              : <><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</>}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron actualizar las cifras: lo que ves es lo último que se leyó.
        </p>
      )}

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Período</p>
          <div className="flex flex-wrap gap-1.5">
            <Pastilla activa={filtros.mes == null} onClick={() => elegirMes(null)}>Año completo</Pastilla>
            {d.serie.map((p) => (
              <Pastilla
                key={p.key}
                activa={filtros.mes === p.key}
                onClick={() => elegirMes(filtros.mes === p.key ? null : p.key)}
                titulo={mayuscula(nombreDeMes(p.key))}
              >
                {mayuscula(mesCorto(p.mes))}
                {/* El año solo donde hace falta para no confundir dos eneros. */}
                <span className="ml-1 text-[10px] opacity-60">{String(p.anio).slice(2)}</span>
                {p.enCurso && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" aria-label="mes en curso" />}
              </Pastilla>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-64">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Concepto</span>
            <NativeSelect
              value={filtros.conceptoId == null ? '' : String(filtros.conceptoId)}
              onChange={(e) => setParams({ concepto: e.target.value || null })}
            >
              <option value="">Todos los conceptos</option>
              {d.opciones.conceptos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="block w-full sm:w-64">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Grado</span>
            <NativeSelect
              value={filtros.gradoId == null ? '' : String(filtros.gradoId)}
              onChange={(e) => setParams({ grado: e.target.value || null })}
            >
              <option value="">Todos los grados</option>
              {d.opciones.grados.map((g) => (
                <option key={g.id} value={g.id}>{g.grado} · {g.servicio}</option>
              ))}
            </NativeSelect>
          </label>
          {hayFiltro && (
            <Button variant="ghost" size="sm" className="mb-0.5"
              onClick={() => setParams({ mes: null, concepto: null, grado: null })}>
              <X className="mr-1 h-4 w-4" />Quitar filtros
            </Button>
          )}
        </div>
      </div>

      <div className={`space-y-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
        {/* De qué son las cifras de abajo. */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-lg font-semibold text-gray-900">{mayuscula(periodoTexto)}</h2>
          {recorte && <span className="text-sm text-gray-500">· {recorte}</span>}
          {!filtros.mes && <span className="text-sm text-gray-400">· todos los meses</span>}
        </div>

        {/* ── Las cuatro cifras de pie ─────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tarjeta
            icono={<CalendarRange className="h-4 w-4" />}
            titulo={filtros.mes ? `Total de ${nombreDeMes(filtros.mes)}` : 'Total del año'}
            valor={fmtDOP(esperado)}
            nota={filtros.mes
              ? 'Todo lo que se cobra por las cuotas de ese mes.'
              : 'Todo lo que se cobra en el año escolar: lo cobrado más lo que falta.'}
          >
            <p className="text-sm text-gray-500">
              {cartera.cargos.toLocaleString('es-DO')} {cartera.cargos === 1 ? 'cargo' : 'cargos'}
            </p>
            {d.porDevengarCentavos > 0 && (
              <p className="text-sm text-gray-500">
                {fmtDOP(cartera.devengadoCentavos)} ya cargado · {fmtDOP(d.porDevengarCentavos)} por devengar
              </p>
            )}
          </Tarjeta>

          <Tarjeta
            icono={<CheckCircle2 className="h-4 w-4" />}
            titulo="Cobrado"
            valor={fmtDOP(cartera.cobradoCentavos)}
            nota={filtros.mes
              ? 'De las cuotas de ese mes, lo que ya está pagado, se haya pagado cuando sea.'
              : 'De lo cargado en el año, lo que ya está pagado.'}
          >
            <p className="text-sm text-gray-500">
              {pctCobrado(cartera.cobradoCentavos, cartera.devengadoCentavos)}% de {fmtDOP(cartera.devengadoCentavos)}
            </p>
            <Barra valor={cartera.cobradoCentavos} total={cartera.devengadoCentavos} color="#2a45c4" />
          </Tarjeta>

          {/* El pendiente va PARTIDO. En un colegio que carga el año entero al
              matricular, casi todo es de meses que no han llegado: en una sola
              cifra se leía como «esto tiene que entrar ya». */}
          <Tarjeta
            icono={<TrendingUp className="h-4 w-4" />}
            titulo="Pendiente"
            valor={fmtDOP(cartera.pendienteCentavos)}
            nota={`${cartera.familiasConDeuda} ${cartera.familiasConDeuda === 1 ? 'familia debe' : 'familias deben'} algo ${dePeriodo}.`}
          >
            {cartera.vencidoCentavos > 0 && (
              <p className="text-sm font-medium text-red-600">{fmtDOP(cartera.vencidoCentavos)} ya vencido</p>
            )}
            {cartera.corrienteCentavos > 0 && (
              <p className="text-sm text-gray-600">{fmtDOP(cartera.corrienteCentavos)} en plazo, toca pagarlo ya</p>
            )}
            {cartera.futuroCentavos > 0 && (
              <p className="text-sm text-gray-400">
                {fmtDOP(cartera.futuroCentavos)} {filtros.mes ? 'de un mes que aún no llega' : 'de meses que aún no llegan'}
              </p>
            )}
          </Tarjeta>

          <Tarjeta
            icono={<Wallet className="h-4 w-4" />}
            titulo={`Entró en ${mesDeCaja}`}
            valor={fmtDOP(caja.esteMesCentavos)}
            nota="Dinero recibido ese mes por las facturas del colegio, sea de la cuota que sea."
          >
            {caja.mesAnteriorCentavos > 0 && (
              <p className={`flex items-center gap-1 text-sm ${variacionCaja >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {variacionCaja >= 0
                  ? <ArrowUpRight className="h-4 w-4" />
                  : <ArrowDownRight className="h-4 w-4" />}
                {Math.abs(variacionCaja)}% vs. el mes anterior
              </p>
            )}
            {!filtros.mes && (
              <p className="text-sm text-gray-500">En el año: {fmtDOP(caja.totalCentavos)}</p>
            )}
          </Tarjeta>
        </div>

        {/* ── Mes a mes ────────────────────────────────────────────────── */}
        <Panel
          titulo="Mes a mes del año escolar"
          sub={`Toca un mes para ver solo ese mes; tócalo otra vez para volver al año.${recorte ? ` Aquí: ${recorte}.` : ''}`}
        >
          <SerieMensual
            puntos={d.serie} sinMes={d.sinMes} cajaTotalCentavos={caja.totalCentavos}
            elegido={filtros.mes} onElegir={elegirMes}
          />
        </Panel>

        {/* ── Antigüedad + método ──────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            className="lg:col-span-2"
            titulo="Antigüedad de lo pendiente"
            sub={`Lo pendiente ${dePeriodo}, por cuánto lleva vencido. Lo de más de 90 días ya casi no se cobra solo.`}
          >
            {cartera.pendienteCentavos === 0 ? (
              <Vacio>No hay nada pendiente {dePeriodo}.</Vacio>
            ) : (
              <div className="space-y-2.5">
                {TRAMOS.map((t) => {
                  const monto = d.tramos[t.key] ?? 0;
                  return (
                    <div key={t.key} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-gray-500">{t.label}</span>
                      <div className="h-3.5 flex-1 overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${pct(monto, cartera.pendienteCentavos)}%`,
                            backgroundColor: COLOR_TRAMO[t.key],
                          }}
                        />
                      </div>
                      <span className="w-32 shrink-0 text-right text-sm tabular-nums text-gray-900">
                        {fmtDOP(monto)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            titulo="Por dónde entra el dinero"
            sub={filtros.mes ? `Cobros recibidos en ${nombreDeMes(filtros.mes)}, por método de pago.` : 'Cobros del año, por método de pago.'}
          >
            {d.metodos.length === 0 ? (
              <Vacio>{filtros.mes ? 'Ese mes no entró ningún cobro.' : 'Todavía no se ha cobrado ninguna factura de este año.'}</Vacio>
            ) : (
              <Donut metodos={d.metodos} />
            )}
          </Panel>
        </div>

        {/* ── Concepto y grado ─────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel titulo="Por concepto" sub={`Qué se cobra bien y qué no ${dePeriodo}. Ordenado por lo que falta.`}>
            {d.conceptos.length === 0 ? (
              <Vacio>Sin cargos {dePeriodo}.</Vacio>
            ) : (
              <div className="space-y-3">
                {d.conceptos.map((c) => (
                  <div key={c.conceptoId}>
                    {/* Se parte en dos líneas cuando no cabe. Las cifras iban
                        con `shrink-0` y en un teléfono empujaban el panel —y
                        con él la página entera— 170 px fuera de la pantalla. */}
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span className="min-w-0 truncate font-medium text-gray-900">{c.nombre}</span>
                      <span className="tabular-nums text-gray-500">
                        {fmtDOP(c.cobradoCentavos)} de {fmtDOP(c.devengadoCentavos)}
                        {c.pendienteCentavos > 0 && (
                          <b className="ml-2 whitespace-nowrap font-semibold text-red-600">{fmtDOP(c.pendienteCentavos)}</b>
                        )}
                      </span>
                    </div>
                    <Barra valor={c.cobradoCentavos} total={c.devengadoCentavos} color="#2a45c4" />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel titulo="Por grado" sub={`Dónde se concentra lo pendiente ${dePeriodo}, con los alumnos activos al lado.`}>
            {d.grados.length === 0 ? (
              <Vacio>Este año todavía no tiene estructura académica.</Vacio>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {d.grados.map((g) => (
                  <div key={g.gradoId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-gray-900">
                        {g.grado}
                        <span className="ml-1.5 font-normal text-gray-400">
                          {g.servicio}{g.tanda ? ` · ${g.tanda}` : ''} · {g.alumnos} alum.
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-500">
                        {g.pendienteCentavos > 0
                          ? <b className="font-semibold text-red-600">{fmtDOP(g.pendienteCentavos)}</b>
                          : '—'}
                      </span>
                    </div>
                    <Barra valor={g.cobradoCentavos} total={g.devengadoCentavos} color="#2a45c4" />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Deudores + avisos operativos ─────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            className="lg:col-span-2"
            titulo="A quién llamar"
            sub={`Los diez que más deben ${dePeriodo}, con el atraso de su cargo más viejo.`}
          >
            {d.deudores.length === 0 ? (
              <Vacio>Nadie debe nada {dePeriodo}.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                      <th className="pb-2 font-medium">Alumno</th>
                      <th className="pb-2 font-medium">Responsable de pago</th>
                      <th className="pb-2 text-right font-medium">Debe</th>
                      <th className="pb-2 pl-4 text-right font-medium">Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.deudores.map((f) => (
                      <tr key={f.estudianteId} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/escolar/estudiantes?estudianteId=${f.estudianteId}`}
                            className="font-medium text-zero-600 hover:underline"
                          >
                            {f.estudiante}
                          </Link>
                          {f.curso && <span className="ml-1.5 text-xs text-gray-400">{f.curso}</span>}
                        </td>
                        {/* Sin responsable no hay a quién llamar, y eso es un
                            problema distinto de deber dinero: se dice, no se
                            deja en blanco. */}
                        <td className="py-2 pr-3 text-gray-700">
                          {f.responsable ?? <span className="text-amber-600">Sin responsable asignado</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-900">{fmtDOP(f.deudaCentavos)}</td>
                        <td
                          className="whitespace-nowrap py-2 pl-4 text-right tabular-nums font-medium"
                          style={{ color: COLOR_TRAMO[tramoDeAtraso(f.diasAtraso)] }}
                        >
                          {f.diasAtraso > 0 ? `${f.diasAtraso} d` : 'al día'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="space-y-4">
            {/* El agujero propio de este modelo: el cargo es la fuente de verdad
                de la deuda y puede existir sin factura, así que el colegio la
                tiene contada y el padre nunca recibió nada que pagar. */}
            <div className={`rounded-xl border bg-white p-4 ${
              d.sinFacturar.cargos > 0 ? 'border-red-200' : 'border-gray-200'
            }`}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <FileWarning className={`h-4 w-4 ${d.sinFacturar.cargos > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                Deuda sin facturar
              </h2>
              {d.sinFacturar.cargosTotal === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  Toda la deuda registrada {dePeriodo} tiene su comprobante emitido.
                </p>
              ) : d.sinFacturar.cargos === 0 ? (
                /* Nada vencido, pero sí deuda sin documento. Decir solo «todo lo
                   vencido está facturado» se leía como «todo bien» y escondía
                   justo esto. */
                <>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{fmtDOP(d.sinFacturar.centavosTotal)}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {d.sinFacturar.cargosTotal} cargo(s) sin comprobante. Ninguno ha vencido todavía,
                    pero la familia no ha recibido nada que pagar.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/escolar/cargos">Ver en Cargos</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{fmtDOP(d.sinFacturar.centavos)}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {d.sinFacturar.cargos} {d.sinFacturar.cargos === 1 ? 'cargo vencido' : 'cargos vencidos'} sin
                    comprobante: la familia nunca recibió nada que pagar.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/escolar/cargos">Ver en Cargos</Link>
                  </Button>
                </>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Users className="h-4 w-4 text-gray-400" />
                Matrícula del año
              </h2>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {d.matricula.activos}
                <span className="ml-1.5 text-sm font-normal text-gray-500">activos</span>
              </p>
              {/* Los ceros no se enseñan: «−0 retirados» ocupa sitio para no
                  decir nada, y en un colegio sin bajas es la mitad de la línea. */}
              <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
                {/* «Nuevos» son alumnos que nunca habían estado en el colegio: la
                    reinscripción de siempre no es un alumno ganado. */}
                {d.matricula.nuevos > 0 && (
                  <span className="text-emerald-600">
                    +{d.matricula.nuevos} {d.matricula.nuevos === 1 ? 'nuevo' : 'nuevos'}
                  </span>
                )}
                {d.matricula.retirados > 0 && (
                  <span className="text-red-600">
                    −{d.matricula.retirados} {d.matricula.retirados === 1 ? 'retirado' : 'retirados'}
                  </span>
                )}
                {d.matricula.finalizados > 0 && (
                  <span className="text-gray-500">{d.matricula.finalizados} finalizadas</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({ icono, titulo, valor, nota, children }: {
  icono: React.ReactNode; titulo: string; valor: string; nota: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span className="text-gray-400">{icono}</span>{titulo}
      </span>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{valor}</p>
      <div className="mt-1 space-y-1">{children}</div>
      <p className="mt-2 text-xs leading-snug text-gray-400">{nota}</p>
    </div>
  );
}

function Panel({ titulo, sub, children, className = '' }: {
  titulo: string; sub: string; children: React.ReactNode; className?: string;
}) {
  return (
    // `min-w-0`: dentro de una rejilla, un panel no se encoge por debajo de su
    // contenido si no se le dice, y una tabla ancha lo sacaba de la pantalla.
    <div className={`min-w-0 rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
      <p className="mb-4 mt-0.5 text-xs text-gray-500">{sub}</p>
      {children}
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}

function Barra({ valor, total, color }: { valor: number; total: number; color: string }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full" style={{ width: `${pct(valor, total)}%`, backgroundColor: color }} />
    </div>
  );
}

/** Un botón de filtro: lleno cuando es el que está puesto. */
function Pastilla({ activa, onClick, titulo, children }: {
  activa: boolean; onClick: () => void; titulo?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      title={titulo}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        activa
          ? 'border-zero-600 bg-zero-600 font-medium text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

/** Alto de la zona de barras, en píxeles. Ver la nota de `SerieMensual`. */
const ALTO_BARRAS = 148;

/**
 * El año escolar mes a mes: las barras para ver la forma, la tabla para leer
 * la cifra. Las dos sirven además para ELEGIR el mes.
 *
 * Las barras miden su alto en PÍXELES, no en porcentaje. En porcentaje no se
 * veía ninguna: la columna de cada mes no tenía un alto propio —se lo daba su
 * contenido— y un `height: 80%` de «lo que mida mi contenido» da cero. La
 * gráfica entera eran doce etiquetas sin barra encima.
 *
 * Un mes que todavía no ha llegado se pinta con el borde punteado y más claro,
 * pero CON su alto: en un colegio que carga el año al matricular esos meses ya
 * tienen su monto y hasta pagos adelantados, y aplanarlos escondía las dos
 * cosas. Lo que no se hace es pintarlo como un mes normal con poco cobrado, que
 * haría ver un desplome de cobranza donde solo hay un mes que no ha llegado.
 */
function SerieMensual({ puntos, sinMes, cajaTotalCentavos, elegido, onElegir }: {
  puntos: PuntoMensual[];
  sinMes: DashboardEscolar['sinMes'];
  /**
   * El total de caja, tal como lo suma el servidor.
   *
   * No se suma aquí la columna: cada mes llega ya redondeado a centavos —el
   * prorrateo deja fracciones— y doce redondeos no dan lo mismo que uno. La
   * tabla decía un centavo más que la tarjeta de arriba.
   */
  cajaTotalCentavos: number;
  elegido: string | null;
  onElegir: (mes: string | null) => void;
}) {
  if (puntos.length === 0) {
    return <Vacio>Este año escolar no tiene fechas configuradas ni cargos.</Vacio>;
  }

  // En la gráfica, solo los meses con algo que dibujar o que son del año. El
  // mes en que nada más entró caja —un pago adelantado en julio— tiene su fila
  // en la tabla, pero una columna sin barra aquí solo confunde.
  const columnas = puntos.filter((p) => p.devengadoCentavos > 0 || !p.fueraDelAnio);
  const tope = Math.max(...columnas.map((p) => p.devengadoCentavos), 1);

  const total = puntos.reduce((a, p) => ({
    devengado: a.devengado + p.devengadoCentavos,
    cobrado: a.cobrado + p.cobradoCentavos,
    pendiente: a.pendiente + p.pendienteCentavos,
  }), {
    devengado: sinMes.devengadoCentavos, cobrado: sinMes.cobradoCentavos,
    pendiente: sinMes.pendienteCentavos,
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-zero-700" />Cobrado</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#c9d3f2' }} />Pendiente</span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm border border-dashed border-gray-400 bg-gray-50" />Mes que aún no llega
        </span>
      </div>

      <div className="flex items-stretch gap-1 sm:gap-2">
        {columnas.map((p, i) => {
          const alto = p.devengadoCentavos > 0
            ? Math.max(4, Math.round((p.devengadoCentavos / tope) * ALTO_BARRAS))
            : 0;
          const porcentaje = pctCobrado(p.cobradoCentavos, p.devengadoCentavos);
          const altoCobrado = p.cobradoCentavos > 0
            ? Math.max(2, Math.round(alto * Math.min(1, p.cobradoCentavos / p.devengadoCentavos)))
            : 0;
          const activo = elegido === p.key;
          const cambiaAnio = i === 0 || columnas[i - 1].anio !== p.anio;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onElegir(activo ? null : p.key)}
              aria-pressed={activo}
              title={p.devengadoCentavos > 0
                ? `${mayuscula(nombreDeMes(p.key))}: ${fmtDOP(p.cobradoCentavos)} cobrado de ${fmtDOP(p.devengadoCentavos)}`
                : `${mayuscula(nombreDeMes(p.key))}: sin cargos`}
              className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 pb-1 pt-1.5 transition ${
                activo ? 'bg-zero-50 ring-1 ring-zero-200' : 'hover:bg-gray-50'
              } ${elegido != null && !activo ? 'opacity-45 hover:opacity-100' : ''}`}
            >
              <span className={`h-4 text-[10px] tabular-nums ${activo ? 'font-semibold text-zero-700' : 'text-gray-500'}`}>
                {p.devengadoCentavos > 0 ? `${porcentaje}%` : ''}
              </span>
              <span className="flex w-full items-end justify-center" style={{ height: ALTO_BARRAS }}>
                {alto > 0 ? (
                  <span
                    className={`relative block w-full max-w-11 overflow-hidden rounded-sm ${
                      p.transcurrido ? '' : 'border border-dashed border-gray-300'
                    }`}
                    style={{ height: alto, backgroundColor: p.transcurrido ? '#c9d3f2' : '#f4f5f9' }}
                  >
                    {altoCobrado > 0 && (
                      <span className="absolute inset-x-0 bottom-0 bg-zero-700" style={{ height: altoCobrado }} />
                    )}
                  </span>
                ) : (
                  <span className="block h-px w-full max-w-11 bg-gray-200" />
                )}
              </span>
              <span className={`mt-1.5 text-[11px] leading-none ${activo ? 'font-semibold text-zero-700' : p.enCurso ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                {mesCorto(p.mes)}
              </span>
              {/* El año, solo donde empieza: doce veces «2026» no dicen nada. */}
              <span className="mt-0.5 h-3 text-[9px] leading-none text-gray-400">{cambiaAnio ? p.anio : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full min-w-[44rem] text-sm tabular-nums">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 text-right font-medium">Total del mes</th>
              <th className="px-3 py-2 text-right font-medium">Cobrado</th>
              <th className="px-3 py-2 text-right font-medium">Pendiente</th>
              <th className="w-36 px-3 py-2 font-medium">Avance</th>
              <th className="border-l border-gray-200 px-3 py-2 text-right font-medium">Entró en caja</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => {
              const activo = elegido === p.key;
              const sinCargos = p.devengadoCentavos === 0;
              return (
                <tr
                  key={p.key}
                  onClick={() => onElegir(activo ? null : p.key)}
                  className={`cursor-pointer border-t border-gray-100 transition-colors ${
                    activo ? 'bg-zero-50' : 'hover:bg-gray-50/70'
                  } ${p.transcurrido ? '' : 'text-gray-400'}`}
                >
                  <td className="whitespace-nowrap px-3 py-2">
                    {/* El botón es para el teclado: la fila entera se toca con
                        el ratón, pero a una fila no se llega con Tab. */}
                    <button
                      type="button"
                      aria-pressed={activo}
                      onClick={(e) => { e.stopPropagation(); onElegir(activo ? null : p.key); }}
                      className={`font-medium hover:underline ${activo ? 'text-zero-700' : p.transcurrido ? 'text-gray-900' : 'text-gray-500'}`}
                    >
                      {mayuscula(nombreDeMes(p.key))}
                    </button>
                    {p.enCurso && (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">en curso</span>
                    )}
                    {p.fueraDelAnio && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">fuera del año escolar</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{sinCargos ? '—' : fmtDOP(p.devengadoCentavos)}</td>
                  <td className="px-3 py-2 text-right">{sinCargos ? '—' : fmtDOP(p.cobradoCentavos)}</td>
                  <td className={`px-3 py-2 text-right ${
                    p.pendienteCentavos > 0 && p.transcurrido && !p.enCurso ? 'font-medium text-red-600' : ''
                  }`}>
                    {sinCargos ? '—' : fmtDOP(p.pendienteCentavos)}
                  </td>
                  <td className="px-3 py-2">
                    {!sinCargos && (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <span
                            className="block h-full rounded-full bg-zero-700"
                            style={{ width: `${pctCobrado(p.cobradoCentavos, p.devengadoCentavos)}%` }}
                          />
                        </span>
                        <span className="w-9 text-right text-xs">{pctCobrado(p.cobradoCentavos, p.devengadoCentavos)}%</span>
                      </span>
                    )}
                  </td>
                  <td className="border-l border-gray-100 px-3 py-2 text-right">
                    {p.cajaCentavos > 0 ? fmtDOP(p.cajaCentavos) : '—'}
                  </td>
                </tr>
              );
            })}
            {sinMes.devengadoCentavos > 0 && (
              <tr className="border-t border-gray-100 text-gray-500">
                <td className="px-3 py-2">Sin mes asignado</td>
                <td className="px-3 py-2 text-right">{fmtDOP(sinMes.devengadoCentavos)}</td>
                <td className="px-3 py-2 text-right">{fmtDOP(sinMes.cobradoCentavos)}</td>
                <td className="px-3 py-2 text-right">{fmtDOP(sinMes.pendienteCentavos)}</td>
                <td className="px-3 py-2" />
                <td className="border-l border-gray-100 px-3 py-2 text-right">—</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
              <td className="px-3 py-2">Año completo</td>
              <td className="px-3 py-2 text-right">{fmtDOP(total.devengado)}</td>
              <td className="px-3 py-2 text-right">{fmtDOP(total.cobrado)}</td>
              <td className="px-3 py-2 text-right">{fmtDOP(total.pendiente)}</td>
              <td className="px-3 py-2">
                <span className="block text-right text-xs">{pctCobrado(total.cobrado, total.devengado)}%</span>
              </td>
              <td className="border-l border-gray-200 px-3 py-2 text-right">{fmtDOP(cajaTotalCentavos)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs leading-snug text-gray-400">
        «Cobrado» y «Pendiente» son de las cuotas DE ese mes, se paguen cuando se paguen.
        «Entró en caja» es el dinero recibido DURANTE ese mes, sea de la cuota que sea.
      </p>
    </div>
  );
}

/**
 * El reparto por método, como anillo.
 *
 * Se dibuja con un solo `circle` por porción y `stroke-dasharray`: el truco de
 * siempre para no calcular arcos a mano ni depender de una librería. La
 * circunferencia se fija en 100 (r = 100/2π) para que cada porción sea
 * literalmente su porcentaje.
 */
function Donut({ metodos }: { metodos: DashboardEscolar['metodos'] }) {
  const total = metodos.reduce((a, m) => a + m.centavos, 0);
  const R = 100 / (2 * Math.PI);
  let acumulado = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 40 40" className="h-28 w-28 shrink-0" role="img" aria-label="Cobros por método de pago">
        <g transform="translate(20,20) rotate(-90)">
          {metodos.map((m, i) => {
            const parte = (m.centavos / total) * 100;
            const offset = -acumulado;
            acumulado += parte;
            return (
              <circle
                key={m.metodo} r={R} fill="none"
                stroke={COLOR_METODO[i % COLOR_METODO.length]} strokeWidth="7"
                strokeDasharray={`${parte} ${100 - parte}`} strokeDashoffset={offset}
              />
            );
          })}
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {metodos.map((m, i) => (
          <li key={m.metodo} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: COLOR_METODO[i % COLOR_METODO.length] }}
            />
            <span className="truncate text-gray-700">{METODO_LABEL[m.metodo] ?? m.metodo}</span>
            <span className="ml-auto shrink-0 tabular-nums text-gray-500">{pct(m.centavos, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
