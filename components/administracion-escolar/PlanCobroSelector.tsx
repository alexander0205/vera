'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { cuotasAlMatricular, sumaCentavos } from '@/lib/administracion-escolar/cuotas-al-matricular';

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

interface CuotaPlan {
  cuotaId: number; numero: number; etiqueta: string; mes: number | null;
  fechaEmision: string; fechaVencimiento: string; montoCentavos: number; omitida: boolean;
}

interface LineaPlan {
  conceptoId: number; nombre: string; tipo: string;
  admiteBeca: boolean; montoCentavos: number; origen: string;
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


function resumenCuotas(l: LineaPlan): string {
  const vigentes = l.cuotas.filter((c) => !c.omitida);
  if (vigentes.length === 0) return 'sin cuotas pendientes';

  const primera = vigentes[0];
  // Sin fecha límite no se escribe "vence —": un guion donde debería ir una
  // fecha parece un dato que falta, no una decisión del colegio. Se calla, y
  // así el renglón dice solo lo que hay.
  if (vigentes.length === 1) {
    return primera.fechaVencimiento
      ? `1 pago · vence ${fmtFechaCorta(primera.fechaVencimiento)}`
      : '1 pago';
  }

  const iguales = vigentes.every((c) => c.montoCentavos === primera.montoCentavos);
  const monto = iguales ? ` de ${fmtRD(primera.montoCentavos)}` : '';
  // Para varias cuotas sí hace falta una fecha de referencia: sin ella, "10
  // cuotas" no dice cuándo empiezan. Si no vencen, sirve la de emisión — es el
  // día en que el cargo le aparece a la familia.
  const referencia = primera.fechaVencimiento ?? primera.fechaEmision;
  return `${vigentes.length} cuotas${monto} · desde ${fmtFechaCorta(referencia)}`;
}

export function PlanCobroSelector({ periodoId, cursoId, desde, onCambio, onPrecios }: {
  periodoId: string;
  cursoId: string;
  /** Fecha de inscripción: decide qué cuotas entran ya y cuáles esperan su mes. */
  desde: string;
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

  useEffect(() => {
    if (!periodoId || !cursoId) { setPlan([]); setPlanError(null); return; }
    let vigente = true;
    setPlanCargando(true);
    setPlanError(null);
    const params = new URLSearchParams({ periodoId, cursoId, desde });
    fetch(`/api/administracion-escolar/matriculas/plan-cobro?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'No se pudo calcular el plan de cobro');
        return data.lineas as LineaPlan[];
      })
      .then((lineas) => {
        if (!vigente) return;
        setPlan(lineas);
        // Marcados todos: aquí solo aparecen los conceptos con tarifa para este
        // grado, así que ya vienen filtrados por lo que ese grado paga. Quién es
        // la excepción se sabe con el alumno delante, no al configurar el
        // concepto meses antes.
        setMarcados(new Set(lineas.map((l) => l.conceptoId)));
        // Cambió el curso o la fecha: el plan es otro y los precios escritos
        // para el anterior no tienen por qué valer aquí.
        setPropios(new Map());
        setEditandoId(null);
      })
      .catch((e) => { if (vigente) setPlanError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (vigente) setPlanCargando(false); });
    return () => { vigente = false; };
  }, [periodoId, cursoId, desde]);

  useEffect(() => { onCambio([...marcados]); }, [marcados, onCambio]);

  /**
   * El plan como quedaría con los precios propios puestos.
   *
   * Un precio propio es el de CADA cuota, no el del año: sala de tareas a 1,100
   * son 1,100 al mes. Se reescriben las cuotas vivas y se recalcula el total,
   * para que lo que se enseña abajo sea lo que el alumno va a deber de verdad.
   */
  const planEfectivo = useMemo(() => {
    if (propios.size === 0) return plan;
    return plan.map((l) => {
      const propio = propios.get(l.conceptoId);
      if (propio == null) return l;
      const cuotas = l.cuotas.map((c) => (c.omitida ? c : { ...c, montoCentavos: propio }));
      return {
        ...l,
        montoCentavos: propio,
        cuotas,
        totalCentavos: cuotas.reduce((s, c) => s + (c.omitida ? 0 : c.montoCentavos), 0),
      };
    });
  }, [plan, propios]);

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
    setBorrador(((propios.get(l.conceptoId) ?? l.montoCentavos) / 100).toFixed(2));
  }

  function guardarPrecio(l: LineaPlan) {
    const centavos = Math.round(Number(borrador.replace(',', '.')) * 100);
    if (!Number.isFinite(centavos) || centavos < 0) return;
    setPropios((m) => {
      const n = new Map(m);
      // Volver a la tarifa del grado es quitar la excepción, no guardar el
      // mismo número como si fuera propio.
      if (centavos === l.montoCentavos) n.delete(l.conceptoId);
      else n.set(l.conceptoId, centavos);
      return n;
    });
    setEditandoId(null);
  }

  const resumenPlan = useMemo(() => {
    // La misma regla con la que se crean los cargos al guardar: lo que se ve
    // aquí es lo que queda. Se compara la EMISIÓN, igual que el devengo.
    const { ahora, despues } = cuotasAlMatricular(planEfectivo, marcados, desde);
    const ahoraCentavos = sumaCentavos(ahora);
    const despuesCentavos = sumaCentavos(despues);
    return {
      ahora: ahoraCentavos, ahoraCargos: ahora.length,
      despues: despuesCentavos, despuesCargos: despues.length,
      total: ahoraCentavos + despuesCentavos,
    };
  }, [planEfectivo, marcados, desde]);

  if (!cursoId) return null;

  return (
            <div className="rounded-lg border border-gray-200">
              <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-sm font-medium text-gray-900">Cargos del año</span>
                <span className="text-xs text-gray-500">desmarca lo que no aplique</span>
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
                  {planEfectivo.map((l) => {
                    const activo = marcados.has(l.conceptoId);
                    const base = plan.find((p) => p.conceptoId === l.conceptoId)!;
                    const esPropio = propios.has(l.conceptoId);
                    // La beca ya es un descuento sobre la tarifa; dejar escribir
                    // además un precio propio pone dos mecanismos a pelear por
                    // la misma cifra. Se edita la beca donde se puso la beca.
                    const puedeEditar = !!onPrecios && activo && l.origen !== 'beca';
                    return (
                      <div key={l.conceptoId}
                        className="border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50">
                        <label className="flex cursor-pointer gap-2.5">
                          <input type="checkbox" checked={activo}
                            onChange={() => setMarcados((s) => {
                              const n = new Set(s);
                              if (n.has(l.conceptoId)) n.delete(l.conceptoId); else n.add(l.conceptoId);
                              return n;
                            })}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-zero-600" />
                          <span className={`min-w-0 flex-1 ${activo ? '' : 'opacity-50'}`}>
                            <span className="flex justify-between gap-2">
                              <span className="text-sm text-gray-900">{l.nombre}</span>
                              <span className="whitespace-nowrap text-sm font-medium text-gray-900">
                                {fmtRD(l.totalCentavos)}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500">{resumenCuotas(l)}</span>
                            {l.origen === 'beca' && (
                              <span className="mt-1 inline-block rounded bg-zero-50 px-2 py-0.5 text-[11px] text-zero-700">
                                con beca
                              </span>
                            )}
                            {l.omitidas > 0 && (
                              <span className="mt-1 block text-xs text-amber-700">
                                se omiten {l.omitidas} cuota(s) emitida(s) antes de su entrada
                              </span>
                            )}
                          </span>
                        </label>

                        {puedeEditar && (
                          <div className="mt-1.5 pl-[26px]">
                            {editandoId === l.conceptoId ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">RD$</span>
                                <input
                                  type="text" inputMode="decimal" autoFocus
                                  value={borrador}
                                  onChange={(e) => setBorrador(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); guardarPrecio(base); }
                                    if (e.key === 'Escape') setEditandoId(null);
                                  }}
                                  className="h-7 w-28 rounded border border-gray-300 px-2 text-sm tabular-nums focus:border-zero-500 focus:outline-none"
                                />
                                <button type="button" onClick={() => guardarPrecio(base)}
                                  className="rounded bg-zero-600 px-2 py-1 text-xs font-medium text-white hover:bg-zero-700">
                                  Aplicar
                                </button>
                                <button type="button" onClick={() => setEditandoId(null)}
                                  className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700">
                                  Cancelar
                                </button>
                                <span className="text-xs text-gray-400">por cuota</span>
                              </div>
                            ) : esPropio ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                                  precio propio · {fmtRD(l.montoCentavos)} por cuota
                                </span>
                                <button type="button" onClick={() => abrirPrecio(base)}
                                  className="text-xs text-zero-700 hover:underline">Cambiar</button>
                                <button type="button"
                                  onClick={() => setPropios((m) => {
                                    const n = new Map(m); n.delete(l.conceptoId); return n;
                                  })}
                                  className="text-xs text-gray-500 hover:text-gray-700">
                                  Volver a {fmtRD(base.montoCentavos)}
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => abrirPrecio(base)}
                                className="text-xs text-gray-500 hover:text-zero-700 hover:underline">
                                {fmtRD(l.montoCentavos)} por cuota · poner otro precio para este alumno
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
