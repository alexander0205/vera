'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { ArrowLeft, HandCoins, Loader2, Plus, Trash2 } from 'lucide-react';
import { equivalenteMensual } from '@/lib/nomina/avisos-datos';
import { Empleado, fetcher, nombreCompleto, pesos } from '../../shared';

// Ingresos y descuentos variables del empleado (incentivos, comisiones, avances,
// seguro médico…) y sus préstamos, en su propia página como los dependientes.
// Los montos son POR CORRIDA: en una nómina quincenal, lo que se escribe aquí se
// paga completo en cada quincena.

interface Concepto { id: number; codigo: string; nombre: string; tipo: 'ingreso' | 'descuento'; activo: boolean }
interface Asignacion {
  id: number; conceptoId: number; nombre: string; tipo: 'ingreso' | 'descuento';
  montoCents: number; fijo: boolean; desde: string; hasta: string | null; comentario: string | null;
}
interface Prestamo {
  id: number; montoCents: number; cuotaCents: number; saldoCents: number;
  desde: string; estado: 'activo' | 'saldado' | 'cancelado'; comentario: string | null;
}

const formConcepto = () => ({ conceptoId: '', monto: '', fijo: true, desde: hoyRD(), hasta: '', comentario: '' });
// `salida`: '' = sin elegir; 'ya' = «ya lo entregué antes» (sin asiento); un número = la caja o banco de donde salió.
const formPrestamo = () => ({ monto: '', cuota: '', desde: hoyRD(), comentario: '', salida: '' });

export default function ConceptosEmpleadoClient({ id }: { id: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const volver = () => router.push('/nomina/empleados');

  const { data: dEmpleado, isLoading } = useSWR<{ empleado?: Empleado }>(`/api/nomina/empleados/${id}`, fetcher);
  const empleado = dEmpleado?.empleado ?? null;
  const { data, mutate } = useSWR<{ asignaciones: Asignacion[]; prestamos: Prestamo[]; cuentasSalida?: { id: number; codigo: string; nombre: string }[] }>(
    `/api/nomina/empleados/${id}/conceptos`, fetcher,
  );
  const { data: dCatalogo } = useSWR<{ conceptos: Concepto[] }>('/api/nomina/conceptos', fetcher);
  const catalogo = (dCatalogo?.conceptos ?? []).filter((c) => c.activo);
  const asignaciones = data?.asignaciones ?? [];
  const prestamos = data?.prestamos ?? [];

  // Los préstamos tienen su propio formulario: no se eligen como concepto suelto.
  const elegibles = catalogo.filter((c) => c.codigo !== 'prestamo');

  const [abierto, setAbierto] = useState<'concepto' | 'prestamo' | null>(null);
  const [fc, setFc] = useState(formConcepto);
  const [fp, setFp] = useState(formPrestamo);
  const [guardando, setGuardando] = useState(false);
  const ocupadoRef = useRef(false);
  const [aQuitar, setAQuitar] = useState<{ tipo: 'asignacion' | 'prestamo'; id: number; nombre: string } | null>(null);

  async function llamar(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? 'No se pudo completar');
  }

  async function guardar() {
    if (ocupadoRef.current || abierto === null) return;
    if (abierto === 'prestamo' && fp.salida === '') {
      toast.error('Indica de dónde salió el dinero, o marca «Ya lo entregué antes».');
      return;
    }
    ocupadoRef.current = true;
    setGuardando(true);
    try {
      const cuerpo = abierto === 'concepto'
        ? { kind: 'concepto', ...fc, conceptoId: Number(fc.conceptoId) }
        : {
            kind: 'prestamo', monto: fp.monto, cuota: fp.cuota, desde: fp.desde, comentario: fp.comentario,
            desembolso: fp.salida === 'ya' ? { yaEntregado: true } : { cuentaSalidaId: Number(fp.salida) },
          };
      const res = await fetch(`/api/nomina/empleados/${id}/conceptos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo completar');
      // Lo que no se pudo asentar (o que el contable debe registrar a mano) se dice, no se calla.
      for (const a of (j.avisos as string[] | undefined) ?? []) toast.warning(a, { duration: 15000 });
      toast.success(abierto === 'concepto' ? 'Concepto agregado' : 'Préstamo registrado');
      setAbierto(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setGuardando(false);
    }
  }

  async function quitar() {
    const q = aQuitar;
    if (!q || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setGuardando(true);
    try {
      await llamar(`/api/nomina/empleados/${id}/conceptos?${q.tipo}=${q.id}`, { method: 'DELETE' });
      toast.success(q.tipo === 'prestamo' ? 'Préstamo cancelado' : 'Concepto quitado');
      setAQuitar(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setGuardando(false);
    }
  }

  const hoy = hoyRD();
  const vigente = (a: Asignacion) => (a.fijo ? a.hasta === null || a.hasta >= hoy : true);
  const signo = (t: 'ingreso' | 'descuento') => (t === 'ingreso' ? '+' : '−');
  const activos = prestamos.filter((p) => p.estado === 'activo');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={volver}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Empleados
      </button>

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HandCoins className="h-6 w-6 text-zero-600" /> Ingresos y descuentos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empleado ? `${nombreCompleto(empleado)}. ` : ''}
          Incentivos, comisiones, bonos, avances, seguro médico adicional y préstamos. Los montos son por corrida:
          en una nómina quincenal se pagan o descuentan completos en cada quincena.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !empleado ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p>No se encontró este empleado.</p>
          <Button variant="outline" onClick={volver} className="mt-3">Volver al listado</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {puedeGestionar && abierto === null && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setFc(formConcepto()); setAbierto('concepto'); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> Agregar ingreso o descuento
              </Button>
              <Button variant="outline" onClick={() => { setFp(formPrestamo()); setAbierto('prestamo'); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> Registrar préstamo o avance
              </Button>
            </div>
          )}

          {puedeGestionar && abierto === 'concepto' && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-medium">Nuevo ingreso o descuento</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Concepto *">
                  <NativeSelect value={fc.conceptoId} onChange={(e) => setFc({ ...fc, conceptoId: e.target.value })}>
                    <option value="">Elige…</option>
                    <optgroup label="Ingresos">
                      {elegibles.filter((c) => c.tipo === 'ingreso').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </optgroup>
                    <optgroup label="Descuentos">
                      {elegibles.filter((c) => c.tipo === 'descuento').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </optgroup>
                  </NativeSelect>
                </Campo>
                <Campo label="Monto por corrida (RD$) *">
                  <MoneyInput value={fc.monto} onChange={(v) => setFc({ ...fc, monto: v })} aria-label="Monto por corrida" />
                  <AvisoQuincenas empleado={empleado} monto={fc.monto} />
                </Campo>
                <Campo label="Se repite">
                  <NativeSelect value={fc.fijo ? 'fijo' : 'una'} onChange={(e) => setFc({ ...fc, fijo: e.target.value === 'fijo' })}>
                    <option value="fijo">Fijo: cada corrida mientras dure</option>
                    <option value="una">Una sola vez</option>
                  </NativeSelect>
                </Campo>
                <Campo label={fc.fijo ? 'Desde *' : 'Se aplica en la corrida que incluya este día *'}>
                  <Input type="date" value={fc.desde} onChange={(e) => setFc({ ...fc, desde: e.target.value })} />
                </Campo>
                {fc.fijo && (
                  <Campo label="Hasta (vacío = sin fin)">
                    <Input type="date" value={fc.hasta} onChange={(e) => setFc({ ...fc, hasta: e.target.value })} />
                  </Campo>
                )}
                <div className="sm:col-span-2">
                  <Campo label="Comentario">
                    <Input value={fc.comentario} onChange={(e) => setFc({ ...fc, comentario: e.target.value })} placeholder="Ej. incentivo por asistencia" />
                  </Campo>
                </div>
              </div>
              <Acciones guardando={guardando} onCancelar={() => setAbierto(null)} onGuardar={guardar} />
            </div>
          )}

          {puedeGestionar && abierto === 'prestamo' && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-medium">Nuevo préstamo o avance</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Monto prestado (RD$) *">
                  <MoneyInput value={fp.monto} onChange={(v) => setFp({ ...fp, monto: v })} aria-label="Monto prestado" />
                </Campo>
                <Campo label="Cuota por corrida (RD$) *">
                  <MoneyInput value={fp.cuota} onChange={(v) => setFp({ ...fp, cuota: v })} aria-label="Cuota por corrida" />
                  <AvisoQuincenas empleado={empleado} monto={fp.cuota} verbo="se descuentan" />
                </Campo>
                <Campo label="Se empieza a descontar desde *">
                  <Input type="date" value={fp.desde} onChange={(e) => setFp({ ...fp, desde: e.target.value })} />
                </Campo>
                <Campo label="Comentario">
                  <Input value={fp.comentario} onChange={(e) => setFp({ ...fp, comentario: e.target.value })} placeholder="Ej. avance de sueldo" />
                </Campo>
              </div>
              <Campo label="¿De dónde salió el dinero? *">
                <NativeSelect value={fp.salida} onChange={(e) => setFp({ ...fp, salida: e.target.value })} aria-label="De dónde salió el dinero">
                  <option value="">— Elige —</option>
                  {(data?.cuentasSalida ?? []).map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
                  <option value="ya">Ya lo entregué antes (sin asiento)</option>
                </NativeSelect>
              </Campo>
              <p className="text-xs text-muted-foreground">
                Cada nómina aprobada descuenta la cuota (o lo que quede) y baja el saldo. Si el neto no alcanza, se
                descuenta solo lo que cabe. Al elegir la caja o el banco se asienta el desembolso (cuentas por cobrar a
                empleados contra esa cuenta); con «Ya lo entregué antes» no se asienta nada y tu contable debe
                registrarlo a mano.
              </p>
              <Acciones guardando={guardando} onCancelar={() => setAbierto(null)} onGuardar={guardar} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ingresos y descuentos asignados</Label>
            {asignaciones.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin conceptos asignados.</p>
            ) : (
              asignaciones.map((a) => (
                <div key={a.id} className={`flex items-center gap-3 rounded-md border p-2.5 ${vigente(a) ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{a.nombre}</span>
                      <Badge variant={a.tipo === 'ingreso' ? 'default' : 'secondary'}>{a.tipo === 'ingreso' ? 'Ingreso' : 'Descuento'}</Badge>
                      <Badge variant="outline">{a.fijo ? 'Fijo' : 'Una vez'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.fijo ? `Desde el ${fmtFechaCorta(a.desde)}${a.hasta ? ` hasta el ${fmtFechaCorta(a.hasta)}` : ''}` : `Corrida del ${fmtFechaCorta(a.desde)}`}
                      {a.comentario && ` · ${a.comentario}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                    {signo(a.tipo)}{pesos(a.montoCents)}
                  </div>
                  {puedeGestionar && (
                    <Button
                      variant="ghost" size="icon" aria-label={`Quitar ${a.nombre}`} title="Quitar"
                      onClick={() => setAQuitar({ tipo: 'asignacion', id: a.id, nombre: a.nombre })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Préstamos y avances{activos.length > 0 && ` · por cobrar ${pesos(activos.reduce((s, p) => s + p.saldoCents, 0))}`}
            </Label>
            {prestamos.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin préstamos.</p>
            ) : (
              prestamos.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 rounded-md border p-2.5 ${p.estado === 'activo' ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{pesos(p.montoCents)}</span>
                      <Badge variant={p.estado === 'activo' ? 'default' : 'outline'}>
                        {p.estado === 'activo' ? 'Activo' : p.estado === 'saldado' ? 'Saldado' : 'Cancelado'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Cuota {pesos(p.cuotaCents)} · desde el {fmtFechaCorta(p.desde)}
                      {p.comentario && ` · ${p.comentario}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    {pesos(p.saldoCents)}
                    <div className="text-xs text-muted-foreground">saldo</div>
                  </div>
                  {puedeGestionar && p.estado === 'activo' && (
                    <Button
                      variant="ghost" size="icon" aria-label="Cancelar préstamo" title="Cancelar préstamo"
                      onClick={() => setAQuitar({ tipo: 'prestamo', id: p.id, nombre: 'este préstamo' })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={aQuitar !== null}
        onOpenChange={(o) => { if (!o) setAQuitar(null); }}
        title={aQuitar?.tipo === 'prestamo' ? 'Cancelar el préstamo' : 'Quitar el concepto'}
        description={aQuitar?.tipo === 'prestamo'
          ? 'Deja de descontarse desde la próxima corrida. Lo ya descontado queda en las nóminas aprobadas.'
          : `Se quita ${aQuitar?.nombre ?? ''} de las próximas corridas. Las ya calculadas no cambian.`}
        confirmLabel={guardando ? 'Guardando…' : aQuitar?.tipo === 'prestamo' ? 'Cancelar préstamo' : 'Quitar'}
        loading={guardando}
        destructive
        onConfirm={quitar}
      />
    </div>
  );
}

function Acciones({ guardando, onCancelar, onGuardar }: { guardando: boolean; onCancelar: () => void; onGuardar: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
      <Button onClick={onGuardar} disabled={guardando} className="gap-1.5">
        {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
        Guardar
      </Button>
    </div>
  );
}

/** En una nómina quincenal el monto se aplica completo en cada quincena: se dice cuánto suma al mes. */
function AvisoQuincenas({ empleado, monto, verbo = 'se pagan' }: { empleado: Empleado; monto: string; verbo?: string }) {
  if (empleado.frecuenciaPago === 'quincenal') {
    const eq = equivalenteMensual('quincenal', monto);
    return (
      <p className="text-xs text-amber-700" data-testid="aviso-quincenas">
        {eq
          ? `Cobra 2 quincenas: este monto se aplica en cada una, así que ${verbo} RD$${eq.totalPesos.toLocaleString('es-DO', { minimumFractionDigits: 2 })} al mes en total.`
          : 'Cobra por quincena: este monto se aplica completo en cada una (el doble al mes).'}
      </p>
    );
  }
  if (empleado.frecuenciaPago === 'semanal') {
    return <p className="text-xs text-amber-700" data-testid="aviso-quincenas">Cobra por semana: este monto se aplica completo cada semana.</p>;
  }
  return null;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
