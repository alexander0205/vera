'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { Banknote, Download, Landmark, Loader2, Plus, Printer, Scale, X } from 'lucide-react';
import type { InfoCuenta, LibroBanco, ResumenEfectivo } from '@/lib/contabilidad/bancos';

// Libro banco, conciliación y movimientos entre cuentas propias. El libro es el
// mayor de una caja o banco partido en lo que entró y lo que salió; conciliar es
// marcar lo que ya se vio en el estado de cuenta (no cambia ningún asiento).

const fetcher = (url: string) => fetch(url).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? 'Error'); return d; });
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format(c / 100);
const hoyISO = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const primeroDeMes = () => `${hoyISO().slice(0, 8)}01`;
const ORIGEN: Record<string, string> = {
  factura: 'Factura', pago: 'Cobro', nota: 'Nota', anulacion: 'Anulación', manual: 'Manual',
  pago_sueldos: 'Pago de nómina', pago_nomina: 'Pago TSS/DGII', nomina: 'Nómina', compra: 'Compra', gasto: 'Gasto',
};

type Tipo = 'transferencia' | 'cargo' | 'deposito' | 'retiro';
const TIPOS: Record<Tipo, string> = {
  transferencia: 'Transferencia entre mis cuentas', cargo: 'Cargo bancario', deposito: 'Depósito', retiro: 'Retiro',
};

export default function BancosClient() {
  const { can } = usePermissions();
  const puedeGestionar = can('contabilidad:gestionar');

  const { data: dBancos } = useSWR<{ cuentas: InfoCuenta[] }>('/api/contabilidad/bancos/cuentas', fetcher);
  const bancos = dBancos?.cuentas ?? [];
  const [cuentaId, setCuentaId] = useState('');
  const [desde, setDesde] = useState(primeroDeMes());
  const [hasta, setHasta] = useState(hoyISO());
  const cuentaActiva = cuentaId || (bancos[0] ? String(bancos[0].id) : '');
  const rangoOk = !desde || !hasta || desde <= hasta;
  const q = `desde=${desde}&hasta=${hasta}`;

  const { data: libro, error: errLibro, mutate } = useSWR<LibroBanco>(
    cuentaActiva && rangoOk ? `/api/contabilidad/bancos/libro?cuentaId=${cuentaActiva}&${q}` : null, fetcher,
  );
  const { data: efectivo, mutate: mutateEfectivo } = useSWR<ResumenEfectivo>(rangoOk ? `/api/contabilidad/bancos/efectivo?${q}` : null, fetcher);

  const [sel, setSel] = useState<Set<number>>(new Set());
  const [saldoBanco, setSaldoBanco] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const ocupadoRef = useRef(false);
  const [trabajando, setTrabajando] = useState(false);

  async function refrescar() { await Promise.all([mutate(), mutateEfectivo()]); setSel(new Set()); }

  async function conciliar(conciliada: boolean, ids: number[]) {
    if (ocupadoRef.current || ids.length === 0) return;
    ocupadoRef.current = true; setTrabajando(true);
    try {
      const res = await fetch('/api/contabilidad/bancos/conciliar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuentaId: Number(cuentaActiva), lineaIds: ids, conciliada }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      await refrescar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { ocupadoRef.current = false; setTrabajando(false); }
  }

  // Lo que el extracto debe cuadrar: saldo del banco − lo que ya está conciliado.
  const saldoBancoCents = useMemo(() => {
    const t = saldoBanco.trim().replace(/^RD\$\s*/i, '');
    if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(Number(t.replace(/,/g, '')) * 100);
  }, [saldoBanco]);
  const diferencia = libro && saldoBancoCents !== null ? saldoBancoCents - libro.saldoConciliadoCents : null;

  const todosSel = !!libro && libro.movimientos.length > 0 && libro.movimientos.every((m) => sel.has(m.lineaId));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 print:mb-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Landmark className="h-6 w-6 text-zero-600" /> Bancos y caja
          </h1>
          <p className="mt-1 text-sm text-muted-foreground print:hidden">
            El libro banco de cada cuenta, lo que entró y salió, y la conciliación contra tu estado de cuenta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {libro && (
            <>
              <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="h-4 w-4" /> Imprimir</Button>
              <Button asChild variant="outline" className="gap-1.5">
                <a href={`/api/contabilidad/bancos/libro?cuentaId=${cuentaActiva}&${q}&formato=csv`}><Download className="h-4 w-4" /> Excel (CSV)</a>
              </Button>
            </>
          )}
          {puedeGestionar && bancos.length > 0 && (
            <Button onClick={() => setFormAbierto(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Registrar movimiento</Button>
          )}
        </div>
      </div>

      {dBancos && bancos.length === 0 && (
        <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
          La empresa todavía no tiene cajas o bancos en el catálogo de cuentas (códigos 1101 y 1102). Créalos en el catálogo y vuelve.
        </div>
      )}

      {bancos.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 print:hidden">
          <Campo label="Cuenta">
            <NativeSelect value={cuentaActiva} onChange={(e) => { setCuentaId(e.target.value); setSel(new Set()); }} aria-label="Cuenta">
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.codigo} · {b.nombre}</option>)}
            </NativeSelect>
          </Campo>
          <Campo label="Desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" /></Campo>
          <Campo label="Hasta"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" /></Campo>
        </div>
      )}
      {!rangoOk && <p role="alert" className="mb-3 text-sm text-red-700">La fecha «desde» es posterior a «hasta».</p>}
      {errLibro && <p role="alert" className="mb-3 text-sm text-red-700">{errLibro.message}</p>}

      {libro && (
        <>
          <p className="mb-2 hidden text-sm print:block">
            {libro.cuenta.codigo} · {libro.cuenta.nombre} — del {libro.desde ?? 'inicio'} al {libro.hasta ?? 'hoy'}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta titulo="Saldo inicial" valor={pesos(libro.saldoInicialCents)} />
            <Tarjeta titulo={`Entró (${libro.cantidadEntradas})`} valor={pesos(libro.entradasCents)} tono="text-emerald-700" />
            <Tarjeta titulo={`Salió (${libro.cantidadSalidas})`} valor={pesos(libro.salidasCents)} tono="text-red-700" />
            <Tarjeta titulo="Saldo final" valor={pesos(libro.saldoFinalCents)} />
          </div>

          {libro.truncado && (
            <p role="alert" className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              El tramo tiene más de 5,000 movimientos y solo se muestran los primeros. Acorta las fechas.
            </p>
          )}

          <Card className="mb-4 print:hidden"><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Scale className="h-4 w-4 text-zero-600" /> Conciliación</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Conciliado en el libro</div><div className="text-lg font-semibold tabular-nums">{pesos(libro.saldoConciliadoCents)}</div></div>
              <div><div className="text-xs text-muted-foreground">Por conciliar en el período</div>
                <div className="text-lg font-semibold tabular-nums">{libro.pendientes.cantidad}</div>
                <div className="text-xs text-muted-foreground">+{pesos(libro.pendientes.entradasCents)} / −{pesos(libro.pendientes.salidasCents)}</div></div>
              <Campo label="Saldo según tu estado de cuenta">
                <Input value={saldoBanco} onChange={(e) => setSaldoBanco(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Saldo del banco" />
              </Campo>
              <div>
                <div className="text-xs text-muted-foreground">Diferencia</div>
                {diferencia === null
                  ? <div className="text-sm text-muted-foreground">Escribe el saldo del banco</div>
                  : <div className={`text-lg font-semibold tabular-nums ${diferencia === 0 ? 'text-emerald-700' : 'text-amber-700'}`} data-testid="diferencia">
                      {diferencia === 0 ? 'Cuadra ✓' : pesos(diferencia)}
                    </div>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Marca abajo lo que ya aparece en el estado de cuenta. Cuando el saldo del banco menos lo conciliado da cero, la cuenta está conciliada.
              Lo que queda sin marcar son los depósitos o retiros que el banco aún no refleja (o que están mal registrados).
            </p>
          </CardContent></Card>

          {puedeGestionar && sel.size > 0 && (
            <div className="mb-2 flex items-center gap-2 print:hidden">
              <Badge variant="outline">{sel.size} marcados</Badge>
              <Button size="sm" onClick={() => conciliar(true, [...sel])} disabled={trabajando}>Conciliar</Button>
              <Button size="sm" variant="outline" onClick={() => conciliar(false, [...sel])} disabled={trabajando}>Quitar conciliación</Button>
            </div>
          )}

          <Card><CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                {puedeGestionar && <th className="w-10 px-3 py-2 print:hidden"><input type="checkbox" checked={todosSel} aria-label="Marcar todos"
                  onChange={() => setSel(todosSel ? new Set() : new Set(libro.movimientos.map((m) => m.lineaId)))} className="h-4 w-4 cursor-pointer accent-zero-600" /></th>}
                <th className="px-3 py-2 font-medium">Fecha</th><th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Entra</th><th className="px-3 py-2 text-right font-medium">Sale</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th><th className="px-3 py-2 text-center font-medium">Conciliado</th>
              </tr></thead>
              <tbody>
                <tr className="border-b bg-muted/30"><td colSpan={puedeGestionar ? 5 : 4} className="px-3 py-2 text-xs text-muted-foreground">Saldo inicial</td>
                  <td /><td className="px-3 py-2 text-right tabular-nums">{pesos(libro.saldoInicialCents)}</td><td /></tr>
                {libro.movimientos.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Sin movimientos en este período.</td></tr>
                )}
                {libro.movimientos.map((m) => (
                  <tr key={m.lineaId} className="border-b last:border-0 align-top" data-testid="movimiento">
                    {puedeGestionar && <td className="px-3 py-2 print:hidden"><input type="checkbox" checked={sel.has(m.lineaId)} aria-label={`Marcar ${m.concepto}`}
                      onChange={() => setSel((s) => { const n = new Set(s); if (n.has(m.lineaId)) n.delete(m.lineaId); else n.add(m.lineaId); return n; })} className="h-4 w-4 cursor-pointer accent-zero-600" /></td>}
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{m.fecha}</td>
                    <td className="min-w-[14rem] px-3 py-2 [overflow-wrap:anywhere]">{m.concepto}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{ORIGEN[m.origenTipo] ?? m.origenTipo}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{m.entraCents ? pesos(m.entraCents) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">{m.saleCents ? pesos(m.saleCents) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pesos(m.saldoCents)}</td>
                    <td className="px-3 py-2 text-center">{m.conciliado ? <Badge variant="secondary">Sí</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </>
      )}

      {efectivo && (
        <div className="mt-8" data-testid="resumen-efectivo">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Banknote className="h-4 w-4 text-zero-600" /> Efectivo del período (todas las cajas)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card><CardContent className="space-y-1 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Entró en efectivo</span><span className="tabular-nums text-emerald-700">{pesos(efectivo.entradasCents)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Salió en efectivo</span><span className="tabular-nums text-red-700">{pesos(efectivo.salidasCents)}</span></div>
              {efectivo.cuentas.map((c) => (
                <div key={c.cuentaId} className="flex justify-between text-xs text-muted-foreground"><span>{c.codigo} · {c.nombre}</span><span className="tabular-nums">+{pesos(c.entraCents)} / −{pesos(c.saleCents)}</span></div>
              ))}
            </CardContent></Card>
            <Card><CardContent className="space-y-1 p-4 text-sm">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Lo que salió, por tipo</div>
              {efectivo.salidasPorOrigen.length === 0 && <div className="text-muted-foreground">Nada salió en efectivo.</div>}
              {efectivo.salidasPorOrigen.map((o) => (
                <div key={o.origenTipo} className="flex justify-between"><span>{ORIGEN[o.origenTipo] ?? o.origenTipo} <span className="text-xs text-muted-foreground">({o.cantidad})</span></span><span className="tabular-nums">{pesos(o.saleCents)}</span></div>
              ))}
            </CardContent></Card>
          </div>
        </div>
      )}

      {formAbierto && <FormMovimiento bancos={bancos} cuentaInicial={cuentaActiva} onCerrar={() => setFormAbierto(false)} onGuardado={async () => { setFormAbierto(false); await refrescar(); }} />}
    </div>
  );
}

function FormMovimiento({ bancos, cuentaInicial, onCerrar, onGuardado }: {
  bancos: InfoCuenta[]; cuentaInicial: string; onCerrar: () => void; onGuardado: () => Promise<void>;
}) {
  const { data: dCat } = useSWR<{ cuentas: InfoCuenta[] }>('/api/contabilidad/cuentas?plano=true', fetcher);
  const catalogo = (dCat?.cuentas ?? []).filter((c) => c.imputable && c.activa);
  const idsBanco = new Set(bancos.map((b) => b.id));
  const gastos = catalogo.filter((c) => c.tipo === 'gasto');
  const contras = catalogo.filter((c) => !idsBanco.has(c.id));

  const [tipo, setTipo] = useState<Tipo>('transferencia');
  const [f, setF] = useState({ fecha: hoyISO(), monto: '', origen: cuentaInicial, destino: '', cuenta: cuentaInicial, contra: '', gasto: '', texto: '' });
  const [guardando, setGuardando] = useState(false);
  const ocupadoRef = useRef(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function guardar() {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true; setGuardando(true);
    try {
      const n = (v: string) => (v ? Number(v) : undefined);
      const cuerpo: Record<string, unknown> = { kind: tipo, fecha: f.fecha, monto: f.monto };
      if (tipo === 'transferencia') Object.assign(cuerpo, { cuentaOrigenId: n(f.origen), cuentaDestinoId: n(f.destino), referencia: f.texto });
      else if (tipo === 'cargo') Object.assign(cuerpo, { cuentaId: n(f.cuenta), cuentaGastoId: n(f.gasto), concepto: f.texto });
      else Object.assign(cuerpo, { cuentaId: n(f.cuenta), contrapartidaId: n(f.contra), concepto: f.texto });
      const res = await fetch('/api/contabilidad/bancos/movimientos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar');
      toast.success('Movimiento registrado');
      await onGuardado();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { ocupadoRef.current = false; setGuardando(false); }
  }

  const opcionesBanco = bancos.map((b) => <option key={b.id} value={b.id}>{b.codigo} · {b.nombre}</option>);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" role="dialog" aria-modal="true" aria-label="Registrar movimiento">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto"><CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Registrar movimiento</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <Campo label="Tipo">
          <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} aria-label="Tipo de movimiento">
            {(Object.keys(TIPOS) as Tipo[]).map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}
          </NativeSelect>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha *"><Input type="date" value={f.fecha} onChange={(e) => set({ fecha: e.target.value })} aria-label="Fecha del movimiento" /></Campo>
          <Campo label="Monto (RD$) *"><Input value={f.monto} onChange={(e) => set({ monto: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label="Monto" /></Campo>
        </div>
        {tipo === 'transferencia' ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Sale de *"><NativeSelect value={f.origen} onChange={(e) => set({ origen: e.target.value })} aria-label="Cuenta de origen">{opcionesBanco}</NativeSelect></Campo>
            <Campo label="Entra a *"><NativeSelect value={f.destino} onChange={(e) => set({ destino: e.target.value })} aria-label="Cuenta de destino"><option value="">Elige…</option>{opcionesBanco}</NativeSelect></Campo>
          </div>
        ) : (
          <Campo label="Caja o banco *"><NativeSelect value={f.cuenta} onChange={(e) => set({ cuenta: e.target.value })} aria-label="Caja o banco">{opcionesBanco}</NativeSelect></Campo>
        )}
        {tipo === 'cargo' && (
          <Campo label="Cuenta de gasto *">
            <NativeSelect value={f.gasto} onChange={(e) => set({ gasto: e.target.value })} aria-label="Cuenta de gasto">
              <option value="">Elige (por ejemplo, cargos bancarios)…</option>
              {gastos.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
            </NativeSelect>
          </Campo>
        )}
        {(tipo === 'deposito' || tipo === 'retiro') && (
          <Campo label={tipo === 'deposito' ? 'De dónde viene (cuenta que se acredita) *' : 'A dónde va (cuenta que se debita) *'}>
            <NativeSelect value={f.contra} onChange={(e) => set({ contra: e.target.value })} aria-label="Cuenta de contrapartida">
              <option value="">Elige…</option>
              {contras.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
            </NativeSelect>
          </Campo>
        )}
        <Campo label={tipo === 'transferencia' ? 'Referencia' : 'Concepto'}>
          <Input value={f.texto} onChange={(e) => set({ texto: e.target.value })} maxLength={120} aria-label="Concepto o referencia" />
        </Campo>
        {tipo === 'transferencia' && <p className="text-xs text-muted-foreground">Mueve dinero entre tus propias cajas y bancos: no es un gasto ni un ingreso.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando} className="gap-1.5">{guardando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function Tarjeta({ titulo, valor, tono }: { titulo: string; valor: string; tono?: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{titulo}</div><div className={`mt-0.5 text-lg font-semibold tabular-nums ${tono ?? ''}`}>{valor}</div></div>;
}
