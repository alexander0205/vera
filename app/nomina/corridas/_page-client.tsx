'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import {
  frecuenciaDeTipo, LABEL_TIPO_CORRIDA, periodoDeCorrida, TIPOS_CORRIDA, type TipoCorrida,
} from '@/lib/nomina/corrida';
import { lunesDeLaSemana, rangoLegible } from '@/lib/nomina/periodos';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { CalendarClock, Loader2, Plus, ChevronRight, CalendarDays, Info } from 'lucide-react';

interface Corrida {
  id: number;
  periodo: string;
  fechaInicio: string;
  fechaFin: string;
  descripcion: string;
  tipo: string;
  fechaPago: string | null;
  estado: string;
  totalBrutoCents: number;
  totalDeduccionesCents: number;
  totalNetoCents: number;
  totalPatronalCents: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format((c ?? 0) / 100);

const BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  borrador: { label: 'Borrador', variant: 'outline' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  pagada:   { label: 'Pagada',   variant: 'secondary' },
};

const formInicial = () => ({
  tipo: 'mensual' as TipoCorrida,
  periodo: hoyRD().slice(0, 7),
  fechaInicio: lunesDeLaSemana(hoyRD()),
  descripcion: '',
  fechaPago: '',
});

export default function CorridasClient() {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeCorrer = can('nomina:correr');
  const { data, isLoading, mutate } = useSWR<{ corridas: Corrida[] }>('/api/nomina/corridas', fetcher);

  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(formInicial);

  const corridas = data?.corridas ?? [];

  // Lo que va a pagar la corrida, calculado igual que en el servidor.
  const periodoForm = periodoDeCorrida(form.tipo, { periodo: form.periodo, fechaInicio: form.fechaInicio });
  const frecuencia = frecuenciaDeTipo(form.tipo);
  const { data: dEmpleados } = useSWR<{ empleados?: { estado: string; frecuenciaPago: string }[] }>(
    abierto ? '/api/nomina/empleados' : null, fetcher,
  );
  const conEsaFrecuencia = (dEmpleados?.empleados ?? [])
    .filter((e) => e.estado === 'activo' && e.frecuenciaPago === frecuencia).length;

  async function crear() {
    setCreando(true);
    try {
      const res = await fetch('/api/nomina/corridas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo crear la corrida');
      toast.success('Corrida creada');
      setAbierto(false);
      setForm(formInicial());
      mutate();
      if (j.corrida?.id) router.push(`/nomina/corridas/${j.corrida.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarClock className="h-6 w-6 text-zero-600" /> Corridas de nómina
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada corrida paga unas fechas a los empleados de su frecuencia, por los días que trabajaron en ellas.
          </p>
        </div>
        {puedeCorrer && (
          <Button onClick={() => setAbierto(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nueva corrida
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : corridas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <CalendarDays className="h-8 w-8" />
          <p>Aún no has corrido ninguna nómina.</p>
          {puedeCorrer && (
            <Button variant="outline" onClick={() => setAbierto(true)} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Correr la primera
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {corridas.map((c) => {
            const b = BADGE[c.estado] ?? BADGE.borrador;
            return (
              <Card key={c.id} className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => router.push(`/nomina/corridas/${c.id}`)}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.descripcion}</span>
                      <Badge variant={b.variant}>{b.label}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {rangoLegible({ inicio: c.fechaInicio, fin: c.fechaFin }, { corto: true })} · {LABEL_TIPO_CORRIDA[c.tipo] ?? c.tipo}
                      {c.fechaPago && ` · pago ${fmtFechaCorta(c.fechaPago)}`}
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="font-medium">{pesos(c.totalNetoCents)}</div>
                    <div className="text-xs text-muted-foreground">neto a pagar</div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva corrida</DialogTitle>
            <DialogDescription>
              Calcula la nómina de unas fechas para los empleados que cobran con esa frecuencia. Queda en borrador hasta que la apruebes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="corrida-tipo" className="text-xs text-muted-foreground">Tipo de corrida</Label>
                <NativeSelect id="corrida-tipo" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoCorrida }))}>
                  {TIPOS_CORRIDA.map((t) => <option key={t} value={t}>{LABEL_TIPO_CORRIDA[t]}</option>)}
                </NativeSelect>
              </div>
              {form.tipo === 'semanal' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="corrida-inicio" className="text-xs text-muted-foreground">Semana que empieza el</Label>
                  <Input id="corrida-inicio" type="date" value={form.fechaInicio} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="corrida-mes" className="text-xs text-muted-foreground">Mes</Label>
                  <Input id="corrida-mes" type="month" value={form.periodo} onChange={(e) => setForm((f) => ({ ...f, periodo: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="corrida-pago" className="text-xs text-muted-foreground">Fecha de pago</Label>
                <Input id="corrida-pago" type="date" value={form.fechaPago} onChange={(e) => setForm((f) => ({ ...f, fechaPago: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="corrida-descripcion" className="text-xs text-muted-foreground">Descripción</Label>
                <Input
                  id="corrida-descripcion"
                  value={form.descripcion}
                  placeholder={periodoForm ? `Nómina ${LABEL_TIPO_CORRIDA[form.tipo].toLowerCase()} · ${rangoLegible(periodoForm, { corto: true })}` : 'Nómina'}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                />
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid="resumen-corrida">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-zero-600" />
              {periodoForm ? (
                <span>
                  Paga del <strong>{rangoLegible(periodoForm)}</strong> a los empleados con pago {frecuencia}
                  {dEmpleados?.empleados && ` (${conEsaFrecuencia} activo${conEsaFrecuencia === 1 ? '' : 's'})`}.
                  Quien entró o salió en esas fechas cobra solo sus días.
                </span>
              ) : (
                <span>{form.tipo === 'semanal' ? 'Elige el primer día de la semana.' : 'Elige el mes.'}</span>
              )}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={creando}>Cancelar</Button>
            <Button onClick={crear} disabled={creando || !periodoForm} className="gap-1.5">
              {creando && <Loader2 className="h-4 w-4 animate-spin" />}
              Calcular corrida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
