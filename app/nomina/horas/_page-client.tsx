'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { Check, Clock, Loader2, Plus, X } from 'lucide-react';

interface Registro {
  id: number;
  empleadoId: number;
  empleado: string;
  fecha: string;
  horas: number;
  horasNocturnas: number;
  feriado: boolean;
  nota: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  origen: 'empleado' | 'empresa';
  motivoRechazo: string | null;
  /** Pendiente dentro de una corrida ya aprobada: aprobarla no la paga. */
  corridaCerrada: boolean;
}

interface EmpleadoLista { id: number; nombres: string; apellidos: string; jornada: string | null; estado: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const ESTADOS = [
  { clave: 'pendiente', label: 'Pendientes' },
  { clave: 'aprobada', label: 'Aprobadas' },
  { clave: 'rechazada', label: 'Rechazadas' },
] as const;

// Los mismos colores que ve el empleado en su enlace.
const BADGE: Record<Registro['estado'], { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente', clase: 'border-amber-400 text-amber-700' },
  aprobada: { label: 'Aprobada', clase: 'border-emerald-400 text-emerald-700' },
  rechazada: { label: 'Rechazada', clase: 'border-red-400 text-red-700' },
};

/**
 * Horas de quien cobra por hora. Lo que sube cada empleado por su enlace llega
 * pendiente; aquí se aprueba o se rechaza (con motivo, que el empleado ve). La
 * corrida paga solo lo aprobado de sus fechas.
 */
export default function HorasNominaClient() {
  const { can } = usePermissions();
  const puedeRevisar = can('nomina:correr');
  const [estado, setEstado] = useState<Registro['estado']>('pendiente');
  const { data, isLoading, mutate } = useSWR<{ horas: Registro[] }>(`/api/nomina/horas?estado=${estado}`, fetcher);
  const { data: dEmpleados } = useSWR<{ empleados: EmpleadoLista[] }>('/api/nomina/empleados', fetcher);
  const porHoras = (dEmpleados?.empleados ?? []).filter((e) => e.jornada === 'por_horas' && e.estado === 'activo');

  const [sel, setSel] = useState<Set<number>>(new Set());
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const ocupado = useRef(false);
  const [nuevo, setNuevo] = useState<{ empleadoId: string; fecha: string; horas: string; horasNocturnas: string; feriado: boolean; nota: string } | null>(null);

  const registros = data?.horas ?? [];
  const totalHoras = useMemo(() => registros.reduce((s, r) => s + r.horas, 0), [registros]);
  const todos = registros.length > 0 && registros.every((r) => sel.has(r.id));

  async function revisar(nuevoEstado: 'aprobada' | 'rechazada', ids: number[], motivoTexto?: string) {
    if (ocupado.current || ids.length === 0) return;
    ocupado.current = true;
    setTrabajando(true);
    try {
      const res = await fetch('/api/nomina/horas/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, estado: nuevoEstado, motivo: motivoTexto }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      toast.success(`${j.revisadas} registro(s) ${nuevoEstado === 'aprobada' ? 'aprobados' : 'rechazados'}`);
      setSel(new Set());
      setRechazando(false);
      setMotivo('');
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      ocupado.current = false;
      setTrabajando(false);
    }
  }

  async function registrar() {
    if (!nuevo || ocupado.current) return;
    ocupado.current = true;
    setTrabajando(true);
    try {
      const res = await fetch('/api/nomina/horas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nuevo, empleadoId: Number(nuevo.empleadoId) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar');
      if (j.corridaCerrada) toast.error('Registradas, pero la nómina de esa fecha ya está aprobada: estas horas no se pagan solas');
      else toast.success('Horas registradas y aprobadas');
      setNuevo(null);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      ocupado.current = false;
      setTrabajando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Clock className="h-6 w-6 text-zero-600" /> Horas trabajadas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que suben los empleados que cobran por hora. La nómina paga solo las horas aprobadas.
          </p>
        </div>
        {puedeRevisar && (
          <Button onClick={() => setNuevo({ empleadoId: '', fecha: hoyRD(), horas: '', horasNocturnas: '', feriado: false, nota: '' })} className="gap-1.5">
            <Plus className="h-4 w-4" /> Registrar horas
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="tablist">
          {ESTADOS.map((e) => (
            <Button key={e.clave} size="sm" variant={estado === e.clave ? 'default' : 'outline'} role="tab" aria-selected={estado === e.clave}
              onClick={() => { setEstado(e.clave); setSel(new Set()); }}>
              {e.label}
            </Button>
          ))}
        </div>
        {puedeRevisar && estado === 'pendiente' && sel.size > 0 && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => revisar('aprobada', [...sel])} disabled={trabajando} className="gap-1.5">
              {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aprobar ({sel.size})
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRechazando(true)} disabled={trabajando} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Rechazar ({sel.size})
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : registros.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No hay horas {ESTADOS.find((e) => e.clave === estado)?.label.toLowerCase()}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    {puedeRevisar && estado === 'pendiente' && (
                      <th className="w-10 px-3 py-2">
                        <input type="checkbox" checked={todos} aria-label="Seleccionar todas" className="h-4 w-4 accent-zero-600"
                          onChange={() => setSel(todos ? new Set() : new Set(registros.map((r) => r.id)))} />
                      </th>
                    )}
                    <th className="px-3 py-2 font-medium">Empleado</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium">Horas</th>
                    <th className="px-3 py-2 font-medium">Detalle</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      {puedeRevisar && estado === 'pendiente' && (
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={sel.has(r.id)} aria-label={`Seleccionar ${r.empleado} ${r.fecha}`} className="h-4 w-4 accent-zero-600"
                            onChange={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                        </td>
                      )}
                      <td className="px-3 py-2 font-medium">{r.empleado}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtFechaCorta(r.fecha)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.horas}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {[r.horasNocturnas > 0 ? `${r.horasNocturnas} nocturnas` : null, r.feriado ? 'feriado' : null,
                          r.origen === 'empresa' ? 'registrada por la empresa' : null, r.nota].filter(Boolean).join(' · ') || '—'}
                        {r.estado === 'rechazada' && r.motivoRechazo && <div className="text-red-600">Motivo: {r.motivoRechazo}</div>}
                        {r.corridaCerrada && <div className="text-amber-700">La nómina de esa fecha ya está aprobada: aprobarlas no las paga</div>}
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className={BADGE[r.estado].clase}>{BADGE[r.estado].label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {registros.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{registros.length} registro(s) · {totalHoras} horas</p>
      )}

      <Dialog open={rechazando} onOpenChange={(o) => { if (!o && !trabajando) setRechazando(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rechazar horas</DialogTitle>
            <DialogDescription>El empleado verá el motivo en su enlace y podrá corregir el día.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="motivo-rechazo" className="text-xs text-muted-foreground">Motivo</Label>
            <Input id="motivo-rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. ese día salió a las 3" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazando(false)} disabled={trabajando}>Cancelar</Button>
            <Button onClick={() => revisar('rechazada', [...sel], motivo)} disabled={trabajando || !motivo.trim()}>Rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nuevo !== null} onOpenChange={(o) => { if (!o && !trabajando) setNuevo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar horas</DialogTitle>
            <DialogDescription>Las horas que registra la empresa nacen aprobadas.</DialogDescription>
          </DialogHeader>
          {nuevo && (
            <DialogBody className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="horas-empleado" className="text-xs text-muted-foreground">Empleado</Label>
                <NativeSelect id="horas-empleado" value={nuevo.empleadoId} onChange={(e) => setNuevo({ ...nuevo, empleadoId: e.target.value })}>
                  <option value="">{porHoras.length ? 'Elige…' : 'No hay empleados por horas'}</option>
                  {porHoras.map((e) => <option key={e.id} value={e.id}>{[e.nombres, e.apellidos].join(' ')}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="horas-fecha" className="text-xs text-muted-foreground">Fecha</Label>
                <Input id="horas-fecha" type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="horas-cantidad" className="text-xs text-muted-foreground">Horas</Label>
                <Input id="horas-cantidad" inputMode="decimal" value={nuevo.horas} onChange={(e) => setNuevo({ ...nuevo, horas: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="horas-nocturnas" className="text-xs text-muted-foreground">Nocturnas</Label>
                <Input id="horas-nocturnas" inputMode="decimal" value={nuevo.horasNocturnas} onChange={(e) => setNuevo({ ...nuevo, horasNocturnas: e.target.value })} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={nuevo.feriado} onChange={(e) => setNuevo({ ...nuevo, feriado: e.target.checked })} className="h-4 w-4 accent-zero-600" />
                Día feriado
              </label>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="horas-nota" className="text-xs text-muted-foreground">Nota</Label>
                <Input id="horas-nota" value={nuevo.nota} onChange={(e) => setNuevo({ ...nuevo, nota: e.target.value })} />
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevo(null)} disabled={trabajando}>Cancelar</Button>
            <Button onClick={registrar} disabled={trabajando || !nuevo?.empleadoId || !nuevo?.horas}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
