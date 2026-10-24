'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Pencil, RotateCcw } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { fmtFechaCorta, parseDOPaCentavos } from '@/lib/utils/format';
import { cuotasAlMatricular, sumaCentavos } from '@/lib/administracion-escolar/cuotas-al-matricular';
import { montosPorCuota, precioEsPorCuota } from '@/lib/administracion-escolar/repartir';

/**
 * Lo que va a deber el alumno al matricularlo, con lo que no aplique
 * desmarcable.
 *
 * Vive aquí y no dentro de una pantalla porque lo usan las DOS que matriculan:
 * la de Matriculación y la de la ficha del alumno. Estaban desparejas — la de
 * la ficha creaba la matrícula a ciegas y le cargaba todos los conceptos del
 * grado, sin que nadie viera el total ni pudiera quitar el que no toca.
 *
 * No cobra nada: los cargos nacen pendientes y salen en su estado de cuenta.
 */

export interface CuotaPlan {
  cuotaId: number; numero: number; etiqueta: string; mes: number | null;
  fechaEmision: string; fechaVencimiento: string; montoCentavos: number; omitida: boolean;
  /** Peso de la cuota en el reparto (100000 = 100 %). */
  porcentajeMilesimas?: number;
}

export interface LineaPlan {
  conceptoId: number; nombre: string; tipo: string;
  admiteBeca: boolean; montoCentavos: number; origen: string;
  /** Llega desmarcado al matricular: se marca solo a quien lo usa. */
  opcional?: boolean;
  /** `montoCentavos` es lo de cada cuota (true) o el total que se reparte (false). */
  precioPorCuota?: boolean;
  cuotas: CuotaPlan[]; totalCentavos: number; omitidas: number;
  /**
   * El producto con el que se facturaría esta línea, ya resuelto por la cadena
   * de tarifas. Viaja hasta aquí porque el precio propio se guarda ANTES de que
   * exista la matrícula, y sin ella el servidor no tiene de dónde heredarlo:
   * la tarifa nacería sin producto y se rechazaría (regla R2).
   */
  productId: number | null;
}

const fmtRD = (centavos: number) =>
  `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


/** Pesos del reparto. Sin ellos (un plan pedido antes de que viajaran), cuotas iguales. */
const pesosDe = (l: LineaPlan) => l.cuotas.map((c) => c.porcentajeMilesimas ?? 1);

/**
 * El plan como quedaría con los precios propios puestos.
 *
 * Un precio propio es la TARIFA de ese alumno y se reparte con la misma regla
 * que la del grado (`montosPorCuota`): en una mensualidad es lo de cada cuota;
 * en lo demás, el total que se divide entre las cuotas. Antes aquí se ponía en
 * cada cuota sin mirar el tipo, y en un concepto «otro» de diez cuotas la
 * pantalla enseñaba diez veces lo que el servidor después cargaba.
 *
 * Suelta para que «Matricular desde SIGERD» sume a cada alumno de la lista con
 * la misma cuenta con la que este selector lo enseña.
 */
export function aplicarPreciosPropios<L extends LineaPlan>(plan: L[], propios: Map<number, number>): L[] {
  if (propios.size === 0) return plan;
  return plan.map((l) => {
    const propio = propios.get(l.conceptoId);
    if (propio == null) return l;
    const montos = montosPorCuota(l.tipo, propio, pesosDe(l), l.precioPorCuota);
    const cuotas = l.cuotas.map((c, i) => (c.omitida ? c : { ...c, montoCentavos: montos[i] }));
    return {
      ...l,
      montoCentavos: propio,
      cuotas,
      totalCentavos: cuotas.reduce((s, c) => s + (c.omitida ? 0 : c.montoCentavos), 0),
    };
  });
}

/** Lo de cada cuota que queda, si todas pagan lo mismo; `null` si varía. */
export function porCuotaDe(l: LineaPlan): number | null {
  const vivas = l.cuotas.filter((c) => !c.omitida);
  if (vivas.length === 0) return null;
  return vivas.every((c) => c.montoCentavos === vivas[0].montoCentavos) ? vivas[0].montoCentavos : null;
}

/**
 * Qué se escribe en «Cambiar precio»: lo de CADA cuota, que es como se habla
 * del precio («5,000 al mes»). Solo si las cuotas no pesan igual —no hay «una
 * cuota» que escribir— se escribe el total del año.
 */
const porCuota = (l: LineaPlan) => precioEsPorCuota(l);

export function modoPrecio(l: LineaPlan): 'cuota' | 'total' {
  if (porCuota(l)) return 'cuota';
  const pesos = pesosDe(l);
  return pesos.length > 0 && Math.max(...pesos) - Math.min(...pesos) <= 1 ? 'cuota' : 'total';
}

/**
 * De lo escrito a la tarifa que se guarda. En una mensualidad son lo mismo; en
 * un concepto que reparte, la tarifa es el total: la cuota por cuántas hay en
 * el calendario (también las que se omiten, que son parte del reparto).
 */
export function tarifaDesdeEscrito(l: LineaPlan, centavos: number): number {
  return porCuota(l) || modoPrecio(l) === 'total' ? centavos : centavos * l.cuotas.length;
}

/** Lo que se enseña en el campo al abrirlo: la cuota o el total, según `modoPrecio`. */
function escritoDesdeTarifa(l: LineaPlan, tarifa: number): number {
  return porCuota(l) || modoPrecio(l) === 'total'
    ? tarifa : Math.round(tarifa / Math.max(1, l.cuotas.length));
}

/** Cuándo se cobra, sin montos: los montos van en sus columnas. */
function cuandoSeCobra(l: LineaPlan): string {
  const vigentes = l.cuotas.filter((c) => !c.omitida);
  if (vigentes.length === 0) return 'sin cuotas pendientes';
  const primera = vigentes[0];
  if (vigentes.length === 1) {
    // Sin fecha límite no se escribe "vence —": un guion donde debería ir una
    // fecha parece un dato que falta, no una decisión del colegio.
    return primera.fechaVencimiento ? `vence ${fmtFechaCorta(primera.fechaVencimiento)}` : 'pago único';
  }
  // Si no vencen, sirve la de emisión: es el día en que el cargo le aparece a la familia.
  const ultima = vigentes[vigentes.length - 1];
  return `${fmtFechaCorta(primera.fechaVencimiento ?? primera.fechaEmision)} – ${fmtFechaCorta(ultima.fechaVencimiento ?? ultima.fechaEmision)}`;
}

export function PlanCobroSelector({ periodoId, cursoId, desde, corte, estudianteId, inicial, onPlan, onCambio, onPrecios }: {
  periodoId: string;
  cursoId: string;
  /** Fecha de inscripción: decide qué cuotas entran ya y cuáles esperan su mes. */
  desde: string;
  /**
   * Hasta qué fecha se cargan ya las cuotas, si no es la de inscripción.
   * «Matricular desde SIGERD» inscribe al inicio del año y corta en hoy: lo ya
   * vencido se carga al matricular. Ver `corteCargos` en matricula-alta.ts.
   */
  corte?: string;
  /**
   * El alumno, si ya existe. Sirve para que la vista previa aplique su tarifa
   * PERSONAL y no la del grado: al re-matricular a alguien que ya tiene un
   * precio propio, sin esto la pantalla enseñaba un importe y la matrícula
   * nacía con otro.
   */
  estudianteId?: number | null;
  /**
   * Lo que ya se había decidido para este alumno, para volver a enseñarlo al
   * reabrirlo: qué conceptos llevaba marcados y qué precios propios. Sin esto
   * el selector arranca con todo marcado y a precio de la sección. Solo se lee
   * al llegar el plan.
   */
  inicial?: { conceptos?: number[]; precios?: { conceptoId: number; montoCentavos: number }[] };
  /**
   * Llegó el plan. Hasta entonces los conceptos marcados son una lista vacía
   * que no significa «ninguno»: quien guarda lo que dice `onCambio` espera esto.
   */
  onPlan?: (lineas: LineaPlan[]) => void;
  /** Los conceptos marcados, cada vez que cambian. */
  onCambio: (conceptosIds: number[]) => void;
  /**
   * Los precios propios de este alumno, cada vez que cambian. Sin esta prop no
   * se ofrece editarlos: la ficha del alumno ya tiene «Configuración mensual»
   * y no todas las pantallas que matriculan saben persistirlos.
   */
  onPrecios?: (precios: { conceptoId: number; montoCentavos: number; productId: number | null }[]) => void;
}) {
  const [plan, setPlan] = useState<LineaPlan[]>([]);
  // Paquetes del colegio: elegir uno marca sus conceptos de un clic.
  const { data: dataPaquetes } = useSWR<{ paquetes: { id: number; nombre: string; conceptosIds: number[] }[] }>(
    '/api/administracion-escolar/paquetes',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { paquetes: [] })),
    { revalidateOnFocus: false },
  );
  const paquetes = dataPaquetes?.paquetes ?? [];
  const [planCargando, setPlanCargando] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  /**
   * Lo que paga ESTE alumno, cuando no es lo que paga su grado.
   *
   * No todos pagan lo mismo por sala de tareas: el acuerdo se cierra con la
   * madre delante, al matricular. Hasta ahora había que crear la matrícula con
   * la tarifa general e ir después a corregirla a la ficha, y entre una cosa y
   * otra quedaba un precio equivocado con sus cargos ya hechos.
   */
  const [propios, setPropios] = useState<Map<number, number>>(new Map());
  /** El concepto cuyo precio se está escribiendo, y el texto a medio teclear. */
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [borrador, setBorrador] = useState('');
  /** Se va a Cancelar o pulsó Escape: el blur no debe aplicar lo escrito. */
  const cancelando = useRef(false);
  // En una ref: el plan no se vuelve a pedir porque quien lo usa pase otra
  // copia del mismo objeto en cada pintada.
  const inicialRef = useRef(inicial);
  inicialRef.current = inicial;
  const onPlanRef = useRef(onPlan);
  onPlanRef.current = onPlan;

  useEffect(() => {
    if (!periodoId || !cursoId) { setPlan([]); setPlanError(null); return; }
    let vigente = true;
    setPlanCargando(true);
    setPlanError(null);
    const params = new URLSearchParams({ periodoId, cursoId, desde });
    if (estudianteId) params.set('estudianteId', String(estudianteId));
    fetch(`/api/administracion-escolar/matriculas/plan-cobro?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'No se pudo calcular el plan de cobro');
        return data.lineas as LineaPlan[];
      })
      .then((lineas) => {
        if (!vigente) return;
        setPlan(lineas);
        // Marcados los obligatorios: aquí solo aparecen los conceptos con tarifa
        // para este grado, así que ya vienen filtrados por lo que ese grado
        // paga. Los opcionales (uniforme, transporte) llegan sin marcar y se
        // marcan a quien los use; lo dice el colegio en Conceptos.
        const ids = new Set(lineas.map((l) => l.conceptoId));
        const ini = inicialRef.current;
        setMarcados(ini?.conceptos
          ? new Set(ini.conceptos.filter((c) => ids.has(c)))
          : new Set(lineas.filter((l) => !l.opcional).map((l) => l.conceptoId)));
        // Cambió el curso o la fecha: el plan es otro y los precios escritos
        // para el anterior no tienen por qué valer aquí. Los que se traen de
        // antes sí, si su concepto sigue en el plan.
        setPropios(new Map((ini?.precios ?? [])
          .filter((p) => ids.has(p.conceptoId))
          .map((p) => [p.conceptoId, p.montoCentavos])));
        setEditandoId(null);
        onPlanRef.current?.(lineas);
      })
      .catch((e) => { if (vigente) setPlanError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (vigente) setPlanCargando(false); });
    return () => { vigente = false; };
  }, [periodoId, cursoId, desde, estudianteId]);

  useEffect(() => { onCambio([...marcados]); }, [marcados, onCambio]);

  const planEfectivo = useMemo(() => aplicarPreciosPropios(plan, propios), [plan, propios]);

  // Solo los que de verdad cambian algo: si alguien escribe el mismo precio que
  // ya tenía, no hay excepción que guardar.
  useEffect(() => {
    if (!onPrecios) return;
    onPrecios(plan
      .filter((l) => marcados.has(l.conceptoId))
      .flatMap((l) => {
        const propio = propios.get(l.conceptoId);
        return propio == null || propio === l.montoCentavos
          ? []
          : [{ conceptoId: l.conceptoId, montoCentavos: propio, productId: l.productId }];
      }));
  }, [plan, propios, marcados, onPrecios]);

  function abrirPrecio(l: LineaPlan) {
    setEditandoId(l.conceptoId);
    setBorrador((escritoDesdeTarifa(l, propios.get(l.conceptoId) ?? l.montoCentavos) / 100).toFixed(2));
  }

  function guardarPrecio(l: LineaPlan) {
    const centavos = parseDOPaCentavos(borrador);
    if (centavos == null) return;
    const tarifa = tarifaDesdeEscrito(l, centavos);
    setPropios((m) => {
      const n = new Map(m);
      // Volver a la tarifa del grado es quitar la excepción, no guardar el
      // mismo número como si fuera propio.
      if (tarifa === l.montoCentavos) n.delete(l.conceptoId);
      else n.set(l.conceptoId, tarifa);
      return n;
    });
    setEditandoId(null);
  }

  const resumenPlan = useMemo(() => {
    // La misma regla con la que se crean los cargos al guardar: lo que se ve
    // aquí es lo que queda. Se compara la EMISIÓN, igual que el devengo.
    const { ahora, despues } = cuotasAlMatricular(planEfectivo, marcados, corte ?? desde);
    const ahoraCentavos = sumaCentavos(ahora);
    const despuesCentavos = sumaCentavos(despues);
    return {
      ahora: ahoraCentavos, ahoraCargos: ahora.length,
      despues: despuesCentavos, despuesCargos: despues.length,
      total: ahoraCentavos + despuesCentavos,
    };
  }, [planEfectivo, marcados, desde, corte]);

  if (!cursoId) return null;

  return (
            <div className="rounded-lg border border-gray-200">
              <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-sm font-medium text-gray-900">Cargos del año</span>
                {paquetes.length > 0 && plan.length > 0 ? (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    Paquete
                    <select
                      value={paquetes.find((pq) => {
                        const suyos = plan.filter((l) => pq.conceptosIds.includes(l.conceptoId)).map((l) => l.conceptoId);
                        return suyos.length === marcados.size && suyos.every((id) => marcados.has(id));
                      })?.id ?? ''}
                      onChange={(e) => {
                        const pq = paquetes.find((x) => x.id === Number(e.target.value));
                        if (pq) setMarcados(new Set(plan.filter((l) => pq.conceptosIds.includes(l.conceptoId)).map((l) => l.conceptoId)));
                      }}
                      className="h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs text-gray-800 focus:border-zero-500 focus:outline-none">
                      <option value="">— a mano —</option>
                      {paquetes.map((pq) => <option key={pq.id} value={pq.id}>{pq.nombre}</option>)}
                    </select>
                  </label>
                ) : (
                  <span className="text-xs text-gray-500">desmarca lo que no aplique</span>
                )}
              </div>

              {planCargando ? (
                <p className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />Calculando…
                </p>
              ) : planError ? (
                <p className="px-3 py-4 text-sm text-red-600">{planError}</p>
              ) : plan.length === 0 ? (
                <p className="px-3 py-4 text-sm text-gray-500">
                  Este curso no tiene tarifas configuradas. La matrícula se crea igual, sin deuda.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          <th className="w-8 py-2 pl-3">
                            {/* Todos de un clic: marcar los servicios de un niño que lo usa todo, o vaciar para empezar de cero. */}
                            <input type="checkbox" aria-label="Marcar todos los conceptos"
                              title={marcados.size === plan.length ? 'Desmarcar todos' : 'Marcar todos'}
                              checked={plan.length > 0 && marcados.size === plan.length}
                              ref={(el) => { if (el) el.indeterminate = marcados.size > 0 && marcados.size < plan.length; }}
                              onChange={() => setMarcados(marcados.size === plan.length ? new Set() : new Set(plan.map((l) => l.conceptoId)))}
                              className="h-4 w-4 cursor-pointer accent-zero-600" />
                          </th>
                          <th className="py-2 pr-2 text-left font-medium">Concepto</th>
                          <th className="px-2 py-2 text-right font-medium">Cuotas</th>
                          <th className="px-2 py-2 text-right font-medium">Por cuota</th>
                          <th className="px-2 py-2 text-right font-medium">Total del año</th>
                          <th className="w-[72px] py-2 pr-3" aria-label="Acciones" />
                        </tr>
                      </thead>
                      <tbody>
                        {planEfectivo.map((l) => {
                          const activo = marcados.has(l.conceptoId);
                          const base = plan.find((p) => p.conceptoId === l.conceptoId)!;
                          const esPropio = propios.has(l.conceptoId);
                          // La beca ya es un descuento sobre la tarifa; dejar escribir
                          // además un precio propio pone dos mecanismos a pelear por
                          // la misma cifra. Se edita la beca donde se puso la beca.
                          const puedeEditar = !!onPrecios && activo && l.origen !== 'beca';
                          const vivas = l.cuotas.filter((c) => !c.omitida).length;
                          const cuota = porCuotaDe(l);
                          const editando = editandoId === l.conceptoId;
                          const modo = modoPrecio(base);
                          const apagado = activo ? '' : 'opacity-50';
                          const escrito = editando ? parseDOPaCentavos(borrador) : null;
                          return (
                            <Fragment key={l.conceptoId}>
                              <tr className={`align-top ${editando ? '' : 'border-b border-gray-100'} hover:bg-gray-50`}>
                                <td className="py-2.5 pl-3">
                                  <input type="checkbox" checked={activo} aria-label={`Cobrar ${l.nombre}`}
                                    onChange={() => setMarcados((s) => {
                                      const n = new Set(s);
                                      if (n.has(l.conceptoId)) n.delete(l.conceptoId); else n.add(l.conceptoId);
                                      return n;
                                    })}
                                    className="mt-0.5 h-4 w-4 cursor-pointer accent-zero-600" />
                                </td>
                                <td className={`py-2.5 pr-2 ${apagado}`}>
                                  <span className="block text-gray-900">{l.nombre}</span>
                                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                    {cuandoSeCobra(l)}
                                    {l.opcional && (
                                      <span className="rounded bg-gray-100 px-1.5 py-px text-[11px] text-gray-600">opcional</span>
                                    )}
                                    {esPropio && (
                                      <span className="rounded bg-amber-50 px-1.5 py-px text-[11px] text-amber-800">precio propio</span>
                                    )}
                                    {l.origen === 'beca' && (
                                      <span className="rounded bg-zero-50 px-1.5 py-px text-[11px] text-zero-700">con beca</span>
                                    )}
                                  </span>
                                  {l.omitidas > 0 && (
                                    <span className="mt-0.5 block text-xs text-amber-700">
                                      no se le cobran {l.omitidas} cuota(s) de antes de su entrada
                                    </span>
                                  )}
                                </td>
                                <td className={`whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-gray-700 ${apagado}`}>
                                  {l.omitidas > 0 ? `${vivas} de ${l.cuotas.length}` : vivas}
                                </td>
                                <td className={`whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-gray-700 ${apagado}`}>
                                  {cuota == null ? <span className="text-gray-400">varía</span> : fmtRD(cuota)}
                                </td>
                                <td className={`whitespace-nowrap px-2 py-2.5 text-right font-medium tabular-nums text-gray-900 ${apagado}`}>
                                  {fmtRD(l.totalCentavos)}
                                </td>
                                <td className="py-2 pr-3">
                                  {puedeEditar && !editando && (
                                    <div className="flex justify-end gap-1">
                                      {esPropio && (
                                        <Tooltip text={`Vuelve al precio del grado (${fmtRD(escritoDesdeTarifa(base, base.montoCentavos))}${modo === 'cuota' ? ' por cuota' : ''})`}>
                                        <button type="button"
                                          aria-label="Volver al precio del grado"
                                          onClick={() => setPropios((m) => { const n = new Map(m); n.delete(l.conceptoId); return n; })}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                        </Tooltip>
                                      )}
                                      <Tooltip text="Cambia el precio que paga solo este alumno en este concepto"><button type="button" aria-label={`Cambiar precio de ${l.nombre} para este alumno`}
                                        onClick={() => abrirPrecio(base)}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zero-200 text-zero-700 hover:bg-zero-50">
                                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                                      </button></Tooltip>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {editando && (
                                <tr className="border-b border-gray-100 bg-zero-50/40">
                                  <td />
                                  <td colSpan={5} className="pb-3 pr-3 pt-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-xs font-medium text-gray-700">
                                        {modo === 'cuota' ? 'Precio por cuota' : 'Total del año'} para este alumno: RD$
                                      </span>
                                      <input
                                        type="text" inputMode="decimal" autoFocus
                                        value={borrador}
                                        onChange={(e) => setBorrador(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') { e.preventDefault(); guardarPrecio(base); }
                                          if (e.key === 'Escape') { cancelando.current = true; setEditandoId(null); }
                                        }}
                                        /*
                                          Lo escrito se aplica al salir del campo: quien escribía el
                                          precio y pulsaba directo «Crear matrícula» perdía su número.
                                          Salvo si se va a Cancelar o se pulsó Escape: `onMouseDown`
                                          corre antes que el blur, así que la bandera ya está puesta.
                                        */
                                        onBlur={() => {
                                          if (cancelando.current) { cancelando.current = false; return; }
                                          guardarPrecio(base);
                                        }}
                                        className="h-7 w-28 rounded border border-gray-300 bg-white px-2 text-sm tabular-nums focus:border-zero-500 focus:outline-none"
                                      />
                                      <button type="button" onClick={() => guardarPrecio(base)}
                                        className="rounded bg-zero-600 px-2 py-1 text-xs font-medium text-white hover:bg-zero-700">
                                        Aplicar
                                      </button>
                                      <button type="button"
                                        onMouseDown={() => { cancelando.current = true; }}
                                        onClick={() => setEditandoId(null)}
                                        className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700">
                                        Cancelar
                                      </button>
                                      {modo === 'cuota' && vivas > 1 && escrito != null && (
                                        <span className="text-xs text-gray-500">= {fmtRD(escrito * vivas)} en {vivas} cuotas</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-gray-50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-gray-900">Se le carga ahora</span>
                      <span className="text-base font-semibold text-gray-900">{fmtRD(resumenPlan.ahora)}</span>
                    </div>
                    {resumenPlan.despues > 0 && (
                      <div className="mt-1 flex items-baseline justify-between text-gray-500">
                        <span className="text-xs">
                          Resto del año ({resumenPlan.despuesCargos} cuota(s), mes a mes)
                        </span>
                        <span className="text-xs">{fmtRD(resumenPlan.despues)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-baseline justify-between border-t border-gray-200 pt-1 text-gray-600">
                      <span className="text-xs">Compromiso del año</span>
                      <span className="text-xs font-medium">{fmtRD(resumenPlan.total)}</span>
                    </div>
                  </div>
                  <p className="px-3 pb-2.5 pt-2 text-xs text-gray-500">
                    {resumenPlan.ahoraCargos === 0
                      ? 'No se genera ningún cargo todavía.'
                      : `Se generan ${resumenPlan.ahoraCargos} cargo(s) pendientes. No se cobra nada ahora.`}
                    {resumenPlan.despues > 0 && ' Las demás cuotas se generan cuando llega su fecha.'}
                  </p>
                  {propios.size > 0 && (
                    <p className="border-t border-gray-100 px-3 pb-2.5 pt-2 text-xs text-amber-800">
                      {propios.size === 1 ? 'Un concepto lleva' : `${propios.size} conceptos llevan`} precio
                      propio de este alumno: queda como su tarifa y es la que usarán sus cargos de cada mes.
                      La tarifa del grado no cambia para nadie más. Déjalo bien ahora — para un servicio
                      mensual como la sala de tareas, este es el único sitio donde se escribe.
                    </p>
                  )}
                </>
              )}
            </div>
  );
}
