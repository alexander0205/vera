'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, FileWarning,
  Loader2, PiggyBank, RefreshCw, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP } from '@/lib/utils/format';
import { TRAMOS, tramoDeAtraso, type TramoKey } from '@/lib/administracion-escolar/cartera';
// Solo el tipo: `dashboard.ts` es `server-only` y la importación de tipo se
// borra al compilar, así que nada de la base llega al bundle del navegador.
import type { DashboardEscolar } from '@/lib/administracion-escolar/dashboard';

/**
 * El panorama financiero del colegio.
 *
 * Está ordenada como se piensa la pregunta, no como salen los datos: arriba las
 * cuatro cifras que se miran de pie (¿entró plata?, ¿cobré lo del mes?, ¿cuánto
 * me deben?, ¿cuánto falta del año?), después lo que dice a quién llamar, y al
 * final el detalle por concepto y por grado, que es donde se investiga.
 *
 * Sin librerías de gráficos: la CSP del despliegue no deja cargar nada externo,
 * y para cinco barras y un donut no hace falta. Todo es SVG a mano o divs.
 */

interface Respuesta {
  periodos: { id: number; nombre: string; activo: boolean }[];
  datos: DashboardEscolar | null;
}

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo leer el panorama del colegio');
  return r.json();
});

const MESES_CORTOS = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

export default function DashboardEscolarClient() {
  // `null` = «el que el servidor decida», que es el año activo. Así la primera
  // carga no tiene que esperar a la lista de períodos para pedir los números.
  const [periodoId, setPeriodoId] = useState<number | null>(null);

  const { data, error, isLoading, mutate, isValidating } = useSWR<Respuesta>(
    `/api/administracion-escolar/dashboard${periodoId ? `?periodoId=${periodoId}` : ''}`,
    traer,
  );

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>;
  }
  if (error || !data) {
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

  const { cartera, mes, caja } = d;
  const totalAnio = cartera.devengadoCentavos + d.porDevengarCentavos;
  const variacionCaja = pct(caja.esteMesCentavos - caja.mesAnteriorCentavos, caja.mesAnteriorCentavos);

  return (
    <section className="space-y-6 p-6">
      {/* ── Cabecera ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panorama financiero</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cómo va el cobro del año escolar. Los cargos anulados no cuentan en ninguna cifra.
          </p>
        </div>
        <div className="flex gap-2">
          <NativeSelect
            className="w-48"
            value={String(d.periodoId)}
            onChange={(e) => setPeriodoId(Number(e.target.value))}
          >
            {data.periodos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (activo)' : ''}</option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
            {isValidating
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Calculando…</>
              : <><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</>}
          </Button>
        </div>
      </div>

      {/* ── Las cuatro cifras de pie ───────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta
          icono={<Wallet className="h-4 w-4" />}
          titulo="Cobrado este mes"
          valor={fmtDOP(caja.esteMesCentavos)}
          nota="Lo que entró en caja por las facturas del colegio, venga del mes que venga."
        >
          {caja.mesAnteriorCentavos > 0 && (
            <p className={`flex items-center gap-1 text-sm ${variacionCaja >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {variacionCaja >= 0
                ? <ArrowUpRight className="h-4 w-4" />
                : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(variacionCaja)}% vs. el mes pasado
            </p>
          )}
        </Tarjeta>

        {/* El porcentaje compara cobrado y esperado sobre LOS MISMOS cargos —los
            que vencen en el mes—, que es lo único que hace que signifique algo:
            cruzar la caja del mes contra lo que vencía da cumplimientos por
            encima del 100% en cuanto alguien salda un atraso viejo. */}
        <Tarjeta
          icono={<CalendarClock className="h-4 w-4" />}
          titulo="Vencía este mes"
          valor={`${pct(mes.cobradoCentavos, mes.esperadoCentavos)}%`}
          nota="De lo que vencía en el mes, cuánto ya se cobró."
        >
          <p className="text-sm text-gray-500">
            {fmtDOP(mes.cobradoCentavos)} de {fmtDOP(mes.esperadoCentavos)}
          </p>
          <Barra valor={mes.cobradoCentavos} total={mes.esperadoCentavos} color="#2a45c4" />
        </Tarjeta>

        <Tarjeta
          icono={<TrendingUp className="h-4 w-4" />}
          titulo="Cartera pendiente"
          valor={fmtDOP(cartera.pendienteCentavos)}
          nota={`${cartera.familiasConDeuda} ${cartera.familiasConDeuda === 1 ? 'familia debe' : 'familias deben'} algo.`}
        >
          {cartera.vencidoCentavos > 0 && (
            <p className="text-sm text-red-600">
              {fmtDOP(cartera.vencidoCentavos)} ya vencido
              {' '}({pct(cartera.vencidoCentavos, cartera.pendienteCentavos)}%)
            </p>
          )}
        </Tarjeta>

        <Tarjeta
          icono={<PiggyBank className="h-4 w-4" />}
          titulo="Por devengar"
          valor={fmtDOP(d.porDevengarCentavos)}
          nota="Cuotas del calendario que todavía no son deuda de nadie."
        >
          <p className="text-sm text-gray-500">Año completo: {fmtDOP(totalAnio)}</p>
        </Tarjeta>
      </div>

      {/* ── Antigüedad + método ────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          titulo="Antigüedad de la cartera"
          sub="A quién hay que llamar hoy. Lo de más de 90 días ya casi no se cobra solo."
        >
          {cartera.pendienteCentavos === 0 ? (
            <Vacio>No hay nada pendiente en este año escolar.</Vacio>
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

        <Panel titulo="Por dónde entra el dinero" sub="Cobros del año, por método de pago.">
          {d.metodos.length === 0 ? (
            <Vacio>Todavía no se ha cobrado ninguna factura de este año.</Vacio>
          ) : (
            <Donut metodos={d.metodos} />
          )}
        </Panel>
      </div>

      {/* ── Serie mensual ──────────────────────────────────────────────── */}
      <Panel
        titulo="Mes a mes del año escolar"
        sub="Barra clara: lo que vencía ese mes. Barra sólida: lo que de eso ya se cobró."
      >
        <SerieMensual puntos={d.serie} />
      </Panel>

      {/* ── Concepto y grado ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Por concepto" sub="Qué se cobra bien y qué no. Ordenado por lo que falta.">
          {d.conceptos.length === 0 ? (
            <Vacio>Sin cargos todavía.</Vacio>
          ) : (
            <div className="space-y-3">
              {d.conceptos.map((c) => (
                <div key={c.conceptoId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-gray-900">{c.nombre}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">
                      {fmtDOP(c.cobradoCentavos)} de {fmtDOP(c.devengadoCentavos)}
                      {c.pendienteCentavos > 0 && (
                        <b className="ml-2 font-semibold text-red-600">{fmtDOP(c.pendienteCentavos)}</b>
                      )}
                    </span>
                  </div>
                  <Barra valor={c.cobradoCentavos} total={c.devengadoCentavos} color="#2a45c4" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Por grado" sub="Dónde se concentra la deuda, con los alumnos activos al lado.">
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

      {/* ── Deudores + avisos operativos ───────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          titulo="A quién llamar"
          sub="Los diez que más deben, con el atraso de su cargo más viejo."
        >
          {d.deudores.length === 0 ? (
            <Vacio>Nadie debe nada en este año escolar.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="pb-2 font-medium">Alumno</th>
                    <th className="pb-2 font-medium">Responsable de pago</th>
                    <th className="pb-2 text-right font-medium">Debe</th>
                    <th className="pb-2 text-right font-medium">Atraso</th>
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
                        className="py-2 text-right tabular-nums font-medium"
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
                Toda la deuda registrada tiene su comprobante emitido.
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
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
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

/**
 * Las barras del año escolar.
 *
 * En divs y no en SVG: para que un `<svg>` llene el ancho del panel hace falta
 * `preserveAspectRatio="none"`, y eso estira el viewBox en horizontal, con lo
 * que las etiquetas de los meses salían aplastadas unas encima de otras. Con
 * flex el navegador reparte las columnas solo y el texto es texto.
 *
 * Los meses que todavía no han llegado se pintan planos y grises. Dibujarlos
 * como un mes con cero cobrado haría ver un desplome de cobranza en marzo
 * cuando lo que pasa es que marzo no ha llegado.
 */
function SerieMensual({ puntos }: { puntos: DashboardEscolar['serie'] }) {
  if (puntos.length === 0) {
    return <Vacio>Este año escolar no tiene fechas configuradas.</Vacio>;
  }

  const tope = Math.max(...puntos.map((p) => p.devengadoCentavos), 1);

  return (
    <div className="flex items-end gap-1.5" style={{ height: 176 }}>
      {puntos.map((p) => {
        const altoDevengado = p.transcurrido ? (p.devengadoCentavos / tope) * 100 : 4;
        return (
          <div key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            title={p.transcurrido
              ? `${MESES_CORTOS[p.mes]} ${p.anio}: ${fmtDOP(p.cobradoCentavos)} cobrado de ${fmtDOP(p.devengadoCentavos)}`
              : `${MESES_CORTOS[p.mes]} ${p.anio}: todavía no ha llegado`}
          >
            {/* El contenedor tiene la altura fija y la barra crece desde abajo:
                así todas las columnas comparten la misma escala sin calcular
                posiciones absolutas. */}
            <div className="flex w-full flex-1 items-end">
              <div
                className="relative w-full rounded-sm"
                style={{
                  height: `${Math.max(altoDevengado, 1)}%`,
                  backgroundColor: p.transcurrido ? '#dbe2f5' : '#f1f3f8',
                }}
              >
                {p.transcurrido && p.cobradoCentavos > 0 && (
                  <div
                    className="absolute bottom-0 w-full rounded-sm bg-zero-600"
                    style={{ height: `${pct(p.cobradoCentavos, p.devengadoCentavos)}%` }}
                  />
                )}
              </div>
            </div>
            <span className="text-[10px] text-gray-400">{MESES_CORTOS[p.mes]}</span>
          </div>
        );
      })}
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
