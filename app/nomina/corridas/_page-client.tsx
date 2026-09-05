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
import { CalendarClock, Loader2, Plus, ChevronRight, CalendarDays } from 'lucide-react';

interface Corrida {
  id: number;
  periodo: string;
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

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CorridasClient() {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeCorrer = can('nomina:correr');
  const { data, isLoading, mutate } = useSWR<{ corridas: Corrida[] }>('/api/nomina/corridas', fetcher);

  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ periodo: periodoActual(), tipo: 'mensual', descripcion: '', fechaPago: '' });

  const corridas = data?.corridas ?? [];

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
            Cada corrida calcula la nómina de un período sobre los empleados activos.
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
                      Período {c.periodo} · {c.tipo}
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
              Se calculará la nómina del período para todos los empleados activos. Queda en borrador hasta que la apruebes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Período</Label>
                <Input type="month" value={form.periodo} onChange={(e) => setForm((f) => ({ ...f, periodo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Frecuencia</Label>
                <NativeSelect value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha de pago</Label>
                <Input type="date" value={form.fechaPago} onChange={(e) => setForm((f) => ({ ...f, fechaPago: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Descripción</Label>
                <Input value={form.descripcion} placeholder={`Nómina ${form.periodo}`} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={creando}>Cancelar</Button>
            <Button onClick={crear} disabled={creando} className="gap-1.5">
              {creando && <Loader2 className="h-4 w-4 animate-spin" />}
              Calcular corrida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
