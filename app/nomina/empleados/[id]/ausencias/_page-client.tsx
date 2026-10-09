'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { ArrowLeft, CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { LABEL_AUSENCIA, TIPOS_AUSENCIA, descuentaDias, type TipoAusencia } from '@/lib/nomina/ausencias';
import { Empleado, fetcher, nombreCompleto } from '../../shared';

// Faltas y licencias. La falta y la licencia sin pago restan días al pago de la
// corrida (el salario se prorratea por los días pagados); la licencia con pago se
// anota pero se paga completa.

interface Ausencia { id: number; tipo: TipoAusencia; desde: string; hasta: string; dias: number; comentario: string | null }
const formVacio = () => ({ tipo: 'falta' as TipoAusencia, desde: hoyRD(), hasta: '', comentario: '' });

export default function AusenciasEmpleadoClient({ id }: { id: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const volver = () => router.push('/nomina/empleados');

  const { data: dEmpleado, isLoading } = useSWR<{ empleado?: Empleado }>(`/api/nomina/empleados/${id}`, fetcher);
  const empleado = dEmpleado?.empleado ?? null;
  const { data, mutate } = useSWR<{ ausencias: Ausencia[] }>(`/api/nomina/empleados/${id}/ausencias`, fetcher);
  const ausencias = data?.ausencias ?? [];

  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const ocupadoRef = useRef(false);
  const [aQuitar, setAQuitar] = useState<Ausencia | null>(null);

  async function llamar(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? 'No se pudo completar');
  }

  async function guardar() {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true; setGuardando(true);
    try {
      await llamar(`/api/nomina/empleados/${id}/ausencias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      toast.success('Ausencia registrada');
      setAbierto(false);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false; setGuardando(false);
    }
  }

  async function quitar() {
    const q = aQuitar;
    if (!q || ocupadoRef.current) return;
    ocupadoRef.current = true; setGuardando(true);
    try {
      await llamar(`/api/nomina/empleados/${id}/ausencias?ausencia=${q.id}`, { method: 'DELETE' });
      toast.success('Ausencia quitada');
      setAQuitar(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false; setGuardando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <button type="button" onClick={volver} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Empleados
      </button>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><CalendarOff className="h-6 w-6 text-zero-600" /> Faltas y licencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empleado ? `${nombreCompleto(empleado)}. ` : ''}
          Las faltas y licencias sin pago se descuentan del salario de la corrida (por los días que cubren). La licencia con pago se
          anota y se paga completa. Las corridas ya creadas no cambian: si hay un borrador de ese período, bórralo y vuélvelo a crear.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !empleado ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p>No se encontró este empleado.</p>
          <Button variant="outline" onClick={volver} className="mt-3">Volver al listado</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {puedeGestionar && !abierto && (
            <Button onClick={() => { setF(formVacio()); setAbierto(true); }} className="gap-1.5"><Plus className="h-4 w-4" /> Registrar falta o licencia</Button>
          )}
          {puedeGestionar && abierto && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-medium">Nueva falta o licencia</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo label="Tipo *">
                  <NativeSelect value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoAusencia })} aria-label="Tipo de ausencia">
                    {TIPOS_AUSENCIA.map((t) => <option key={t} value={t}>{LABEL_AUSENCIA[t]}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label="Desde *"><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} aria-label="Desde" /></Campo>
                <Campo label="Hasta (vacío = un solo día)"><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} aria-label="Hasta" /></Campo>
                <div className="sm:col-span-3">
                  <Campo label="Comentario"><Input value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} placeholder="Ej. certificado médico" /></Campo>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando} className="gap-1.5">{guardando && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5" data-testid="lista-ausencias">
            {ausencias.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin faltas ni licencias registradas.</p>
            ) : ausencias.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-md border p-2.5">
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{LABEL_AUSENCIA[a.tipo] ?? a.tipo}</span>
                    <Badge variant={descuentaDias(a.tipo) ? 'secondary' : 'outline'}>{descuentaDias(a.tipo) ? 'Se descuenta' : 'Se paga'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.desde === a.hasta ? fmtFechaCorta(a.desde) : `${fmtFechaCorta(a.desde)} al ${fmtFechaCorta(a.hasta)}`} · {a.dias} {a.dias === 1 ? 'día' : 'días'}
                    {a.comentario && ` · ${a.comentario}`}
                  </div>
                </div>
                {puedeGestionar && (
                  <Button variant="ghost" size="icon" aria-label="Quitar ausencia" title="Quitar" onClick={() => setAQuitar(a)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={aQuitar !== null}
        onOpenChange={(o) => { if (!o) setAQuitar(null); }}
        title="Quitar la ausencia"
        description="Deja de contarse en las próximas corridas. Las ya calculadas no cambian."
        confirmLabel={guardando ? 'Quitando…' : 'Quitar'}
        loading={guardando}
        destructive
        onConfirm={quitar}
      />
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
