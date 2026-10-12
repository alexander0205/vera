'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarRange, Loader2, Lock, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  cuantasCuotas, generarCalendario, repartirMilesimasEntre, vencimientoDe, type Frecuencia,
} from '@/lib/administracion-escolar/calendario';

/**
 * El calendario de cobro de un concepto: cuándo sale cada factura y por cuánto.
 *
 * Hasta ahora estas filas se sembraban con SQL a mano y no había pantalla que
 * las enseñara: el colegio de pruebas terminó con diez mensualidades en un año
 * de doce meses sin que nadie se enterara. Aquí se generan desde la frecuencia
 * y el largo del año escolar, y se pueden corregir fila a fila —que es lo que
 * de verdad hace falta, porque siempre hay un mes en que el colegio factura
 * distinto (la de diciembre antes de vacaciones, la de junio con la graduación).
 *
 * Se enseñan las DOS fechas. El colegio configura la emisión y el padre vive el
 * vencimiento; con una sola columna, cada vez que alguien cambiaba los días
 * para pagar había que hacer la resta mentalmente para saber qué le llegaba.
 */

export interface FilaCuota {
  /** Nulo mientras no se haya guardado: es lo que distingue alta de edición. */
  id: number | null;
  numero: number;
  etiqueta: string;
  mes: number | null;
  fechaEmision: string;
  porcentajeMilesimas: number;
  /** Cuántos alumnos ya tienen un cargo de esta cuota. > 0 la deja intocable. */
  cargos: number;
}

interface PeriodoCalendario {
  id: number;
  nombre: string;
  fechaInicio: string | null;
  fechaFin: string | null;
}

interface Respuesta {
  periodo: PeriodoCalendario | null;
  cuotas: (Omit<FilaCuota, 'id'> & { id: number })[];
}

const fmtFecha = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

const pct = (milesimas: number) => (milesimas / 1000);

/** Lo que el concepto puede pedirle al calendario al guardarse. */
export interface ApiCalendario {
  /** Manda el PUT si hay cambios sin guardar. Lanza si el servidor lo rechaza. */
  guardar: () => Promise<void>;
  /** Vuelve a bajarlo del servidor. */
  recargar: () => Promise<void>;
  sucio: boolean;
}

export function CalendarioCuotas({
  conceptoId, nombre, frecuencia, diaEmision, diasParaPago, api,
}: {
  conceptoId: number;
  /** Cómo se llama el concepto: es la etiqueta de la cuota del pago único. */
  nombre: string;
  /**
   * Buzón por el que el concepto guarda su calendario. Aquí no hay botón
   * propio: dos botones de guardar en la misma pantalla se confunden, y el
   * trabajo de uno se perdía al pulsar el otro.
   */
  api: React.MutableRefObject<ApiCalendario | null>;
  frecuencia: Frecuencia;
  diaEmision: number;
  /** Nulo = el concepto no vence; entonces emisión y "vence" son lo mismo. */
  diasParaPago: number | null;
}) {
  const [periodo, setPeriodo] = useState<PeriodoCalendario | null>(null);
  const [filas, setFilas] = useState<FilaCuota[]>([]);
  const [guardadas, setGuardadas] = useState<FilaCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/conceptos/${conceptoId}/cuotas`, { cache: 'no-store' });
      const j: Respuesta = await r.json();
      setPeriodo(j.periodo ?? null);
      const lista = (j.cuotas ?? []).map((c) => ({ ...c, id: c.id as number | null }));
      setFilas(lista);
      setGuardadas(lista);
      setError(null);
    } catch {
      setError('No se pudo cargar el calendario.');
    } finally {
      setCargando(false);
    }
  }, [conceptoId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const facturadas = useMemo(() => filas.filter((f) => f.cargos > 0).length, [filas]);
  const sumaMilesimas = filas.reduce((a, f) => a + f.porcentajeMilesimas, 0);
  const cuadra = filas.length === 0 || sumaMilesimas === 100_000;
  const sugeridas = cuantasCuotas(frecuencia, periodo?.fechaInicio, periodo?.fechaFin);

  const sucio = useMemo(
    () => JSON.stringify(filas) !== JSON.stringify(guardadas),
    [filas, guardadas],
  );

  /**
   * Rehace el calendario desde la frecuencia.
   *
   * Las cuotas ya facturadas se quedan enteras —fecha, etiqueta y parte—:
   * reescribir una cuota que ya es deuda de un padre cambiaría por detrás lo
   * que se le cobró. El año se rehace desde donde se quedaron, y lo que queda
   * por repartir es el 100% menos lo que esas cuotas ya se llevaron; si no, el
   * calendario nuevo sumaría de más y el colegio cobraría el año dos veces a
   * medias.
   */
  function regenerar() {
    const nuevas = generarCalendario({
      frecuencia, diaEmision, nombre,
      fechaInicio: periodo?.fechaInicio, fechaFin: periodo?.fechaFin,
    });
    if (nuevas.length === 0) {
      setError('El año escolar no tiene fechas de inicio y fin. Ponlas en Estructura y vuelve.');
      return;
    }
    const intocables = filas.filter((f) => f.cargos > 0);

    // "Una sola vez" quiere decir una, no una más. El reparto de abajo mira la
    // fecha de la última factura y deja pasar cualquier cuota posterior; con
    // frecuencia periódica eso es lo correcto (quedan meses por cobrar), pero
    // en un pago único la única cuota que existía ya se facturó y la nueva
    // saldría a cobrar la inscripción por segunda vez.
    if (frecuencia === 'unico' && intocables.length > 0) {
      setError('Este concepto se cobra una sola vez y esa vez ya se facturó. Para cobrarlo otra vez, hace falta un concepto aparte.');
      return;
    }

    const usado = intocables.reduce((a, f) => a + f.porcentajeMilesimas, 0);
    const ultima = intocables.reduce((max, f) => (f.fechaEmision > max ? f.fechaEmision : max), '');
    // Solo lo que cae después de la última factura emitida: lo de antes ya pasó
    // y volver a ponerlo cobraría dos veces el mismo mes.
    const pendientes = nuevas.filter((c) => c.fechaEmision > ultima);

    if (pendientes.length === 0 || usado >= 100_000) {
      setError('Este concepto ya se facturó entero. No queda nada del año por rehacer.');
      return;
    }
    setError(null);

    const partes = repartirMilesimasEntre(100_000 - usado, pendientes.length);
    setFilas(renumerar([
      ...intocables,
      ...pendientes.map((c, i) => ({
        id: null, numero: c.numero, etiqueta: c.etiqueta, mes: c.mes,
        fechaEmision: c.fechaEmision, porcentajeMilesimas: partes[i], cargos: 0,
      })),
    ]));
  }

  function renumerar(lista: FilaCuota[]): FilaCuota[] {
    return [...lista]
      .sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision))
      .map((f, i) => ({ ...f, numero: i + 1 }));
  }

  function editar(i: number, campo: keyof FilaCuota, valor: string | number) {
    setFilas((xs) => xs.map((f, k) => (k === i ? { ...f, [campo]: valor } : f)));
  }

  /**
   * Quita una cuota del calendario y reparte lo suyo entre las que quedan.
   *
   * Sin el reparto, borrar noviembre dejaría el año sumando 90% y el colegio
   * cobraría de menos sin enterarse —el aviso de que no cuadra está abajo del
   * todo, en rojo pequeño—. Lo liberado va solo a las que todavía no se
   * facturaron: subirle el porcentaje a una cuota que ya es deuda de un padre
   * cambiaría por detrás lo que se le cobró.
   *
   * Si todas las que quedan están facturadas no se reparte nada y el total
   * queda corto a propósito: es una situación que el colegio tiene que ver y
   * resolver a mano, no algo que se pueda cuadrar solo.
   */
  function quitar(i: number) {
    setFilas((xs) => {
      const fuera = xs[i];
      if (!fuera || fuera.cargos > 0) return xs;
      const quedan = xs.filter((_, k) => k !== i);
      const libres = quedan.filter((f) => f.cargos === 0);
      if (libres.length === 0) return renumerar(quedan);

      const suelto = fuera.porcentajeMilesimas;
      const reparto = repartirMilesimasEntre(
        libres.reduce((a, f) => a + f.porcentajeMilesimas, 0) + suelto,
        libres.length,
      );
      let n = 0;
      return renumerar(quedan.map((f) => (
        f.cargos === 0 ? { ...f, porcentajeMilesimas: reparto[n++] } : f
      )));
    });
  }

  /**
   * Guardar el concepto guarda también su calendario.
   *
   * El padre llama a `api.current.guardar()` desde su propio manejador. La
   * primera versión iba por un contador y un efecto, y no funcionaba: cuando el
   * efecto llegaba a leer `sucio` ya era falso, así que en vez de mandar el PUT
   * recargaba —y el mes borrado reaparecía sin un solo error por ningún lado.
   * Llamarlo directo quita el problema de raíz: no hay orden de efectos que
   * adivinar.
   *
   * Se registra en cada render, sin lista de dependencias, para que la función
   * guardada siempre vea las filas de ahora y no las del render en que se creó.
   */
  useEffect(() => {
    api.current = {
      guardar: async () => { if (sucio) await guardar(); },
      recargar: cargar,
      sucio,
    };
  });

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/administracion-escolar/conceptos/${conceptoId}/cuotas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodoId: periodo?.id, cuotas: renumerar(filas) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar el calendario');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el calendario');
      // Se relanza para que «Guardar cambios» no diga que guardó. Un fallo aquí
      // solo se veía en este recuadro, y el botón de arriba quedaba tan
      // contento: el colegio se iba creyendo que el calendario estaba puesto.
      throw e;
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />Cargando el calendario…
      </p>
    );
  }

  if (!periodo) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No hay un año escolar activo. Créalo en <b>Estructura</b> para poder armar el calendario.
      </p>
    );
  }

  const sinFechas = !periodo.fechaInicio || !periodo.fechaFin;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarRange className="h-3.5 w-3.5" />
          {periodo.nombre}
          {sinFechas
            ? ' · sin fechas configuradas'
            : ` · ${fmtFecha(periodo.fechaInicio!)} a ${fmtFecha(periodo.fechaFin!)}`}
        </span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={regenerar} disabled={sinFechas}>
          <Wand2 className="h-3.5 w-3.5" />
          {filas.length === 0 ? 'Generar calendario' : 'Rehacer'}
          {!sinFechas && sugeridas > 0 && (
            <span className="text-xs text-gray-400">({sugeridas} cuota{sugeridas === 1 ? '' : 's'})</span>
          )}
        </Button>
      </div>

      {sinFechas && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El año escolar <b>{periodo.nombre}</b> no tiene fecha de inicio ni de fin, y de ahí sale cuántas
          cuotas caben. Ponlas en <b>Estructura</b>, con el lápiz de la fila del año.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
          Sin calendario. Se le cobrará todo de una vez el día que se matricule el alumno.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="w-8 px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Cuota</th>
                <th className="px-2 py-1.5 font-medium">Se emite</th>
                <th className="px-2 py-1.5 font-medium">Vence</th>
                <th className="w-8 px-2 py-1.5"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f, i) => {
                const bloqueada = f.cargos > 0;
                return (
                  <tr key={f.id ?? `nueva-${i}`} className={bloqueada ? 'bg-gray-50/60' : ''}>
                    <td className="px-2 py-1.5 text-xs tabular-nums text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        {bloqueada && <Lock className="h-3 w-3 shrink-0 text-gray-400" aria-label="ya facturada" />}
                        <Input className="h-7 min-w-0" value={f.etiqueta} disabled={bloqueada}
                          onChange={(e) => editar(i, 'etiqueta', e.target.value)} />
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="date" className="h-7 w-[9.5rem]" value={f.fechaEmision} disabled={bloqueada}
                        onChange={(e) => editar(i, 'fechaEmision', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5 text-xs tabular-nums text-gray-600">
                      {/* Sin días para pagar no hay fecha límite: se dice, en
                          vez de enseñar la de emisión como si venciera hoy. */}
                      {vencimientoDe(f.fechaEmision, diasParaPago) === null
                        ? <span className="text-gray-400">sin vencimiento</span>
                        : fmtFecha(vencimientoDe(f.fechaEmision, diasParaPago)!)}
                    </td>
                    <td className="px-2 py-1.5">
                      {/* Las facturadas no se quitan: la cuota es la deuda que
                          un padre ya tiene, y borrar la fila no borra el cargo
                          —lo dejaría apuntando a algo que no existe. */}
                      <button type="button" onClick={() => quitar(i)} disabled={bloqueada}
                        title={bloqueada ? 'Ya facturada: no se puede quitar' : 'Quitar esta cuota'}
                        aria-label={`Quitar ${f.etiqueta}`}
                        className="rounded p-1 text-gray-300 enabled:hover:bg-red-50 enabled:hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* El reparto del año no se enseña ni se edita: sale solo, a
                  partes iguales entre las cuotas que quedan sin facturar. Lo
                  que el colegio decide aquí son las FECHAS; el monto de cada
                  mes depende de la tarifa de cada grado y se ve en Tarifas. */}
              <tr className="border-t border-gray-100 bg-gray-50 text-xs">
                <td colSpan={5} className="px-2 py-1.5 text-gray-500">
                  {filas.length === 1
                    ? 'Se le cobra todo el año en esta única fecha.'
                    : `El año se reparte en ${filas.length} cobros iguales. El monto de cada uno sale de la tarifa del grado.`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* El guardarraíl. No se avisa al pulsar sino desde que se abre: quien ve
          "hay cuotas facturadas" antes de tocar nada no intenta rehacer el año. */}
      {facturadas > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {facturadas} cuota(s) ya se le facturaron a algún alumno y quedan bloqueadas. Cambiar la
            frecuencia solo rehace lo que todavía no se ha cobrado: la deuda que ya existe no se
            reescribe por detrás.
          </span>
        </p>
      )}

      {!cuadra && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Las partes suman {pct(sumaMilesimas).toFixed(2)}% y tienen que sumar 100%, o el año se
          cobraría incompleto.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {/* Sin botón de guardar propio: lo guarda el "Guardar cambios" del
          concepto. Antes había dos, y el de abajo del todo era el único que
          guardaba el calendario — quitabas un mes, pulsabas el otro, y el mes
          volvía. Parecía que borrar no funcionaba. */}
      {sucio && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-amber-700">
            {guardando ? 'Guardando el calendario…' : 'Sin guardar. Pulsa «Guardar cambios» abajo.'}
          </span>
          <Button size="sm" variant="outline" className="h-8"
            onClick={() => { setFilas(guardadas); setError(null); }}>
            Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
