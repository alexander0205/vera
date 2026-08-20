'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';

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
}

/** Último día del mes de una fecha ISO: hasta ahí se cobra al matricular. */
function finDeMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
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

export function PlanCobroSelector({ periodoId, cursoId, desde, onCambio }: {
  periodoId: string;
  cursoId: string;
  /** Fecha de inscripción: decide qué cuotas entran ya y cuáles esperan su mes. */
  desde: string;
  /** Los conceptos marcados, cada vez que cambian. */
  onCambio: (conceptosIds: number[]) => void;
}) {
  const [plan, setPlan] = useState<LineaPlan[]>([]);
  const [planCargando, setPlanCargando] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());

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
      })
      .catch((e) => { if (vigente) setPlanError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (vigente) setPlanCargando(false); });
    return () => { vigente = false; };
  }, [periodoId, cursoId, desde]);

  useEffect(() => { onCambio([...marcados]); }, [marcados, onCambio]);

  const resumenPlan = useMemo(() => {
    const corte = finDeMes(desde);
    let ahora = 0, ahoraCargos = 0, despues = 0, despuesCargos = 0;
    for (const l of plan) {
      if (!marcados.has(l.conceptoId)) continue;
      for (const c of l.cuotas) {
        if (c.omitida) continue;
        // Se compara la EMISIÓN, igual que el devengo: lo que se le carga hoy
        // es lo que ya se le habría facturado, no lo que ya se le venció.
        if (c.fechaEmision <= corte) { ahora += c.montoCentavos; ahoraCargos++; }
        else { despues += c.montoCentavos; despuesCargos++; }
      }
    }
    return { ahora, ahoraCargos, despues, despuesCargos, total: ahora + despues };
  }, [plan, marcados, desde]);

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
                  {plan.map((l) => {
                    const activo = marcados.has(l.conceptoId);
                    return (
                      <label key={l.conceptoId}
                        className="flex cursor-pointer gap-2.5 border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50">
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
                    {resumenPlan.despues > 0 && ' Las demás cuotas se generan al llegar su mes.'}
                  </p>
                </>
              )}
            </div>
  );
}
