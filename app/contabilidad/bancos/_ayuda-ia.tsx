'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { Loader2, Sparkles, X } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { useEscape } from './_escape';
import type { armarVistaIa } from '@/lib/contabilidad/extracto-ia';
import type { ResultadoAyuda } from '@/lib/contabilidad/conciliacion-ayuda';
import type { SugerenciaAyuda } from '@/lib/contabilidad/conciliacion-ayuda-reglas';

// La IA de la conciliación, en pantalla: la vista previa de lo que leyó con IA
// de un estado de cuenta, el panel «Ayúdame a conciliar» y el «Registrar cargo»
// del banco. La IA propone y la persona decide: nada se aplica sin pulsar.

const fetcher = (url: string) => fetch(url).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? 'Error'); return d; });
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format(c / 100);

export type VistaIa = ReturnType<typeof armarVistaIa>;
type FilaIa = VistaIa['filas'][number];

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  useEscape(onCerrar);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto"><CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">{titulo}</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </CardContent></Card>
    </div>
  );
}

// ── Vista previa de lo leído con IA ──────────────────────────────────────────

export function VistaLecturaIa({ vista, trabajando, onImportar, onCancelar }: {
  vista: VistaIa; trabajando: boolean; onImportar: (filas: FilaIa[]) => void; onCancelar: () => void;
}) {
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const c = vista.ia.comprobacion;
  const elegidas = vista.filas.filter((f) => !excluidas.has(f.fila));
  const alternar = (fila: number) => setExcluidas((s) => { const n = new Set(s); if (n.has(fila)) n.delete(fila); else n.add(fila); return n; });
  const color = c.estado === 'cuadra' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : c.estado === 'no-cuadra' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="vista-extracto-ia">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />Leído con IA · revisa antes de importar</Badge>
        {vista.ia.metodo === 'ia-columnas' && <span className="text-xs text-muted-foreground">La IA solo eligió las columnas; los montos los leyó Zero del archivo.</span>}
      </div>
      <div>
        <strong>{vista.total}</strong> movimientos del {fmtFechaCorta(vista.desde)} al {fmtFechaCorta(vista.hasta)}: entró <span className="text-emerald-700">{pesos(vista.entradasCents)}</span>,
        salió <span className="text-red-700">{pesos(vista.salidasCents)}</span>.
        {vista.ia.saldoInicialCents != null && vista.ia.saldoFinalCents != null && (
          <> Saldo del banco: de {pesos(vista.ia.saldoInicialCents)} a {pesos(vista.ia.saldoFinalCents)}.</>
        )}
      </div>
      <div role={c.estado === 'no-cuadra' ? 'alert' : 'status'} className={`rounded-md border p-2 ${color}`} data-testid="comprobacion-ia">{c.mensaje}</div>
      {vista.ia.avisos.map((a) => <div key={a} role="alert" className="text-xs text-amber-800">{a}</div>)}

      <div className="max-h-96 overflow-auto rounded-md border bg-background">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background"><tr className="border-b text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Importar</th><th className="px-2 py-1.5 font-medium">#</th><th className="px-2 py-1.5 font-medium">Fecha</th>
            <th className="px-2 py-1.5 font-medium">Descripción</th><th className="px-2 py-1.5 text-right font-medium">Monto</th><th className="px-2 py-1.5 text-right font-medium">Saldo</th>
          </tr></thead>
          <tbody>{vista.filas.map((f) => (
            <tr key={f.fila} className={`border-b last:border-0 ${f.dudosa ? 'bg-amber-50' : ''} ${excluidas.has(f.fila) ? 'opacity-50' : ''}`}>
              <td className="px-2 py-1"><input type="checkbox" checked={!excluidas.has(f.fila)} onChange={() => alternar(f.fila)} aria-label={`Importar la fila ${f.fila}`} /></td>
              <td className="px-2 py-1 tabular-nums text-muted-foreground">{f.fila}{f.porIa && <Sparkles className="ml-1 inline h-3 w-3" aria-label="Leída con IA" />}</td>
              <td className="px-2 py-1 tabular-nums">{fmtFechaCorta(f.fecha)}</td>
              <td className="px-2 py-1 [overflow-wrap:anywhere]">{f.descripcion ?? ''}{f.referencia ? <span className="text-muted-foreground"> · ref. {f.referencia}</span> : null}{f.dudosa && <span className="ml-1 font-medium text-amber-800">No cuadra con el balance</span>}</td>
              <td className={`px-2 py-1 text-right tabular-nums ${f.montoCents < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{pesos(f.montoCents)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{f.saldoCents != null ? pesos(f.saldoCents) : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {vista.totalErrores > 0 && (
        <div role="alert" className="text-amber-800">
          {vista.totalErrores} movimiento(s) no se pudieron leer y no se importarán: {vista.errores.slice(0, 5).map((e) => `número ${e.fila} (${e.mensaje})`).join('; ')}{vista.totalErrores > 5 ? '…' : ''}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Zero no guarda el archivo: solo los movimientos que confirmes. Desmarca los que no quieras importar.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onImportar(elegidas)} disabled={trabajando || elegidas.length === 0}>
          {trabajando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Importar {elegidas.length} y emparejar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}

// ── Registrar cargo del banco ────────────────────────────────────────────────

interface Prellenado { lineaId: number; fecha: string; montoCents: number; concepto: string; cuenta: { id: number | null; codigo: string; nombre: string; existe: boolean } }
interface CuentaGasto { id: number; codigo: string; nombre: string; tipo: string; imputable: boolean; activa: boolean }

/**
 * El formulario de «Registrar movimiento» (cargo bancario) ya lleno con lo que dice
 * el banco: fecha, monto, concepto y la cuenta de gastos bancarios del catálogo.
 * Al guardar se registra el asiento y se vuelve a emparejar, para que la línea
 * quede unida a él.
 */
export function RegistrarCargoDialogo({ lineaId, origen = 'regla', onCerrar, onHecho }: {
  lineaId: number; origen?: 'regla' | 'ia'; onCerrar: () => void; onHecho: () => void | Promise<void>;
}) {
  const { data, error } = useSWR<Prellenado>(`/api/contabilidad/bancos/extracto/ayuda/aceptar?lineaId=${lineaId}`, fetcher, { revalidateOnFocus: false });
  // El mismo catálogo que usa «Registrar movimiento»: se puede cambiar la cuenta de gasto (por defecto, la de gastos bancarios).
  const { data: cat } = useSWR<{ cuentas: CuentaGasto[] }>('/api/contabilidad/cuentas?plano=true', fetcher, { revalidateOnFocus: false });
  const gastos = (cat?.cuentas ?? []).filter((c) => c.tipo === 'gasto' && c.imputable && c.activa);
  const [concepto, setConcepto] = useState<string | null>(null);
  const [gasto, setGasto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!data || guardando) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/contabilidad/bancos/extracto/ayuda/aceptar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'gasto-bancario', lineaId, concepto: concepto ?? data.concepto, origen, ...(gasto ? { cuentaGastoId: Number(gasto) } : data.cuenta.id ? { cuentaGastoId: data.cuenta.id } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar el cargo');
      toast.success(j.emparejada ? 'Cargo registrado y emparejado con el banco' : 'Cargo registrado. Si no quedó emparejado, pulsa «Volver a emparejar».');
      await onHecho();
      onCerrar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setGuardando(false); }
  }

  return (
    <Modal titulo="Registrar cargo del banco" onCerrar={onCerrar}>
      {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">Lo que cobró el banco, listo para registrar como gasto. Revisa y confirma.</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Fecha</dt><dd className="tabular-nums">{fmtFechaCorta(data.fecha)}</dd>
            <dt className="text-muted-foreground">Monto</dt><dd className="tabular-nums text-red-700">{pesos(data.montoCents)}</dd>
          </dl>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Cuenta de gasto</Label>
            <NativeSelect value={gasto ?? (data.cuenta.id ? String(data.cuenta.id) : '')} onChange={(e) => setGasto(e.target.value)} aria-label="Cuenta de gasto">
              {!data.cuenta.existe && <option value="">{data.cuenta.codigo} · {data.cuenta.nombre} (se agrega a tu catálogo al guardar)</option>}
              {gastos.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
            </NativeSelect></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Concepto</Label>
            <Input value={concepto ?? data.concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={200} aria-label="Concepto del cargo" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registrar cargo</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Ayúdame a conciliar ──────────────────────────────────────────────────────

export function AyudaConciliar({ cuentaId, puedeGestionar, hayPendientes, onCambio }: {
  cuentaId: string; puedeGestionar: boolean; hayPendientes: boolean; onCambio: () => void | Promise<void>;
}) {
  const { data: disp } = useSWR<{ disponible: boolean }>(puedeGestionar ? '/api/contabilidad/bancos/extracto/ayuda' : null, fetcher, { revalidateOnFocus: false });
  const [r, setR] = useState<ResultadoAyuda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [descartadas, setDescartadas] = useState<Set<number>>(new Set());
  const [cargo, setCargo] = useState<{ lineaId: number; origen: 'regla' | 'ia' } | null>(null);
  const [aceptando, setAceptando] = useState<number | null>(null);
  const cerrarCargo = useCallback(() => setCargo(null), []);

  // Sin interruptor, sin modelo o sin permiso, el botón no existe y la pantalla sigue como antes.
  // La parte gratis (cargos del banco, pistas de suma, resumen) no necesita modelo: el botón siempre está.
  if (!puedeGestionar || (!hayPendientes && !r)) return null;

  async function pedir() {
    if (cargando) return;
    setCargando(true);
    try {
      const res = await fetch('/api/contabilidad/bancos/extracto/ayuda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuentaId: Number(cuentaId) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo pedir la ayuda');
      setR(j); setDescartadas(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setCargando(false); }
  }

  async function aceptar(s: Extract<SugerenciaAyuda, { tipo: 'emparejar' }>) {
    if (aceptando) return;
    setAceptando(s.lineaId);
    try {
      const res = await fetch('/api/contabilidad/bancos/extracto/ayuda/aceptar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'emparejar', lineaId: s.lineaId, libroLineaId: s.libro.lineaId, origen: s.origen }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo emparejar');
      toast.success('Emparejado');
      setDescartadas((d) => new Set(d).add(s.lineaId));
      await onCambio();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setAceptando(null); }
  }

  const visibles = r?.sugerencias.filter((s) => !descartadas.has(s.lineaId)) ?? [];
  const descartar = (id: number) => setDescartadas((d) => new Set(d).add(id));

  return (
    <Card data-testid="ayuda-conciliar"><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={pedir} disabled={cargando}>
          {cargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Ayúdame a conciliar
        </Button>
        <span className="text-xs text-muted-foreground">{disp?.disponible ? 'Mira lo pendiente y te sugiere (con IA donde hace falta). No cambia nada hasta que aceptes.' : 'Mira lo pendiente y te sugiere los cargos del banco. No cambia nada hasta que aceptes.'}</span>
      </div>

      {r && (
        <div className="space-y-2" data-testid="ayuda-resultado">
          <p className="text-sm font-medium" data-testid="ayuda-resumen">{r.resumen}</p>
          {r.truncado && <p className="text-xs text-amber-800">Hay más líneas pendientes que las {r.lineasRevisadas} que se miraron (las más antiguas). Resuelve esas y vuelve a pedir la ayuda.</p>}
          {r.ia.error && <p role="alert" className="text-xs text-amber-800">La IA no pudo ayudar ahora ({r.ia.error}). Estas son las sugerencias que no la necesitan.</p>}
          {visibles.length === 0 && <p className="text-sm text-muted-foreground">No tengo más sugerencias. Lo que queda hay que resolverlo a mano.</p>}
          {visibles.map((s) => (
            <div key={`${s.tipo}-${s.lineaId}`} className="space-y-1.5 rounded-md border p-3 text-sm" data-testid="ayuda-sugerencia">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="[overflow-wrap:anywhere]"><span className="tabular-nums">{fmtFechaCorta(s.linea.fecha)}</span> · {s.linea.descripcion ?? '—'}</span>
                <span className={`tabular-nums ${s.linea.montoCents < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{pesos(s.linea.montoCents)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.titulo}</span>
                {s.confianza != null && s.confianza < 0.6 && <Badge variant="outline">Poco segura</Badge>}
                {s.origen === 'ia' && <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />IA</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{s.razon}</p>
              {s.tipo === 'emparejar' && (
                <p className="text-xs">Apunte del libro: <span className="tabular-nums">{fmtFechaCorta(s.libro.fecha)}</span> · {s.libro.concepto} · {pesos(s.libro.montoCents)}</p>
              )}
              <div className="flex flex-wrap justify-end gap-1">
                {s.tipo === 'gasto-bancario' && <Button size="sm" onClick={() => setCargo({ lineaId: s.lineaId, origen: s.origen })}>Registrar cargo</Button>}
                {s.tipo === 'emparejar' && <Button size="sm" onClick={() => aceptar(s)} disabled={aceptando !== null}>{aceptando === s.lineaId && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Aceptar</Button>}
                {s.tipo === 'cliente' && <Button size="sm" asChild><Link href={s.href}>Ir a los cobros de este cliente</Link></Button>}
                <Button size="sm" variant="ghost" onClick={() => descartar(s.lineaId)}>Descartar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {cargo && <RegistrarCargoDialogo lineaId={cargo.lineaId} origen={cargo.origen} onCerrar={cerrarCargo}
        onHecho={async () => { descartar(cargo.lineaId); await onCambio(); }} />}
    </CardContent></Card>
  );
}
