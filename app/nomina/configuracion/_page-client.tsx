'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { CalendarClock, Loader2, Info, Settings, ShieldCheck } from 'lucide-react';
import {
  LABEL_TAMANO_EMPRESA, TAMANOS_EMPRESA,
  type SalarioMinimoSector, type TamanoEmpresa,
} from '@/lib/config/nomina-tasas';
import { fmtFechaCorta } from '@/lib/utils/format';

interface Programacion {
  activa: boolean;
  mensualActiva: boolean;
  mensualDia: number;
  quincenalActiva: boolean;
  quincenalDia1: number;
  quincenalDia2: number;
  anticipacionDias: number;
}

interface Ajustes {
  tamanoEmpresa: TamanoEmpresa | null;
  srlTasa: number | null;
  srlTasaAnio: number;
  srlMin: number;
  srlMax: number;
  capita: { perCapitaCents: number; fonamatCents: number; totalCents: number; resolucion: string; vigenteDesde: string };
  salariosMinimos: SalarioMinimoSector | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format(c / 100);
/** Fracción → texto de porcentaje con dos decimales: 0.0115 → «1.15». */
const aPorcentaje = (f: number) => (f * 100).toFixed(2);

/** Guía de la Ley 187-17 para elegir el tamaño (también cuentan las ventas anuales). */
const TRABAJADORES_TAMANO: Record<TamanoEmpresa, string> = {
  micro: 'de 1 a 10 trabajadores',
  pequena: 'de 11 a 50',
  mediana: 'de 51 a 150',
  grande: 'más de 150',
};

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
  const { data: ajustes, mutate: mutateAjustes } = useSWR<Ajustes>('/api/nomina/ajustes', fetcher);
  const [tamano, setTamano] = useState<TamanoEmpresa | ''>('');
  const [srlPct, setSrlPct] = useState('');

  useEffect(() => {
    if (data?.programacion) setCfg(data.programacion);
  }, [data]);

  useEffect(() => {
    if (!ajustes) return;
    setTamano(ajustes.tamanoEmpresa ?? '');
    setSrlPct(ajustes.srlTasa !== null ? aPorcentaje(ajustes.srlTasa) : '');
  }, [ajustes]);

  // La SRL se escribe en porcentaje; vacía = la del año (el mínimo del rango).
  const srlNumero = srlPct.trim() === '' ? null : Number(srlPct.replace(',', '.'));
  const srlInvalida = ajustes !== undefined && srlNumero !== null && (
    !Number.isFinite(srlNumero) || srlNumero < ajustes.srlMin * 100 - 1e-9 || srlNumero > ajustes.srlMax * 100 + 1e-9
  );

  const set = <K extends keyof Programacion>(k: K, v: Programacion[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function guardar() {
    if (!cfg) return;
    if (srlInvalida) {
      toast.error(`La tasa SRL va de ${aPorcentaje(ajustes!.srlMin)} % a ${aPorcentaje(ajustes!.srlMax)} %`);
      return;
    }
    setGuardando(true);
    try {
      // Primero la seguridad social: si la rechaza, no se guarda nada a medias.
      const resAjustes = await fetch('/api/nomina/ajustes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tamanoEmpresa: tamano || null,
          srlTasa: srlNumero === null ? null : Number((srlNumero / 100).toFixed(4)),
        }),
      });
      if (!resAjustes.ok) {
        const j = await resAjustes.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo guardar la seguridad social');
      }
      const res = await fetch('/api/nomina/programacion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error('No se pudo guardar la programación');
      toast.success('Configuración guardada');
      mutate();
      mutateAjustes();
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
          <Settings className="h-6 w-6 text-zero-600" /> Configuración de nómina
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La seguridad social de la empresa y los días en que se genera la nómina.
        </p>
      </div>

      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="h-4 w-4 text-zero-600" /> Seguridad social
      </h2>
      <Card className="mb-8">
        <CardContent className="space-y-5 p-5">
          <div className="space-y-2">
            <Label htmlFor="tamano-empresa" className="text-sm font-medium">Tamaño de la empresa</Label>
            <NativeSelect id="tamano-empresa" value={tamano} onChange={(e) => setTamano(e.target.value as TamanoEmpresa | '')}>
              <option value="">Sin configurar</option>
              {TAMANOS_EMPRESA.map((t) => (
                <option key={t} value={t}>
                  {`${LABEL_TAMANO_EMPRESA[t]} (${TRABAJADORES_TAMANO[t]})${ajustes?.salariosMinimos ? ` · mínimo ${pesos(ajustes.salariosMinimos.montosCents[t])}` : ''}`}
                </option>
              ))}
            </NativeSelect>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                El salario mínimo de su sector es la base más baja sobre la que se cotiza a la TSS: quien gane menos cotiza
                sobre el mínimo, salvo dispensa.
                {ajustes?.salariosMinimos && ` Res. ${ajustes.salariosMinimos.resolucion}, vigente desde el ${fmtFechaCorta(ajustes.salariosMinimos.vigenteDesde)}.`}
                {' '}Hoteles, zonas francas y demás sectores con tarifa propia: déjalo sin configurar.
              </span>
            </p>
          </div>

          <div className="border-t" />

          <div className="space-y-2">
            <Label htmlFor="srl-tasa" className="text-sm font-medium">Tasa del Seguro de Riesgos Laborales (%)</Label>
            <Input
              id="srl-tasa"
              value={srlPct}
              onChange={(e) => setSrlPct(e.target.value)}
              inputMode="decimal"
              placeholder={ajustes ? aPorcentaje(ajustes.srlTasaAnio) : '1.10'}
              className="w-28"
            />
            {srlInvalida && ajustes && (
              <p className="text-xs text-red-600">Va de {aPorcentaje(ajustes.srlMin)} a {aPorcentaje(ajustes.srlMax)}.</p>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                1 % fijo más 0.10 a 0.30 % según el riesgo de la actividad. Es la que aparece en la notificación de pago de la
                TSS. Vacía, se usa {ajustes ? aPorcentaje(ajustes.srlTasaAnio) : '1.10'} %.
              </span>
            </p>
          </div>

          {ajustes && (
            <>
              <div className="border-t" />
              <div className="space-y-1">
                <div className="text-sm font-medium">Dependientes adicionales</div>
                <p className="text-xs text-muted-foreground">
                  {pesos(ajustes.capita.totalCents)} al mes por cada uno ({pesos(ajustes.capita.perCapitaCents)} per cápita
                  + {pesos(ajustes.capita.fonamatCents)} de FONAMAT), Res. {ajustes.capita.resolucion}. Lo paga el
                  empleado y se descuenta en la nómina; se registran en la ficha de cada empleado.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
        <CalendarClock className="h-4 w-4 text-zero-600" /> Programación automática
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Fija los días de pago y el sistema crea la corrida sola, en borrador, para que la revises y apruebes.
      </p>

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
          {/* Anticipación */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Anticipación</div>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">Crear la corrida</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={cfg.anticipacionDias}
                onChange={(e) => set('anticipacionDias', Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">día(s) antes de la fecha de pago</span>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La corrida nace en borrador con antelación para que la revises y apruebes antes de que llegue la fecha. La fecha de pago sigue siendo la que fijas abajo.
            </p>
          </div>

          <div className="border-t" />

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
                <div className="ml-7 flex items-start gap-2 rounded-md border border-muted bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Cada quincena cobra <strong>la mitad</strong> del mes. El TSS/ISR se calcula sobre el salario mensual
                    (topes y escala del año) y se reparte entre las dos quincenas, que suman el mes al centavo.
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
