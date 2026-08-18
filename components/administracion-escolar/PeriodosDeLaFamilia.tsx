'use client';

/**
 * Los meses de todos los hijos, juntos y separados por hijo.
 *
 * La ficha de la familia enseñaba de los períodos una sola línea —«sin plan»,
 * «se factura sola el día 5»— y todo lo demás obligaba a entrar hijo por hijo.
 * Pero el cobro no es por alumno: el padre llama una vez y pregunta por los
 * dos, y facturarle junto era imposible sin ir marcando cargos en dos
 * pantallas distintas.
 *
 * Aquí se ven los mismos meses que en cada ficha, con la misma cuenta —viene
 * todo de `fichaEstudiante`—, y se pueden marcar de los dos hijos a la vez
 * para hacer UNA factura. Que quepan juntos ya lo decide el prefill: el mismo
 * responsable de pago es justo la condición que cumplen por definición todos
 * los que salen en esta pantalla.
 *
 * Los previstos van aparte del marcado múltiple a propósito: una cuota que
 * todavía no es cargo entra en la factura como línea nueva y el motor solo
 * admite una por documento. Ofrecer diez casillas que luego fallan es peor
 * que ofrecer un botón por fila.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarDays, FileText, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { HijoConPeriodos, FilaMes } from '@/lib/administracion-escolar/periodos-familia';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo cargar');
  return r.json();
});

/** Marcable = es deuda de verdad y todavía no está en ninguna factura. */
function marcable(f: FilaMes): boolean {
  return f.tipo === 'cargo' && f.cargoId != null && f.ecfDocumentId == null && f.saldoCentavos > 0;
}

function EstadoBadge({ fila, hoy }: { fila: FilaMes; hoy: string }) {
  if (fila.tipo === 'previsto') {
    return <Badge variant="outline" className="border-gray-200 text-gray-500">Previsto</Badge>;
  }
  if (fila.saldoCentavos <= 0) {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Pagado</Badge>;
  }
  if (fila.fechaVencimiento && fila.fechaVencimiento < hoy) {
    return <Badge className="border-red-200 bg-red-50 text-red-700">Vencido</Badge>;
  }
  if (fila.saldoCentavos < fila.montoCentavos) {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Parcial</Badge>;
  }
  if (fila.ecfDocumentId == null) {
    return <Badge variant="outline" className="border-violet-200 text-violet-700">Sin facturar</Badge>;
  }
  return <Badge variant="outline" className="border-gray-200 text-gray-600">Pendiente</Badge>;
}

export function PeriodosDeLaFamilia({ clientId, puedeFacturar, onFacturar, onFacturarPrevisto }: {
  clientId: number;
  puedeFacturar: boolean;
  /** Recibe los cargos marcados de todos los hijos, para una sola factura. */
  onFacturar: (cargoIds: number[]) => void;
  /** Una cuota que todavía no es cargo: se crea al confirmar, no al abrir. */
  onFacturarPrevisto: (p: { matriculaId: number; cuotaId: number; conceptoId: number }) => void;
}) {
  const { data, error, isLoading } = useSWR<{ hijos: HijoConPeriodos[] }>(
    `/api/administracion-escolar/responsables/${clientId}/periodos`, traer,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  /** Qué período mira cada hijo. Por defecto, el año en curso. */
  const [abierto, setAbierto] = useState<Record<number, number>>({});
  const [marcados, setMarcados] = useState<Set<number>>(new Set());

  const hoy = new Date().toISOString().slice(0, 10);
  const hijos = data?.hijos ?? [];

  /**
   * Lo marcado que TODAVÍA se puede facturar, y su resumen.
   *
   * La marca se cruza contra los datos frescos en vez de fiarse del estado:
   * al crear la factura, esos cargos dejan de ser marcables y la marca se cae
   * sola. Guardándola suelta, la barra seguía diciendo «3 cargos · RD$2,200»
   * encima de tres cargos ya facturados, y volver a pulsar los facturaba otra
   * vez. Vale igual si los factura otro desde otra pantalla.
   *
   * Cuenta los hijos además de los cargos: «3 cargos de 2 hijos» es lo que
   * distingue esta pantalla de la del alumno, y es lo que hay que confirmar
   * antes de emitir una factura que va a llevar dos nombres dentro.
   */
  const resumen = useMemo(() => {
    let total = 0;
    const ids: number[] = [];
    const conMarca = new Set<number>();
    for (const h of hijos) {
      for (const p of h.periodos) {
        for (const f of p.filas) {
          if (f.cargoId != null && marcados.has(f.cargoId) && marcable(f)) {
            ids.push(f.cargoId);
            total += f.saldoCentavos;
            conMarca.add(h.estudianteId);
          }
        }
      }
    }
    return { ids, cargos: ids.length, hijos: conMarca.size, total };
  }, [hijos, marcados]);

  function alternar(cargoId: number) {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(cargoId)) next.delete(cargoId); else next.add(cargoId);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-xl border border-gray-200 bg-white py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
        No se pudieron cargar los meses de sus hijos.
      </div>
    );
  }
  if (hijos.length === 0) return null;

  return (
    <div className="space-y-4">
      {hijos.map((h) => {
        const periodos = h.periodos;
        if (periodos.length === 0) {
          return (
            <div key={h.estudianteId} className="rounded-xl border border-gray-200 bg-white">
              <CabeceraHijo hijo={h} />
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                Sin matrícula: no tiene meses que cobrar todavía.
              </p>
            </div>
          );
        }

        const sel = abierto[h.estudianteId] ?? periodos[0].matriculaId;
        const p = periodos.find((x) => x.matriculaId === sel) ?? periodos[0];

        return (
          <div key={h.estudianteId} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <CabeceraHijo
              hijo={h}
              periodos={periodos}
              sel={p.matriculaId}
              onPeriodo={(m) => setAbierto((prev) => ({ ...prev, [h.estudianteId]: m }))}
            />

            {/* La mensualidad automática, en su período y no en una lista aparte:
                es lo que explica por qué estos meses van a ir saliendo solos —o
                por qué no van a salir, que es lo que nadie descubre a tiempo. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-xs">
              <span className="font-medium text-gray-500">{p.curso}</span>
              {!p.facturaRecurrenteId ? (
                <span className="text-amber-700">
                  Sin mensualidad automática: sus meses hay que facturarlos a mano
                </span>
              ) : (
                <>
                  <Badge className={p.recurrenteEstado === 'activa'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'}>
                    {p.recurrenteEstado === 'activa' ? 'Se factura sola' : (p.recurrenteEstado ?? 'pausada')}
                  </Badge>
                  {p.recurrenteDiaCobro != null && (
                    <span className="text-gray-500">cada día {p.recurrenteDiaCobro}</span>
                  )}
                  {p.recurrenteProxima && (
                    <span className="text-gray-500">· próxima {fmtFechaCorta(p.recurrenteProxima)}</span>
                  )}
                </>
              )}
              <span className="ml-auto text-gray-500">
                Debe <b className={p.pendienteCentavos > 0 ? 'text-red-600' : 'text-gray-700'}>
                  {fmtDOP(p.pendienteCentavos)}
                </b>
              </span>
            </div>

            {p.filas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                Este período no tiene meses configurados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500">
                      <th className="w-9 px-3 py-2" />
                      <th className="px-3 py-2 font-medium">Mes</th>
                      <th className="px-3 py-2 font-medium">Concepto</th>
                      <th className="px-3 py-2 font-medium">Vence</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 text-right font-medium">Monto</th>
                      <th className="px-3 py-2 text-right font-medium">Pendiente</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {p.filas.map((f) => {
                      const sePuede = puedeFacturar && marcable(f);
                      const marcado = f.cargoId != null && marcados.has(f.cargoId);
                      return (
                        <tr key={f.key} className={marcado ? 'bg-violet-50/60' : undefined}>
                          <td className="px-3 py-2">
                            {sePuede && (
                              <input type="checkbox" checked={marcado}
                                onChange={() => alternar(f.cargoId!)}
                                aria-label={`Marcar ${f.concepto} de ${h.alumno}`}
                                className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-violet-600" />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-900">
                            {f.mes ? `${MESES[f.mes]} ${f.anio}` : String(f.anio)}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{f.concepto}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                            {f.fechaVencimiento ? fmtFechaCorta(f.fechaVencimiento) : '—'}
                          </td>
                          <td className="px-3 py-2"><EstadoBadge fila={f} hoy={hoy} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700">
                            {fmtDOP(f.montoCentavos)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {f.tipo === 'previsto'
                              ? <span className="text-gray-400">—</span>
                              : <span className={f.saldoCentavos > 0 ? 'font-medium text-red-600' : 'text-gray-400'}>
                                  {f.saldoCentavos > 0 ? fmtDOP(f.saldoCentavos) : '—'}
                                </span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {f.ecfDocumentId != null ? (
                              <Link href={`/dashboard/facturas/${f.ecfDocumentId}`}
                                className="inline-flex items-center gap-1 text-xs text-zero-600 hover:underline">
                                <FileText className="h-3 w-3" />
                                {f.encf ?? f.codigo ?? 'Factura'}
                              </Link>
                            ) : f.tipo === 'previsto' && puedeFacturar && f.cuotaId != null && f.conceptoId != null ? (
                              // Adelantar un mes que aún no ha salido: el cargo se
                              // crea al confirmar la factura, no al pulsar aquí.
                              <button type="button"
                                onClick={() => onFacturarPrevisto({
                                  matriculaId: p.matriculaId, cuotaId: f.cuotaId!, conceptoId: f.conceptoId!,
                                })}
                                className="text-xs text-zero-600 hover:underline">
                                Adelantar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {p.previstoCentavos > 0 && (
              <p className="border-t border-gray-100 px-4 py-2 text-right text-xs text-gray-500">
                Previsto para el resto del período <b className="text-gray-700">{fmtDOP(p.previstoCentavos)}</b>
                {' '}· aún no facturado, no cuenta como deuda
              </p>
            )}
          </div>
        );
      })}

      {/* La barra solo aparece con algo marcado, y dice CUÁNTOS HIJOS entran:
          es lo único que avisa de que se está a punto de emitir una factura
          con dos nombres dentro. */}
      {resumen.cargos > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-violet-300 bg-white px-4 py-3 shadow-lg">
          <Receipt className="h-4 w-4 shrink-0 text-violet-600" />
          <span className="text-sm text-gray-700">
            <b className="text-gray-900">{resumen.cargos}</b> cargo{resumen.cargos === 1 ? '' : 's'}
            {resumen.hijos > 1 && <> de <b className="text-gray-900">{resumen.hijos}</b> hijos</>}
            {' · '}<b className="text-gray-900">{fmtDOP(resumen.total)}</b>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>Quitar marcas</Button>
            <Button size="sm" onClick={() => onFacturar(resumen.ids)}>
              <Receipt className="mr-1.5 h-4 w-4" />
              Facturar juntos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CabeceraHijo({ hijo, periodos, sel, onPeriodo }: {
  hijo: HijoConPeriodos;
  periodos?: HijoConPeriodos['periodos'];
  sel?: number;
  onPeriodo?: (matriculaId: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zero-100 text-[10px] font-semibold text-zero-700">
        {hijo.alumno.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
      </span>
      <Link href={`/escolar/estudiantes/${hijo.estudianteId}`}
        className="font-semibold text-gray-900 hover:text-zero-700 hover:underline">
        {hijo.alumno}
      </Link>
      {/* El selector solo si hay más de un año: con uno solo es ruido. */}
      {periodos && periodos.length > 1 && onPeriodo && (
        <div className="ml-auto flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
          <NativeSelect value={String(sel)} onChange={(e) => onPeriodo(Number(e.target.value))}
            className="h-7 w-40 text-xs">
            {periodos.map((p) => (
              <option key={p.matriculaId} value={p.matriculaId}>
                {p.periodo}{p.activo ? ' · en curso' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}
