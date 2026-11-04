'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Check, ChevronDown, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fmtDOP, fmtFechaCorta, hoyRD, parseDOPaCentavos } from '@/lib/utils/format';
import { METODOS_PAGO } from '@/lib/pagos/metodos';
import {
  PREFIJOS_NCF, armarNcf, cifrasDe, estadoDelPago, siguienteNcf,
} from '@/lib/administracion-escolar/pago-anterior-ncf';
import { VincularFacturaDialog } from './VincularFacturaDialog';

/**
 * Lo que la familia ya pagó, mes a mes, de un alumno que ya tiene matrícula:
 * el paso «Pagos» del formulario de migración.
 *
 * Por concepto, cada mes con su monto y cómo está, como en el formulario de
 * migración. A un mes que nadie ha facturado se le indica:
 *  - «Pagó todo» o «Abonó»: con su fecha, su forma de pago y, si lo tiene, el
 *    NCF —se elige el prefijo y se teclea solo el final—. Debajo es una factura
 *    histórica con su pago (`/cargos/[id]/pago-anterior`);
 *  - «Debe todo»: no se anota pago. El cargo ya existe desde la matrícula; al
 *    «Guardar estudiante» se factura (borrador, con el vencimiento del mes) y se
 *    le pone la mora ya vencida: la que calcula el sistema o, si se anotó, la
 *    que ya traía de otro sistema. Hasta entonces es una marca compartida en el
 *    borrador del año, que se quita sola si al mes se le anota un pago;
 *  - vincular una factura que ya está en Zero (la de Alegra, por ejemplo);
 *  - no cobrarlo (entró en septiembre: agosto no le toca). Es anular el cargo.
 *
 * «Pagó todo hasta [mes]» anota de una vez los meses completos de un concepto,
 * con la forma de pago de siempre y NCF seguidos. Arriba, el contador de meses
 * indicados; `hasta` deja fuera los meses posteriores.
 *
 * La mora la pone el sistema sobre la factura vencida y aquí solo se enseña.
 * Cada concepto se cierra con «Completar» cuando se terminó de revisar.
 */

interface CargoFicha {
  id: number; conceptoId: number; concepto: string; matriculaId: number | null;
  mes: number | null; anio: number | null;
  montoCentavos: number; saldoCentavos: number; fechaVencimiento: string | null;
  estado: string; ecfDocumentId: number | null;
  facturaEncf: string | null; facturaCodigo: string | null;
  moraSaldoCentavos: number;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const mesDe = (c: CargoFicha) => (c.mes ? `${MESES[c.mes - 1]}${c.anio ? ` ${c.anio}` : ''}` : 'Pago único');

/** El último NCF anotado, para proponer el siguiente: así se teclea poco. */
const CLAVE_NCF = 'zero-migracion-ultimo-ncf';
function leerUltimoNcf(): string | null {
  try { return localStorage.getItem(CLAVE_NCF); } catch { return null; }
}
function guardarUltimoNcf(ncf: string) {
  try { localStorage.setItem(CLAVE_NCF, ncf); } catch { /* sin almacenamiento: no se propone */ }
}

function estadoDe(c: CargoFicha): { etiqueta: string; tono: string } {
  if (c.estado === 'anulado') return { etiqueta: 'No se cobra', tono: 'bg-gray-100 text-gray-500' };
  if (c.saldoCentavos <= 0) return { etiqueta: 'Pagado', tono: 'bg-emerald-50 text-emerald-800' };
  if (c.saldoCentavos < c.montoCentavos) return { etiqueta: `Abono · debe ${fmtDOP(c.saldoCentavos)}`, tono: 'bg-amber-50 text-amber-800' };
  return { etiqueta: c.ecfDocumentId ? 'Facturado, debe' : 'Debe', tono: 'bg-orange-50 text-orange-800' };
}

/** Preferencias de quien migra, en su navegador: cómo suelen venir los pagos. */
const CLAVE_NCF_DEFECTO = 'zero-migracion-ncf-defecto';
const CLAVE_FORMA = 'zero-migracion-forma';
function leerPref(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardarPref(clave: string, valor: string) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: no se recuerda */ }
}

/** Un mes con algo dicho: pagado (todo o en parte), facturado, no se cobra, o «debe todo». */
const indicado = (c: CargoFicha, debe: Set<number>) =>
  c.estado === 'anulado' || c.ecfDocumentId != null || c.saldoCentavos < c.montoCentavos || debe.has(c.id);
/** A un mes que nadie ha facturado ni pagado se le puede anotar algo. */
const anotable = (c: CargoFicha) => c.estado !== 'anulado' && c.ecfDocumentId == null && c.saldoCentavos === c.montoCentavos;
const claveMes = (c: CargoFicha) => (c.anio ?? 0) * 100 + (c.mes ?? 0);

export function PagosDelAlumno({ estudianteId, matriculaId, periodoId, hasta, onIndicados }: {
  estudianteId: number;
  matriculaId: number;
  /** Con el año, «Debe todo» se guarda (compartido) y cuenta como mes indicado. */
  periodoId?: number;
  /** «Hasta el mes» de la migración (`AAAA-MM`): los meses de después no salen. */
  hasta?: string;
  /** Cuántos meses ya se indicaron de cuántos: el contador del formulario. */
  onIndicados?: (hechos: number, total: number) => void;
}) {
  const [cargos, setCargos] = useState<CargoFicha[] | null>(null);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrados, setCerrados] = useState<Set<number>>(new Set());
  const [anotando, setAnotando] = useState<{ id: number; abono: boolean } | null>(null);
  const [vinculando, setVinculando] = useState<CargoFicha | null>(null);
  const [noCobrar, setNoCobrar] = useState<CargoFicha | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [debe, setDebe] = useState<Set<number>>(new Set());
  /** El mes cuyo panel de «Debe todo» está abierto, sin guardar todavía. */
  const [decidiendo, setDecidiendo] = useState<number | null>(null);
  /** La mora que un mes «Debe todo» ya traía de otro sistema, en centavos. */
  const [moraPrevia, setMoraPrevia] = useState<Map<number, number>>(new Map());
  // Si ya se anotó algún NCF, lo normal es que los pagos lo lleven.
  const [conNcf, setConNcf] = useState(() => (leerPref(CLAVE_NCF_DEFECTO) ?? (leerUltimoNcf() ? '1' : '0')) === '1');
  const [forma, setForma] = useState(() => leerPref(CLAVE_FORMA) ?? 'efectivo');
  const [hastaPago, setHastaPago] = useState<{ conceptoId: number; nombre: string; meses: CargoFicha[] } | null>(null);
  const [pagandoLote, setPagandoLote] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [c, e, d] = await Promise.all([
        fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/cargos`).then((r) => r.json()),
        fetch(`/api/administracion-escolar/estudiantes/${estudianteId}`).then((r) => r.json()),
        periodoId
          ? fetch(`/api/administracion-escolar/matriculas/desde-sigerd/completados?periodoId=${periodoId}`)
            .then((r) => (r.ok ? r.json() : { debe: [] }))
          : Promise.resolve({ debe: [] }),
      ]);
      setCargos(((c.cargos ?? []) as CargoFicha[]).filter((x) => x.matriculaId === matriculaId));
      setClienteId(e.estudiante?.responsable?.clientId ?? null);
      setDebe(new Set((d.debe ?? []) as number[]));
      setMoraPrevia(new Map(Object.entries((d.moraPrevia ?? {}) as Record<string, number>).map(([k, v]) => [Number(k), v])));
    } catch {
      setError('No se pudieron leer los cargos del alumno');
    }
  }, [estudianteId, matriculaId, periodoId]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Solo los meses que se trabajan: hasta «Hasta el mes». El pago único sale siempre.
  const visibles = useMemo(() => {
    const tope = hasta ? Number(hasta.replace('-', '')) : null;
    return (cargos ?? []).filter((c) => tope == null || c.mes == null || claveMes(c) <= tope);
  }, [cargos, hasta]);

  // Por concepto, cada uno con sus meses en orden. Lo de mora no es un concepto
  // del plan: se enseña en el mes del que salió.
  const porConcepto = useMemo(() => {
    const m = new Map<number, { nombre: string; cargos: CargoFicha[] }>();
    for (const c of visibles) {
      const g = m.get(c.conceptoId) ?? { nombre: c.concepto, cargos: [] };
      g.cargos.push(c);
      m.set(c.conceptoId, g);
    }
    for (const g of m.values()) g.cargos.sort((a, b) => claveMes(a) - claveMes(b) || a.id - b.id);
    return [...m.entries()];
  }, [visibles]);

  const hechos = visibles.filter((c) => indicado(c, debe)).length;
  useEffect(() => { if (cargos) onIndicados?.(hechos, visibles.length); }, [cargos, hechos, visibles.length, onIndicados]);

  /**
   * «Guardar» del panel de «Debe todo»: la marca y la mora que ya traía, de
   * una vez. `si=false` la quita (y con ella la mora). Hasta aquí no se guarda
   * nada: pulsar «Debe todo» solo abre el panel.
   */
  async function guardarDebe(c: CargoFicha, si: boolean, moraCentavos: number | null): Promise<boolean> {
    if (!periodoId) return false;
    const r = await fetch('/api/administracion-escolar/matriculas/desde-sigerd/completados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(si
        ? { periodoId, cargoId: c.id, debe: true, moraPrevia: moraCentavos }
        : { periodoId, cargoId: c.id, debe: false }),
    }).catch(() => null);
    if (!r?.ok) return false;
    setDebe((s) => { const n = new Set(s); if (si) n.add(c.id); else n.delete(c.id); return n; });
    setMoraPrevia((m) => { const n = new Map(m); if (si && moraCentavos) n.set(c.id, moraCentavos); else n.delete(c.id); return n; });
    setDecidiendo(null);
    return true;
  }

  /** Al mes se le anotó un pago, se vinculó o se anuló: ya no «debe todo». */
  async function soltarDebe(ids: number[]) {
    if (!periodoId) return;
    const marcados = ids.filter((id) => debe.has(id));
    if (marcados.length === 0) return;
    setDebe((s) => { const n = new Set(s); for (const id of marcados) n.delete(id); return n; });
    await Promise.all(marcados.map((cargoId) => fetch('/api/administracion-escolar/matriculas/desde-sigerd/completados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodoId, cargoId, debe: false }),
    }).catch(() => null)));
  }

  async function anular() {
    if (!noCobrar) return;
    setAnulando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/cargos/${noCobrar.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo quitar el cobro');
      await soltarDebe([noCobrar.id]);
      setNoCobrar(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el cobro');
      setNoCobrar(null);
    } finally {
      setAnulando(false);
    }
  }

  /**
   * «Pagó todo hasta»: cada mes, completo, con su fecha de vencimiento (o hoy
   * si aún no vence), la forma de pago de arriba y, si los pagos llevan NCF,
   * los que siguen al último anotado. Se para en el primero que falle.
   */
  async function pagarHasta() {
    if (!hastaPago) return;
    setPagandoLote(true); setError(null);
    let ncf = conNcf ? siguienteNcfPropuesto() : null;
    try {
      for (const c of hastaPago.meses) {
        const fecha = c.fechaVencimiento && c.fechaVencimiento < hoyRD() ? c.fechaVencimiento : hoyRD();
        const r = await fetch(`/api/administracion-escolar/cargos/${c.id}/pago-anterior`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagadoCentavos: c.montoCentavos, fechaPago: fecha, metodo: forma, ncf }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`${mesDe(c)}: ${d.error ?? 'no se pudo anotar el pago'}`);
        if (ncf) { guardarUltimoNcf(ncf); ncf = siguienteNcf(ncf); }
        await soltarDebe([c.id]);
      }
      setHastaPago(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron anotar los pagos');
      setHastaPago(null);
    } finally {
      setPagandoLote(false);
      await cargar();
    }
  }

  if (!cargos) {
    return error
      ? <p className="text-sm text-red-600">{error}</p>
      : <p className="flex items-center gap-2 py-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando sus cargos…</p>;
  }
  if (visibles.length === 0) {
    return <p className="py-4 text-sm text-gray-500">No tiene cargos en los meses que se trabajan: no hay pagos que anotar.</p>;
  }

  const propuestoLote = conNcf ? siguienteNcfPropuesto() : null;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Pagos y moras, mes a mes</h3>
        <p className="text-xs text-gray-500">
          Por cada mes indique si <b>pagó todo</b>, si <b>abonó</b> una parte o si <b>debe todo</b>. Cuando pagó, anote
          cuánto, la fecha, la forma de pago y el NCF.
        </p>
        <details className="mt-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 open:pb-2.5">
          <summary className="cursor-pointer font-medium text-gray-800">Qué hace cada opción</summary>
          <dl className="mt-1.5 space-y-1.5">
            <div><dt className="inline font-semibold text-emerald-700">Pagó todo · </dt>
              <dd className="inline">anota el pago entero con su fecha, forma de pago y NCF. Queda una factura histórica
                pagada: el mes se cierra y no lleva mora. No va a la DGII ni gasta NCF.</dd></div>
            <div><dt className="inline font-semibold text-amber-700">Abonó · </dt>
              <dd className="inline">anota lo que el padre pagó (no lo que debe). Queda una factura histórica con ese
                pago; lo que falta sigue vencido desde el vencimiento del mes y, si el concepto cobra mora, la pone el sistema.</dd></div>
            <div><dt className="inline font-semibold text-orange-700">Debe todo · </dt>
              <dd className="inline">no pagó nada. Se abre un recuadro: escribe la mora que traía, si venía con
                ella, y guarda la decisión con su botón. El cargo ya existe, pero no se factura solo: al pulsar «Guardar
                estudiante» se factura el mes (borrador sin NCF, con su vencimiento) y se le pone de una vez la mora ya
                vencida, si el concepto la cobra. Si venía de otro sistema con mora, anótala en «Mora que ya traía» y se
                usa esa. Necesita responsable de pago.</dd></div>
            <div><dt className="inline font-semibold text-gray-800">Vincular factura · </dt>
              <dd className="inline">el mes ya tiene una factura en Zero (por ejemplo, importada de otro sistema): se le
                asocia en vez de crear otra.</dd></div>
            <div><dt className="inline font-semibold text-gray-800">No cobrar · </dt>
              <dd className="inline">el mes no le tocaba (entró después): se anula su cargo, no se factura ni se debe.</dd></div>
          </dl>
        </details>
        {!clienteId && <p className="mt-1 text-xs font-medium text-amber-800">Falta el responsable de pago: ponlo en «Familia» para poder anotar.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={conNcf}
            onChange={(e) => { setConNcf(e.target.checked); guardarPref(CLAVE_NCF_DEFECTO, e.target.checked ? '1' : '0'); }} />
          Los pagos suelen llevar NCF
        </label>
        <label className="inline-flex items-center gap-1.5">
          Forma de pago de siempre
          <select value={forma} onChange={(e) => { setForma(e.target.value); guardarPref(CLAVE_FORMA, e.target.value); }}
            className="h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs">
            {METODOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <span className="ml-auto"><b className="tabular-nums">{hechos} de {visibles.length}</b> meses indicados</span>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {porConcepto.map(([conceptoId, g]) => {
        const cerrado = cerrados.has(conceptoId);
        const vivos = g.cargos.filter((c) => c.estado !== 'anulado');
        const pagado = vivos.reduce((s, c) => s + (c.montoCentavos - Math.max(0, c.saldoCentavos)), 0);
        const total = vivos.reduce((s, c) => s + c.montoCentavos, 0);
        const porPagar = g.cargos.filter(anotable);
        const alternar = () => setCerrados((s) => {
          const n = new Set(s); if (n.has(conceptoId)) n.delete(conceptoId); else n.add(conceptoId); return n;
        });
        return (
          <section key={conceptoId} className={`rounded-lg border ${cerrado ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'}`}>
            <header className="flex flex-wrap items-center gap-2 px-3 py-2">
              <button type="button" onClick={alternar} aria-expanded={!cerrado}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${cerrado ? '-rotate-90' : ''}`} />
                <span className="truncate text-sm font-medium text-gray-900">{g.nombre}</span>
                {cerrado && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </button>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                pagado {fmtDOP(pagado)} de {fmtDOP(total)}
              </span>
              {!cerrado && porPagar.length > 1 && clienteId && (
                <label className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-600">
                  Pagó todo hasta
                  <select value="" aria-label={`Pagó todo hasta, ${g.nombre}`}
                    onChange={(e) => {
                      const tope = Number(e.target.value);
                      if (tope) setHastaPago({ conceptoId, nombre: g.nombre, meses: porPagar.filter((c) => claveMes(c) <= tope) });
                    }}
                    className="h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs">
                    <option value="">elegir…</option>
                    {porPagar.map((c) => <option key={c.id} value={claveMes(c)}>{mesDe(c)}</option>)}
                  </select>
                </label>
              )}
              {!cerrado && (
                <Button variant="outline" size="sm" onClick={alternar}>Completar</Button>
              )}
            </header>
            {!cerrado && (
              <table className="w-full border-t border-gray-100 text-sm">
                <tbody>
                  {g.cargos.map((c) => {
                    const est = estadoDe(c);
                    const marcadoDebe = debe.has(c.id) && anotable(c);
                    const seg = 'px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40';
                    return (
                      <Fragment key={c.id}>
                        <tr className="border-b border-gray-50 align-top last:border-0">
                          <td className="py-2 pl-3 pr-2">
                            <span className={c.estado === 'anulado' ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}>{mesDe(c)}</span>
                            {c.facturaEncf && <span className="block text-[11px] text-gray-400">Factura {c.facturaEncf}</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-gray-700">{fmtDOP(c.montoCentavos)}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] ${marcadoDebe ? 'bg-orange-50 text-orange-800' : est.tono}`}>
                              {marcadoDebe ? 'Debe todo' : est.etiqueta}
                            </span>
                            {c.moraSaldoCentavos > 0 && (
                              <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                                mora {fmtDOP(c.moraSaldoCentavos)}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right">
                            {anotable(c) && (
                              <div className="flex flex-wrap justify-end gap-1">
                                <div role="group" aria-label={`Qué pasó con ${mesDe(c)}`}
                                  className="inline-flex overflow-hidden rounded-md border border-gray-200">
                                  <button type="button" disabled={!clienteId} aria-pressed={anotando?.id === c.id && !anotando.abono}
                                    title="Pagó el mes entero: queda una factura histórica pagada"
                                    onClick={() => { setDecidiendo(null); setAnotando({ id: c.id, abono: false }); }}
                                    className={`${seg} ${anotando?.id === c.id && !anotando.abono ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-emerald-50'}`}>
                                    Pagó todo
                                  </button>
                                  <button type="button" disabled={!clienteId} aria-pressed={anotando?.id === c.id && anotando.abono}
                                    title="Pagó una parte: se anota lo que pagó y lo demás sigue debiéndose (con mora, si el concepto la cobra)"
                                    onClick={() => { setDecidiendo(null); setAnotando({ id: c.id, abono: true }); }}
                                    className={`${seg} border-l border-gray-200 ${anotando?.id === c.id && anotando.abono ? 'bg-amber-500 text-white' : 'text-gray-700 hover:bg-amber-50'}`}>
                                    Abonó
                                  </button>
                                  <button type="button" disabled={!periodoId} aria-pressed={marcadoDebe || decidiendo === c.id}
                                    title={periodoId ? 'No pagó nada: se factura al guardar el estudiante y desde su vencimiento corre la mora (si el concepto la cobra)' : undefined}
                                    onClick={() => { setAnotando(null); setDecidiendo(decidiendo === c.id ? null : c.id); }}
                                    className={`${seg} border-l border-gray-200 ${marcadoDebe ? 'bg-orange-600 text-white'
                                      : decidiendo === c.id ? 'bg-orange-100 text-orange-900' : 'text-gray-700 hover:bg-orange-50'}`}>
                                    Debe todo
                                  </button>
                                </div>
                                <button type="button" title="Vincular una factura que ya está en Zero" aria-label="Vincular factura"
                                  disabled={!clienteId} onClick={() => setVinculando(c)}
                                  className="inline-flex h-[26px] w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="No cobrar este mes" aria-label="No cobrar este mes"
                                  onClick={() => setNoCobrar(c)}
                                  className="inline-flex h-[26px] w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600">
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {decidiendo === c.id && anotable(c) && (
                          <tr className="border-b border-gray-100 bg-orange-50/40">
                            <td colSpan={4} className="px-3 pb-3 pt-1">
                              <DecidirDebe cargo={c} conResponsable={!!clienteId} marcado={marcadoDebe}
                                moraCentavos={moraPrevia.get(c.id) ?? null}
                                onGuardar={(si, mora) => guardarDebe(c, si, mora)}
                                onCancelar={() => setDecidiendo(null)} />
                            </td>
                          </tr>
                        )}
                        {marcadoDebe && decidiendo !== c.id && anotando?.id !== c.id && (
                          <tr className="border-b border-gray-50">
                            <td colSpan={4} className="px-3 pb-2 pt-0">
                              <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-1.5 text-[11px] ${clienteId ? 'bg-orange-50 text-orange-900' : 'bg-amber-50 text-amber-900'}`}>
                                <Check className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1">
                                  {clienteId
                                    ? <><b>Guardado «Debe todo».</b> Se factura al pulsar «Guardar estudiante»
                                      {c.fechaVencimiento ? <> (vence {fmtFechaCorta(c.fechaVencimiento)})</> : null}
                                      {moraPrevia.get(c.id) ? <> · mora que traía {fmtDOP(moraPrevia.get(c.id)!)}</> : ' · mora la calcula el sistema'}.</>
                                    : <><b>Guardado «Debe todo»</b>, pero sin responsable de pago <b>no se podrá facturar</b>.
                                      Ponle el responsable en «Familia».</>}
                                </span>
                                <button type="button" onClick={() => setDecidiendo(c.id)}
                                  className="shrink-0 font-medium underline hover:no-underline">Cambiar</button>
                              </p>
                            </td>
                          </tr>
                        )}
                        {anotando?.id === c.id && (
                          <tr className="border-b border-gray-100 bg-zero-50/40">
                            <td colSpan={4} className="px-3 pb-3 pt-1">
                              <AnotarPago key={`${c.id}-${anotando.abono}`} cargo={c} abono={anotando.abono}
                                conNcf={conNcf} forma={forma} onCancelar={() => setAnotando(null)}
                                onHecho={async () => { setAnotando(null); await soltarDebe([c.id]); await cargar(); }} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      {vinculando && (
        <VincularFacturaDialog
          open
          cargoId={vinculando.id}
          cargoLabel={`${vinculando.concepto} · ${mesDe(vinculando)}`}
          cargoSaldoCentavos={vinculando.saldoCentavos}
          clienteId={clienteId}
          onClose={() => setVinculando(null)}
          onSaved={() => { const id = vinculando.id; setVinculando(null); void soltarDebe([id]).then(cargar); }}
        />
      )}
      <ConfirmDialog
        open={!!noCobrar}
        onOpenChange={(o) => { if (!o) setNoCobrar(null); }}
        title={noCobrar ? `¿No cobrarle ${noCobrar.concepto} de ${mesDe(noCobrar)}?` : ''}
        description="El cargo se anula: deja de deberse y no se le factura. Sirve para el mes en que todavía no estaba en el colegio."
        confirmLabel="No cobrar"
        destructive
        loading={anulando}
        onConfirm={() => void anular()}
      />
      <ConfirmDialog
        open={!!hastaPago}
        onOpenChange={(o) => { if (!o && !pagandoLote) setHastaPago(null); }}
        title={hastaPago ? `¿Pagó todo ${hastaPago.nombre} hasta ${mesDe(hastaPago.meses[hastaPago.meses.length - 1])}?` : ''}
        description={hastaPago
          ? `Se anotan ${hastaPago.meses.length} mes(es) completos por ${fmtDOP(hastaPago.meses.reduce((s, c) => s + c.montoCentavos, 0))}, `
            + `cada uno con su fecha de vencimiento y pagados en ${METODOS_PAGO.find((m) => m.value === forma)?.label ?? forma}. `
            + (propuestoLote ? `Con NCF seguidos desde ${propuestoLote}.` : 'Sin NCF.')
          : ''}
        confirmLabel="Sí, anotar"
        loading={pagandoLote}
        onConfirm={() => void pagarHasta()}
      />
    </div>
  );
}

/** El NCF que toca: el que sigue al último anotado en este navegador. */
function siguienteNcfPropuesto(): string | null {
  const ultimo = leerUltimoNcf();
  return ultimo ? siguienteNcf(ultimo) : null;
}

/** El formulario de un mes: cuánto pagó, cuándo, cómo y con qué comprobante. */
function AnotarPago({ cargo, abono, conNcf, forma, onCancelar, onHecho }: {
  cargo: CargoFicha;
  /** «Abonó»: se escribe cuánto; «Pagó todo» ya trae el mes entero. */
  abono: boolean;
  /** Los pagos suelen llevar NCF: viene propuesto el que sigue al último. */
  conNcf: boolean;
  /** La forma de pago de siempre. */
  forma: string;
  onCancelar: () => void; onHecho: () => Promise<void>;
}) {
  const propuesto = conNcf ? siguienteNcfPropuesto() : null;
  const [monto, setMonto] = useState(abono ? '' : (cargo.montoCentavos / 100).toFixed(2));
  const [fecha, setFecha] = useState(cargo.fechaVencimiento && cargo.fechaVencimiento < hoyRD() ? cargo.fechaVencimiento : hoyRD());
  const [metodo, setMetodo] = useState(forma);
  // Con NCF y ninguno anotado todavía, B02 (consumidor final) es lo más común.
  const [prefijo, setPrefijo] = useState<string>(propuesto?.slice(0, 3) ?? (conNcf ? 'B02' : ''));
  const [cola, setCola] = useState(propuesto ? String(Number(propuesto.slice(3))) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagado = parseDOPaCentavos(monto) ?? 0;
  const estado = estadoDelPago(cargo.montoCentavos, pagado);
  const ncf = prefijo ? armarNcf(prefijo, cola) : null;
  const ncfMal = !!prefijo && !!cola.trim() && !ncf;

  async function guardar() {
    if (pagado <= 0) { setError('Escribe cuánto pagó. Si no pagó, no hay nada que anotar: ya sale debiendo.'); return; }
    if (pagado > cargo.montoCentavos) { setError('Es más de lo que cuesta el mes.'); return; }
    if (ncfMal || (prefijo && !cola.trim())) { setError('Completa el NCF, o elige «Sin NCF».'); return; }
    setGuardando(true); setError(null);
    try {
      const r = await fetch(`/api/administracion-escolar/cargos/${cargo.id}/pago-anterior`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagadoCentavos: pagado, fechaPago: fecha, metodo, ncf }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo anotar el pago');
      if (ncf) guardarUltimoNcf(ncf);
      await onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anotar el pago');
    } finally {
      setGuardando(false);
    }
  }

  const campo = 'h-8 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-zero-500 focus:outline-none';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600">
          Cuánto pagó
          <span className="mt-0.5 flex items-center gap-1.5">
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoFocus
              className={`${campo} w-28 tabular-nums`} />
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${estado === 'pagado'
              ? 'bg-emerald-50 text-emerald-800' : estado === 'abono' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              {estado === 'pagado' ? 'Pagó todo' : estado === 'abono'
                ? `Abono · debe ${fmtDOP(cargo.montoCentavos - pagado)}` : 'Sin pago'}
            </span>
          </span>
        </label>
        <label className="text-xs text-gray-600">
          Fecha
          <input type="date" value={fecha} max={hoyRD()} onChange={(e) => setFecha(e.target.value)} className={`${campo} mt-0.5 block`} />
        </label>
        <label className="text-xs text-gray-600">
          Forma de pago
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={`${campo} mt-0.5 block`}>
            {METODOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Comprobante
          <span className="mt-0.5 flex items-center gap-1">
            <select value={prefijo} onChange={(e) => setPrefijo(e.target.value)} className={`${campo} w-24`} aria-label="Tipo de NCF">
              <option value="">Sin NCF</option>
              {PREFIJOS_NCF.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {prefijo && (
              <input value={cola} onChange={(e) => setCola(e.target.value)} inputMode="numeric"
                placeholder={`hasta ${cifrasDe(prefijo)} cifras`} aria-label="Número del NCF"
                className={`${campo} w-32 tabular-nums ${ncfMal ? 'border-red-400' : ''}`} />
            )}
          </span>
        </label>
      </div>
      <p className="text-[11px] text-gray-500">
        {estado === 'abono'
          ? <>Se anota lo que pagó. Los {fmtDOP(cargo.montoCentavos - pagado)} que faltan siguen vencidos
            {cargo.fechaVencimiento ? <> desde el {fmtFechaCorta(cargo.fechaVencimiento)}</> : null} y, si el concepto cobra mora, la pone el sistema.</>
          : estado === 'pagado'
            ? 'Queda una factura histórica pagada (no va a la DGII ni gasta NCF): el mes se cierra sin mora.'
            : 'Escribe cuánto pagó.'}
      </p>
      {prefijo && (
        <p className="text-[11px] text-gray-500">
          {ncf ? <>Queda <span className="font-mono text-gray-800">{ncf}</span></> : 'Escribe solo el final: los ceros se ponen solos.'}
          {propuesto && ncf === propuesto && ' · el siguiente al último que anotaste'}
        </p>
      )}
      {prefijo && (
        <p className="rounded-md bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-600">
          Este NCF ya lo emitió el colegio: aquí <b>solo se registra</b>, no se envía a la DGII ni gasta comprobantes de Zero.
          Si te equivocas, anula la factura en Facturación y vuelve a anotarlo.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="bg-zero-600 hover:bg-zero-700" disabled={guardando} onClick={() => void guardar()}>
          {guardando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Anotar pago
        </Button>
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
      </div>
    </div>
  );
}

/**
 * «Debe todo» de un mes, antes de guardarlo: qué va a pasar, la mora que ya
 * traía de otro sistema (Alegra, la libreta del colegio) y el botón que guarda
 * la decisión. Mora vacía = la calcula el sistema.
 */
function DecidirDebe({ cargo, conResponsable, marcado, moraCentavos, onGuardar, onCancelar }: {
  cargo: CargoFicha;
  conResponsable: boolean;
  /** Ya estaba guardado: se cambia la mora o se quita. */
  marcado: boolean;
  moraCentavos: number | null;
  onGuardar: (si: boolean, moraCentavos: number | null) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(moraCentavos ? (moraCentavos / 100).toFixed(2) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mora = texto.trim() ? parseDOPaCentavos(texto) : null;
  const moraMal = !!texto.trim() && (mora == null || mora < 0);

  async function guardar(si: boolean) {
    if (si && moraMal) { setError('La mora que traía tiene que ser un monto, o déjala vacía.'); return; }
    setGuardando(true); setError(null);
    const ok = await onGuardar(si, si ? (mora || null) : null);
    if (!ok) { setError(si ? 'No se pudo guardar «Debe todo»' : 'No se pudo quitar «Debe todo»'); setGuardando(false); }
  }

  return (
    <div className="space-y-2">
      <p className={`rounded-md px-2.5 py-1.5 text-[11px] ${conResponsable ? 'bg-orange-50 text-orange-900' : 'bg-amber-50 text-amber-900'}`}>
        {conResponsable
          ? <>No pagó nada de este mes. Su cargo ya existe, pero <b>no se factura solo</b>: al pulsar «Guardar estudiante»
            se factura (borrador sin NCF{cargo.fechaVencimiento ? <>, vence {fmtFechaCorta(cargo.fechaVencimiento)}</> : null}) y
            se le pone de una vez la mora ya vencida, si el concepto la cobra.</>
          : <>Sin responsable de pago <b>no se podrá facturar</b>: el mes se quedaría como cargo pendiente,
            sin factura y sin mora. Ponle el responsable en «Familia».</>}
      </p>
      {conResponsable && (
        <label className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
          Mora que ya traía (opcional)
          <input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal"
            placeholder="RD$" aria-label="Mora que ya traía"
            className={`h-7 w-28 rounded-md border bg-white px-2 text-xs tabular-nums focus:border-zero-500 focus:outline-none ${moraMal ? 'border-red-400' : 'border-gray-300'}`} />
          <span className="text-gray-500">
            {mora ? 'Se cobra esta en vez de la que calcula el sistema, repartida entre los periodos vencidos.'
              : 'Vacío: la calcula el sistema. Llénalo solo si venía de otro sistema con mora ya cobrada.'}
          </span>
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="bg-orange-600 hover:bg-orange-700" disabled={guardando} onClick={() => void guardar(true)}>
          {guardando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {marcado ? 'Guardar cambios' : 'Guardar «Debe todo»'}
        </Button>
        {marcado && (
          <Button size="sm" variant="outline" disabled={guardando} onClick={() => void guardar(false)}>Quitar «Debe todo»</Button>
        )}
        <Button size="sm" variant="outline" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
