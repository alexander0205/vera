'use client';

import { Check } from 'lucide-react';
import {
  conceptosDelMes, describirCalendario, listaDeMeses, marcarVarios, resumenPorMes,
  type ConceptoCatalogo, type CuotaCalendario, type PendienteMes,
} from '@/lib/administracion-escolar/facturar-lote';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Paso 2 de «Facturar por lote»: qué se factura.
 *
 * Tres preguntas, en el orden en que la secretaria las piensa, y debajo una
 * frase que dice qué va a pasar:
 *
 *  - **¿Qué conceptos?** Primero los que tienen algo sin factura, con cuántos
 *    cargos y cuánto suman, y debajo cómo cobra cada uno según su calendario
 *    («10 cuotas · agosto a mayo», «Pago único · octubre»). Los que hoy no tienen nada pendiente van plegados:
 *    se pueden facturar por adelantado, pero con quince en la lista taparían
 *    los que importan.
 *  - **¿Qué meses?** Los meses del año escolar, cada uno con QUÉ CONCEPTO
 *    entra ese mes —sus cargos pendientes, o la cuota que su calendario tiene
 *    ese mes y se crea al facturar— y si está atrasado, es el de este mes o va
 *    por adelantado. Cada concepto tiene su calendario: un mes sin nada de los
 *    conceptos marcados dice «Nada que facturar» y no se puede marcar. Antes era «Cuotas emitidas hasta» y una
 *    fecha: nadie sabía qué meses entraban hasta ver la revisión, y a algunas
 *    familias se les factura un mes concreto (octubre y noviembre juntos, por
 *    ejemplo) aunque deban otros. El corte se calcula solo de los meses.
 *  - **¿Juntar hermanos?** Apagado, una factura por alumno — como lo pidió el
 *    colegio. Encendido, una por responsable de pago.
 *
 * La frase de abajo (`aria-live`) se lee sola al cambiar algo: quien no ve la
 * pantalla se entera de lo que marcó.
 */

const CASILLA = 'h-4 w-4 shrink-0 accent-zero-600';
const MESES_CORTOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** 'todo' = todo lo pendiente hasta hoy, sin filtrar por mes (lo de siempre). */
export type SeleccionMeses = 'todo' | Set<string>;

export function PasoConceptosLote({
  conceptos, seleccionados, onConceptos, alumnos, pendientes, calendario, meses, hoy, mesesSel, onMeses, juntar, onJuntar,
}: {
  conceptos: ConceptoCatalogo[];
  seleccionados: Set<number>;
  onConceptos: (siguiente: Set<number>) => void;
  /** Los alumnos marcados en el paso 1: los números de cada mes son solo suyos. */
  alumnos: Set<number>;
  pendientes: PendienteMes[];
  /** El calendario de cada concepto: con qué meses cobra. */
  calendario: CuotaCalendario[];
  /** Los meses del año escolar ('YYYY-MM'). */
  meses: { valor: string; texto: string }[];
  hoy: string;
  mesesSel: SeleccionMeses;
  onMeses: (s: SeleccionMeses) => void;
  juntar: boolean;
  onJuntar: (juntar: boolean) => void;
}) {
  const conPendientes = conceptos.filter((c) => c.sinFactura > 0);
  const sinPendientes = conceptos.filter((c) => c.sinFactura === 0);
  const todos = conceptos.length > 0 && conceptos.every((c) => seleccionados.has(c.id));

  const esteMes = hoy.slice(0, 7);
  const porMes = resumenPorMes(pendientes, alumnos, seleccionados);
  const nombreDe = new Map(conceptos.map((c) => [c.id, c.nombre]));
  /** Lo de cada mes, concepto por concepto. En un mes pasado, una cuota sin cargo pendiente ya no es nada que facturar. */
  const delMes = new Map(meses.map((m) => {
    const lineas = conceptosDelMes(m.valor, pendientes, calendario, alumnos, seleccionados)
      .filter((l) => l.cargos > 0 || (l.cuota && m.valor >= esteMes));
    return [m.valor, lineas] as const;
  }));
  const hastaHoy = meses.filter((m) => m.valor <= esteMes).map((m) => m.valor);
  const marcados = mesesSel === 'todo' ? new Set(hastaHoy) : mesesSel;
  const siguiente = meses.find((m) => m.valor > esteMes)?.valor ?? null;

  const alternar = (valor: string) => {
    if ((delMes.get(valor) ?? []).length === 0 && !marcados.has(valor)) return;
    const s = new Set(marcados);
    if (s.has(valor)) s.delete(valor); else s.add(valor);
    onMeses(s);
  };

  // Lo que dice la frase de abajo.
  const elegidos = [...marcados].sort();
  const sumaDe = (lista: string[]) => lista.reduce((acc, m) => {
    const x = porMes.get(m);
    return { cargos: acc.cargos + (x?.cargos ?? 0), centavos: acc.centavos + (x?.centavos ?? 0) };
  }, { cargos: 0, centavos: 0 });
  const dentro = mesesSel === 'todo'
    ? sumaDe([...porMes.keys()].filter((m) => m <= esteMes))
    : sumaDe(elegidos);
  const adelantados = elegidos.filter((m) => m > esteMes);
  const quedanFuera = mesesSel === 'todo'
    ? []
    : [...porMes.keys()].filter((m) => !marcados.has(m) && m <= (elegidos.at(-1) ?? esteMes)).sort();
  const fuera = sumaDe(quedanFuera);
  // Concepto por concepto, qué meses entran: lo que más importa leer antes de revisar.
  const mesesDentro = mesesSel === 'todo' ? meses.map((m) => m.valor).filter((m) => m <= esteMes) : elegidos;
  const porConcepto = new Map<number, string[]>();
  for (const m of mesesDentro) {
    for (const l of delMes.get(m) ?? []) porConcepto.set(l.conceptoId, [...(porConcepto.get(l.conceptoId) ?? []), m]);
  }

  const preset = (activo: boolean, texto: string, accion: () => void) => (
    <button type="button" aria-pressed={activo} onClick={accion}
      className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zero-500 focus-visible:ring-offset-1 ${
        activo ? 'border-zero-600 bg-zero-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}>
      {texto}
    </button>
  );
  const soloEste = mesesSel !== 'todo' && elegidos.length === 1 && elegidos[0] === esteMes;
  const esteYSiguiente = mesesSel !== 'todo' && siguiente != null
    && elegidos.length === 2 && elegidos[0] === esteMes && elegidos[1] === siguiente;

  const filaConcepto = (c: ConceptoCatalogo) => (
    <li key={c.id}>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
        <input type="checkbox" className={CASILLA} checked={seleccionados.has(c.id)}
          onChange={() => onConceptos(marcarVarios(seleccionados, [c.id], !seleccionados.has(c.id)))} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-gray-900">{c.nombre}</span>
          <span className="block truncate text-xs text-gray-500">{describirCalendario(calendario.filter((q) => q.c === c.id))}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-gray-600">
          {c.sinFactura > 0
            ? <>{c.sinFactura} {c.sinFactura === 1 ? 'cargo' : 'cargos'} · {fmtDOP(c.sinFacturaCentavos)}</>
            : <span className="text-gray-500">Nada pendiente hoy</span>}
        </span>
      </label>
    </li>
  );

  return (
    <div className="space-y-6 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      {/* ── ¿Qué conceptos? ── */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-900">¿Qué conceptos?</legend>
        {conceptos.length === 0 ? (
          <p className="rounded-lg border border-gray-200 px-3 py-4 text-sm text-gray-600">
            No hay ningún concepto con cargos sin factura en este año escolar.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
              <input type="checkbox" className={CASILLA} checked={todos}
                onChange={() => onConceptos(marcarVarios(seleccionados, conceptos.map((c) => c.id), !todos))} />
              Todos los conceptos ({conceptos.length})
            </label>
            <ul className="divide-y divide-gray-100">{conPendientes.map(filaConcepto)}</ul>
            {sinPendientes.length > 0 && (
              <details className="group border-t border-gray-200">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zero-500">
                  <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
                  {sinPendientes.length} {sinPendientes.length === 1 ? 'concepto' : 'conceptos'} sin nada pendiente hoy
                  <span className="text-xs text-gray-500">— se pueden facturar por adelantado</span>
                </summary>
                <ul className="divide-y divide-gray-100 border-t border-gray-100">{sinPendientes.map(filaConcepto)}</ul>
              </details>
            )}
          </div>
        )}
      </fieldset>

      {/* ── ¿Qué meses? ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900">¿Qué meses?</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Atajos de meses">
          {preset(mesesSel === 'todo', 'Todo lo pendiente hasta hoy', () => onMeses('todo'))}
          {preset(soloEste, `Solo ${MESES_CORTOS[Number(esteMes.slice(5)) - 1].toLowerCase()}`, () => onMeses(new Set([esteMes])))}
          {siguiente && preset(esteYSiguiente,
            `${MESES_CORTOS[Number(esteMes.slice(5)) - 1]} y ${MESES_CORTOS[Number(siguiente.slice(5)) - 1].toLowerCase()}`,
            () => onMeses(new Set([esteMes, siguiente])))}
        </div>

        <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {meses.map((m) => {
            const lineas = delMes.get(m.valor) ?? [];
            const vacio = lineas.length === 0;
            const tiempo = m.valor < esteMes ? 'atrasado' : m.valor === esteMes ? 'este' : 'adelantado';
            const marcado = marcados.has(m.valor);
            const [anio, mm] = m.valor.split('-');
            const etiqueta = tiempo === 'atrasado' ? 'Atrasado' : tiempo === 'este' ? 'Este mes' : 'Por adelantado';
            const texto = (l: (typeof lineas)[number]) => `${nombreDe.get(l.conceptoId) ?? 'Concepto'}: ${l.cargos > 0
              ? `${l.cargos} ${l.cargos === 1 ? 'cargo' : 'cargos'} · ${fmtDOP(l.centavos)}`
              : 'se crea al facturar'}`;
            return (
              <li key={m.valor}>
                <label className={`relative flex h-full min-h-[4.75rem] flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zero-500 has-[:focus-visible]:ring-offset-1 ${
                  vacio && !marcado ? 'cursor-not-allowed border-dashed border-gray-200 bg-gray-50/60'
                    : marcado ? 'cursor-pointer border-zero-600 bg-zero-50' : 'cursor-pointer border-gray-200 bg-white hover:border-gray-300'}`}>
                  <input type="checkbox" className="sr-only" checked={marcado} onChange={() => alternar(m.valor)}
                    disabled={vacio && !marcado}
                    aria-label={`${MESES_CORTOS[Number(mm) - 1]} ${anio}. ${vacio ? 'Nada que facturar' : `${etiqueta}. ${lineas.map(texto).join('. ')}`}.`} />
                  <span className="flex items-center gap-1.5">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      marcado ? 'border-zero-600 bg-zero-600 text-white' : vacio ? 'border-gray-300 bg-gray-100' : 'border-gray-400 bg-white'}`} aria-hidden>
                      {marcado && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className={`text-sm font-semibold ${vacio ? 'text-gray-500' : 'text-gray-900'}`}>{MESES_CORTOS[Number(mm) - 1]}</span>
                    <span className="text-xs text-gray-500">{anio}</span>
                    {!vacio && (
                      <span className={`ml-auto rounded px-1.5 text-[11px] font-medium ${
                        tiempo === 'atrasado' ? 'bg-amber-100 text-amber-900'
                          : tiempo === 'este' ? 'bg-zero-100 text-zero-800' : 'bg-violet-100 text-violet-800'}`}>
                        {etiqueta}
                      </span>
                    )}
                  </span>
                  {vacio ? (
                    <span className="text-xs text-gray-500">Nada que facturar</span>
                  ) : (
                    <ul className="space-y-0.5" aria-hidden>
                      {lineas.slice(0, 3).map((l) => (
                        <li key={l.conceptoId} className="flex gap-1 text-xs leading-snug">
                          <span className="min-w-0 truncate text-gray-800">{nombreDe.get(l.conceptoId) ?? 'Concepto'}</span>
                          <span className={`ml-auto shrink-0 tabular-nums ${l.cargos > 0 ? 'text-gray-700' : 'text-violet-700'}`}>
                            {l.cargos > 0 ? fmtDOP(l.centavos) : 'se crea'}
                          </span>
                        </li>
                      ))}
                      {lineas.length > 3 && <li className="text-xs text-gray-500">y {lineas.length - 3} más</li>}
                    </ul>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* ── Lo que va a pasar ── */}
      <div aria-live="polite" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
        {seleccionados.size === 0 ? (
          <p>Marca al menos un concepto.</p>
        ) : mesesSel !== 'todo' && elegidos.length === 0 ? (
          <p>Marca al menos un mes.</p>
        ) : (
          <ul className="space-y-1">
            <li>
              Vas a facturar{' '}
              <strong className="font-semibold text-gray-900">
                {mesesSel === 'todo' ? 'todo lo pendiente hasta hoy' : listaDeMeses(elegidos)}
              </strong>
              {dentro.cargos > 0 && <>: {dentro.cargos} {dentro.cargos === 1 ? 'cargo pendiente' : 'cargos pendientes'} por <strong className="font-semibold text-gray-900 tabular-nums">{fmtDOP(dentro.centavos)}</strong></>}.
            </li>
            {porConcepto.size > 0 && (
              <li>
                <ul className="mt-1 space-y-0.5 border-l-2 border-zero-200 pl-3">
                  {[...porConcepto].map(([c, ms]) => (
                    <li key={c}>
                      <span className="font-medium text-gray-900">{nombreDe.get(c) ?? 'Concepto'}</span>: {listaDeMeses(ms)}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {adelantados.length > 0 && (
              <li className="text-gray-700">
                {mayuscula(listaDeMeses(adelantados))} {adelantados.length === 1 ? 'va' : 'van'} por adelantado: sus cuotas se crean al facturar y el cobro automático no las repite.
              </li>
            )}
            {quedanFuera.length > 0 && (
              <li className="text-amber-900">
                Se quedan sin facturar {listaDeMeses(quedanFuera)} ({fuera.cargos} {fuera.cargos === 1 ? 'cargo' : 'cargos'}, {fmtDOP(fuera.centavos)}), para otra factura.
              </li>
            )}
            <li className="text-xs text-gray-500">Antes de crear nada ves la lista de facturas, una por una.</li>
          </ul>
        )}
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-3">
        <input type="checkbox" className={`${CASILLA} mt-0.5`} checked={juntar}
          onChange={(e) => onJuntar(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium text-gray-900">Juntar hermanos en una sola factura</span>
          <span className="block text-xs text-gray-500">
            {juntar
              ? 'Una factura por responsable de pago, con una línea por hijo.'
              : 'Apagado: una factura por cada alumno, aunque tengan el mismo responsable.'}
          </span>
        </span>
      </label>
    </div>
  );
}
