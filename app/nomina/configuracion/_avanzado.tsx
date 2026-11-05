'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { ChevronDown, Info, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  costoDeUnaFaltaCents, ETIQUETA_AVANZADO, type AvanzadoNomina, type BaseRegalia, type MetodoFaltas,
} from '@/lib/nomina/avanzado';

// «Avanzado»: los pocos números que pueden variar por empresa. Plegado por defecto.
// Cada campo muestra su valor de ley y se puede restablecer. Las tasas de la TSS y la
// escala del ISR NO están aquí: son de ley y se actualizan por año en el código.

interface Respuesta {
  valores: AvanzadoNomina;
  porDefecto: AvanzadoNomina;
  rangos: Record<string, { min: number; max: number }>;
}

type Borrador = Record<keyof AvanzadoNomina, string>;

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const aBorrador = (v: AvanzadoNomina): Borrador =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) as Borrador;
const pesos = (cents: number) => `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SeccionAvanzado() {
  const { data, mutate } = useSWR<Respuesta>('/api/nomina/avanzado', fetcher);
  const [abierto, setAbierto] = useState(false);
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (data?.valores) setB(aBorrador(data.valores)); }, [data]);
  if (!data?.valores || !b) return null;

  const def = data.porDefecto;
  const cambiado = JSON.stringify(b) !== JSON.stringify(aBorrador(data.valores));
  const poner = (k: keyof AvanzadoNomina, v: string) => setB((x) => (x ? { ...x, [k]: v } : x));

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch('/api/nomina/avanzado', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      await mutate();
      toast.success('Valores avanzados guardados');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(false);
    }
  }

  const restablecer = (k: keyof AvanzadoNomina) => (
    <Button
      type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"
      disabled={b[k] === String(def[k])} onClick={() => poner(k, String(def[k]))}
    >
      <RotateCcw className="h-3 w-3" /> Restablecer
    </Button>
  );

  const numero = (k: keyof AvanzadoNomina, ayuda: string) => {
    const r = data.rangos[k];
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`av-${k}`} className="text-xs text-muted-foreground">{ETIQUETA_AVANZADO[k]}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`av-${k}`} inputMode="decimal" value={b[k]} onChange={(e) => poner(k, e.target.value)}
            className="max-w-[8rem]" aria-label={ETIQUETA_AVANZADO[k]}
          />
          {restablecer(k)}
        </div>
        <p className="text-xs text-muted-foreground">
          Valor de ley: <strong>{String(def[k])}</strong>{r ? ` · permitido de ${r.min} a ${r.max}` : ''}. {ayuda}
        </p>
      </div>
    );
  };

  // Ejemplo: sueldo de RD$30,000 en un mes de 30 días y 2 faltas.
  const ejemploMetodo = (m: MetodoFaltas) =>
    2 * costoDeUnaFaltaCents(3_000_000, 30, { metodoFaltas: m, divisorSalarioDiario: Number(b.divisorSalarioDiario) || def.divisorSalarioDiario });

  return (
    <>
      <button
        type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="mb-2 flex w-full items-center gap-2 text-left text-base font-semibold"
      >
        <SlidersHorizontal className="h-4 w-4 text-zero-600" /> Avanzado
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <Card className="mb-8">
          <CardContent className="space-y-5 p-5">
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Valores de ley por defecto; cámbialos solo si tu contable lo indica. Afectan las corridas, la regalía y
              las liquidaciones que se calculen a partir de ahora.
            </p>

            {numero('divisorSalarioDiario', 'Salario mensual ÷ este número = salario diario para vacaciones, cesantía y preaviso.')}

            <div className="space-y-1.5">
              <Label htmlFor="av-faltas" className="text-xs text-muted-foreground">{ETIQUETA_AVANZADO.metodoFaltas}</Label>
              <div className="flex items-center gap-2">
                <NativeSelect id="av-faltas" value={b.metodoFaltas} onChange={(e) => poner('metodoFaltas', e.target.value)} className="max-w-xs">
                  <option value="calendario">Por días del calendario (lo de siempre)</option>
                  <option value="laborable">Por día laborable, con el divisor del salario diario</option>
                </NativeSelect>
                {restablecer('metodoFaltas')}
              </div>
              <p className="text-xs text-muted-foreground">
                Ejemplo: sueldo de RD$30,000 en un mes de 30 días y 2 faltas. Por calendario se descuentan{' '}
                <strong>{pesos(ejemploMetodo('calendario'))}</strong>; por día laborable,{' '}
                <strong>{pesos(ejemploMetodo('laborable'))}</strong>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="av-base" className="text-xs text-muted-foreground">{ETIQUETA_AVANZADO.regaliaBase}</Label>
              <div className="flex items-center gap-2">
                <NativeSelect id="av-base" value={b.regaliaBase} onChange={(e) => poner('regaliaBase', e.target.value as BaseRegalia)} className="max-w-xs">
                  <option value="todo">Todo lo devengado (incluye horas extra e ingresos variables)</option>
                  <option value="ordinario">Solo el salario ordinario</option>
                </NativeSelect>
                {restablecer('regaliaBase')}
              </div>
              <p className="text-xs text-muted-foreground">
                Valor actual: todo lo devengado. «Solo ordinario» resta los ingresos variables (incentivos, comisiones, horas extra)
                que se pagaron en las nóminas del año. Confírmalo con tu contable.
              </p>
            </div>

            {numero('diasVacaciones', 'Días de vacaciones al año con 1 a 5 años de servicio.')}
            {numero('diasVacacionesMas5Anios', 'Días de vacaciones al año desde los 5 años.')}
            {numero('diasCesantiaProvision', 'Solo para la provisión contable mensual; la cesantía de una liquidación sigue la ley.')}

            <div className="flex justify-end">
              <Button onClick={guardar} disabled={guardando || !cambiado}>Guardar valores avanzados</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
