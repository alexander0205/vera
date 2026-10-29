'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Check, ChevronDown, Link2, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fmtDOP, hoyRD, parseDOPaCentavos } from '@/lib/utils/format';
import { METODOS_PAGO } from '@/lib/pagos/metodos';
import {
  PREFIJOS_NCF, armarNcf, cifrasDe, estadoDelPago, siguienteNcf,
} from '@/lib/administracion-escolar/pago-anterior-ncf';
import { VincularFacturaDialog } from './VincularFacturaDialog';

/**
 * Lo que la familia ya pagó, mes a mes, de un alumno que ya tiene matrícula:
 * el paso «Pagos» del formulario de migración.
 *
 * Por concepto, cada mes con su monto y cómo está. A un mes que nadie ha
 * facturado se le puede:
 *  - anotar lo que pagó: se escribe cuánto, y el estado sale solo (pagó todo o
 *    abono); con su fecha, su forma de pago y, si lo tiene, el NCF —se elige el
 *    prefijo y se teclea solo el final—. Debajo es una factura histórica con su
 *    pago (`/cargos/[id]/pago-anterior`);
 *  - vincular una factura que ya está en Zero (la de Alegra, por ejemplo);
 *  - no cobrarlo (entró en septiembre: agosto no le toca). Es anular el cargo.
 *
 * Lo que no pagó no se anota: ya está debiendo. La mora la pone el sistema
 * sobre la factura vencida y aquí solo se enseña.
 *
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

export function PagosDelAlumno({ estudianteId, matriculaId }: { estudianteId: number; matriculaId: number }) {
  const [cargos, setCargos] = useState<CargoFicha[] | null>(null);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrados, setCerrados] = useState<Set<number>>(new Set());
  const [anotando, setAnotando] = useState<number | null>(null);
  const [vinculando, setVinculando] = useState<CargoFicha | null>(null);
  const [noCobrar, setNoCobrar] = useState<CargoFicha | null>(null);
  const [anulando, setAnulando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [c, e] = await Promise.all([
        fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/cargos`).then((r) => r.json()),
        fetch(`/api/administracion-escolar/estudiantes/${estudianteId}`).then((r) => r.json()),
      ]);
      setCargos(((c.cargos ?? []) as CargoFicha[]).filter((x) => x.matriculaId === matriculaId));
      setClienteId(e.estudiante?.responsable?.clientId ?? null);
    } catch {
      setError('No se pudieron leer los cargos del alumno');
    }
  }, [estudianteId, matriculaId]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Por concepto, cada uno con sus meses en orden. Lo de mora no es un concepto
  // del plan: se enseña en el mes del que salió.
  const porConcepto = useMemo(() => {
    const m = new Map<number, { nombre: string; cargos: CargoFicha[] }>();
    for (const c of cargos ?? []) {
      const g = m.get(c.conceptoId) ?? { nombre: c.concepto, cargos: [] };
      g.cargos.push(c);
      m.set(c.conceptoId, g);
    }
    for (const g of m.values()) {
      g.cargos.sort((a, b) => ((a.anio ?? 0) - (b.anio ?? 0)) || ((a.mes ?? 0) - (b.mes ?? 0)) || a.id - b.id);
    }
    return [...m.entries()];
  }, [cargos]);

  async function anular() {
    if (!noCobrar) return;
    setAnulando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/cargos/${noCobrar.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo quitar el cobro');
      setNoCobrar(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el cobro');
      setNoCobrar(null);
    } finally {
      setAnulando(false);
    }
  }

  if (!cargos) {
    return error
      ? <p className="text-sm text-red-600">{error}</p>
      : <p className="flex items-center gap-2 py-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando sus cargos…</p>;
  }
  if (cargos.length === 0) {
    return <p className="py-4 text-sm text-gray-500">Todavía no tiene cargos este año: no hay pagos que anotar.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Anota lo que la familia ya pagó antes de Zero. Lo que no pagó no se toca: ya sale debiendo.
        {!clienteId && <span className="font-medium text-amber-800"> Falta el responsable de pago: ponlo en «Familia» para poder anotar.</span>}
      </p>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {porConcepto.map(([conceptoId, g]) => {
        const cerrado = cerrados.has(conceptoId);
        const vivos = g.cargos.filter((c) => c.estado !== 'anulado');
        const pagado = vivos.reduce((s, c) => s + (c.montoCentavos - Math.max(0, c.saldoCentavos)), 0);
        const total = vivos.reduce((s, c) => s + c.montoCentavos, 0);
        const alternar = () => setCerrados((s) => {
          const n = new Set(s); if (n.has(conceptoId)) n.delete(conceptoId); else n.add(conceptoId); return n;
        });
        return (
          <section key={conceptoId} className={`rounded-lg border ${cerrado ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'}`}>
            <header className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={alternar} aria-expanded={!cerrado}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${cerrado ? '-rotate-90' : ''}`} />
                <span className="truncate text-sm font-medium text-gray-900">{g.nombre}</span>
                {cerrado && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </button>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                pagado {fmtDOP(pagado)} de {fmtDOP(total)}
              </span>
              {!cerrado && (
                <Button variant="outline" size="sm" onClick={alternar}>Completar</Button>
              )}
            </header>
            {!cerrado && (
              <table className="w-full border-t border-gray-100 text-sm">
                <tbody>
                  {g.cargos.map((c) => {
                    const est = estadoDe(c);
                    const anotable = c.estado !== 'anulado' && c.ecfDocumentId == null && c.saldoCentavos === c.montoCentavos;
                    return (
                      <Fragment key={c.id}>
                        <tr className="border-b border-gray-50 align-top last:border-0">
                          <td className="py-2 pl-3 pr-2">
                            <span className={c.estado === 'anulado' ? 'text-gray-400 line-through' : 'text-gray-900'}>{mesDe(c)}</span>
                            {c.facturaEncf && <span className="block text-[11px] text-gray-400">Factura {c.facturaEncf}</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-gray-700">{fmtDOP(c.montoCentavos)}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] ${est.tono}`}>{est.etiqueta}</span>
                            {c.moraSaldoCentavos > 0 && (
                              <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                                mora {fmtDOP(c.moraSaldoCentavos)}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right">
                            {anotable && anotando !== c.id && (
                              <div className="flex justify-end gap-1">
                                <Button variant="outline" size="sm" disabled={!clienteId} onClick={() => setAnotando(c.id)}>
                                  <Wallet className="mr-1 h-3.5 w-3.5" />Pagó
                                </Button>
                                <button type="button" title="Vincular una factura que ya está en Zero" aria-label="Vincular factura"
                                  disabled={!clienteId} onClick={() => setVinculando(c)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="No cobrar este mes" aria-label="No cobrar este mes"
                                  onClick={() => setNoCobrar(c)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600">
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {anotando === c.id && (
                          <tr className="border-b border-gray-100 bg-zero-50/40">
                            <td colSpan={4} className="px-3 pb-3 pt-1">
                              <AnotarPago cargo={c} onCancelar={() => setAnotando(null)}
                                onHecho={async () => { setAnotando(null); await cargar(); }} />
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
          onSaved={() => { setVinculando(null); void cargar(); }}
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
    </div>
  );
}

/** El formulario de un mes: cuánto pagó, cuándo, cómo y con qué comprobante. */
function AnotarPago({ cargo, onCancelar, onHecho }: {
  cargo: CargoFicha; onCancelar: () => void; onHecho: () => Promise<void>;
}) {
  const ultimo = leerUltimoNcf();
  const propuesto = ultimo ? siguienteNcf(ultimo) : null;
  const [monto, setMonto] = useState((cargo.montoCentavos / 100).toFixed(2));
  const [fecha, setFecha] = useState(cargo.fechaVencimiento && cargo.fechaVencimiento < hoyRD() ? cargo.fechaVencimiento : hoyRD());
  const [metodo, setMetodo] = useState('efectivo');
  const [prefijo, setPrefijo] = useState<string>(propuesto?.slice(0, 3) ?? '');
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
      {prefijo && (
        <p className="text-[11px] text-gray-500">
          {ncf ? <>Queda <span className="font-mono text-gray-800">{ncf}</span></> : 'Escribe solo el final: los ceros se ponen solos.'}
          {propuesto && ncf === propuesto && ' · el siguiente al último que anotaste'}
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
