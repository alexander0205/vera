'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { CalendarClock, Loader2, Info } from 'lucide-react';

interface Programacion {
  activa: boolean;
  mensualActiva: boolean;
  mensualDia: number;
  quincenalActiva: boolean;
  quincenalDia1: number;
  quincenalDia2: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Interruptor simple sobre un checkbox nativo (no hay componente Switch). */
function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-zero-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function DiaInput({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <Input
      type="number"
      min={1}
      max={31}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
      className="w-24"
    />
  );
}

export default function ConfiguracionClient() {
  const { data, isLoading, mutate } = useSWR<{ programacion: Programacion }>('/api/nomina/programacion', fetcher);
  const [cfg, setCfg] = useState<Programacion | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (data?.programacion) setCfg(data.programacion);
  }, [data]);

  const set = <K extends keyof Programacion>(k: K, v: Programacion[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function guardar() {
    if (!cfg) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/nomina/programacion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error('No se pudo guardar');
      toast.success('Programación guardada');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(false);
    }
  }

  if (isLoading || !cfg) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CalendarClock className="h-6 w-6 text-zero-600" /> Programación automática
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fija los días de pago y el sistema crea la corrida sola, en borrador, para que la revises y apruebes.
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-4 p-5">
          <Toggle
            checked={cfg.activa}
            onChange={(v) => set('activa', v)}
            label="Activar la generación automática"
            hint="Apagado, nada se genera solo. Las corridas manuales siguen disponibles."
          />
        </CardContent>
      </Card>

      <Card className={`mb-4 transition-opacity ${cfg.activa ? '' : 'pointer-events-none opacity-50'}`}>
        <CardContent className="space-y-5 p-5">
          {/* Mensual */}
          <div className="space-y-3">
            <Toggle
              checked={cfg.mensualActiva}
              onChange={(v) => set('mensualActiva', v)}
              label="Nómina mensual"
              hint="Incluye a los empleados con frecuencia de pago 'Mensual'."
            />
            {cfg.mensualActiva && (
              <div className="ml-7 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Día de pago</Label>
                <DiaInput value={cfg.mensualDia} onChange={(v) => set('mensualDia', v)} />
                <span className="text-xs text-muted-foreground">de cada mes</span>
              </div>
            )}
          </div>

          <div className="border-t" />

          {/* Quincenal */}
          <div className="space-y-3">
            <Toggle
              checked={cfg.quincenalActiva}
              onChange={(v) => set('quincenalActiva', v)}
              label="Nómina quincenal"
              hint="Incluye a los empleados con frecuencia de pago 'Quincenal'. Dos pagos al mes."
            />
            {cfg.quincenalActiva && (
              <>
                <div className="ml-7 flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-muted-foreground">1er pago, día</Label>
                  <DiaInput value={cfg.quincenalDia1} onChange={(v) => set('quincenalDia1', v)} />
                  <Label className="ml-3 text-xs text-muted-foreground">2do pago, día</Label>
                  <DiaInput value={cfg.quincenalDia2} onChange={(v) => set('quincenalDia2', v)} />
                </div>
                <div className="ml-7 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Hoy el cálculo TSS/ISR se hace sobre el salario <strong>mensual</strong>; la proración quincenal aún no está.
                    Cada quincena saldría a monto de mes completo. Úsalo para mensual hasta que llegue la proración.
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Si el día cae más allá del fin de mes (ej. 30 en febrero), se paga el último día del mes.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando} className="gap-1.5">
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
