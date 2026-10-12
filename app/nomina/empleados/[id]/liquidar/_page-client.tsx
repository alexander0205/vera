'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { hoyRD } from '@/lib/utils/format';
import { AlertTriangle, ArrowLeft, Calculator, Loader2, LogOut } from 'lucide-react';
import { LABEL_MOTIVO, MOTIVOS_SALIDA, type MotivoSalida } from '@/lib/nomina/liquidacion';
import type { LiquidacionArmada } from '@/lib/nomina/liquidacion-db';
import { Empleado, fetcher, nombreCompleto, pesos } from '../../shared';

// Liquidación de un empleado que sale: se calcula en vivo con la fecha y el motivo, y al
// confirmar se crea una corrida de liquidación en borrador y se da de baja al empleado.
// Si se borra ese borrador, el empleado vuelve a como estaba.

export default function LiquidarEmpleadoClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: dEmpleado, isLoading } = useSWR<{ empleado?: Empleado }>(`/api/nomina/empleados/${id}`, fetcher);
  const empleado = dEmpleado?.empleado ?? null;

  const [fechaSalida, setFechaSalida] = useState(hoyRD());
  const [motivo, setMotivo] = useState<MotivoSalida | ''>('');
  const [diasVac, setDiasVac] = useState('');
  const [calculo, setCalculo] = useState<LiquidacionArmada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const ocupadoRef = useRef(false);
  const secuencia = useRef(0);

  // Recalcula al cambiar fecha, motivo o días; la respuesta vieja de una petición lenta no pisa a la nueva.
  useEffect(() => {
    if (!motivo || !fechaSalida) { setCalculo(null); setError(null); return; }
    const mia = ++secuencia.current;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nomina/empleados/${id}/liquidacion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fechaSalida, motivo, diasVacacionesPendientes: diasVac.trim() === '' ? null : diasVac }),
        });
        const j = await res.json().catch(() => ({}));
        if (mia !== secuencia.current) return;
        if (!res.ok) { setCalculo(null); setError(j.error ?? 'No se pudo calcular'); }
        else { setCalculo(j.liquidacion); setError(null); }
      } catch {
        if (mia === secuencia.current) { setCalculo(null); setError('No se pudo calcular. Revisa tu conexión.'); }
      } finally {
        if (mia === secuencia.current) setCalculando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [id, fechaSalida, motivo, diasVac]);

  async function registrar() {
    if (ocupadoRef.current || !calculo) return;
    ocupadoRef.current = true; setGuardando(true);
    try {
      const res = await fetch(`/api/nomina/empleados/${id}/liquidacion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaSalida, motivo, diasVacacionesPendientes: diasVac.trim() === '' ? null : diasVac, aplicar: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar la liquidación');
      toast.success('Liquidación creada en borrador');
      router.push(`/nomina/corridas/${j.corridaId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
      setConfirmar(false);
    } finally {
      ocupadoRef.current = false; setGuardando(false);
    }
  }

  const r = calculo?.resultado;
  const l = calculo?.linea;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <button type="button" onClick={() => router.push('/nomina/empleados')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Empleados
      </button>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><LogOut className="h-6 w-6 text-zero-600" /> Liquidar empleado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empleado ? `${nombreCompleto(empleado)}. ` : ''}
          Preaviso, cesantía, vacaciones no disfrutadas y regalía proporcional, según el motivo de la salida (Código de Trabajo).
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !empleado ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">No se encontró este empleado.</div>
      ) : (
        <div className="space-y-4">
          <Card><CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            <Campo label="Fecha de salida *"><Input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} aria-label="Fecha de salida" /></Campo>
            <div className="sm:col-span-2">
              <Campo label="Motivo *">
                <NativeSelect value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoSalida | '')} aria-label="Motivo de la salida">
                  <option value="">Elige…</option>
                  {MOTIVOS_SALIDA.map((m) => <option key={m} value={m}>{LABEL_MOTIVO[m]}</option>)}
                </NativeSelect>
              </Campo>
            </div>
            <div className="sm:col-span-3">
              <Campo label="Días de vacaciones que le quedan por disfrutar (vacío = lo proporcional del período)">
                <Input value={diasVac} onChange={(e) => setDiasVac(e.target.value)} inputMode="decimal" placeholder="Ej. 14" aria-label="Días de vacaciones pendientes" className="sm:max-w-[10rem]" />
              </Campo>
            </div>
          </CardContent></Card>

          {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
          {calculando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</p>}

          {calculo && r && l && (
            <>
              <Card><CardContent className="p-0">
                <div className="border-b px-4 py-3 text-sm">
                  <strong>{calculo.empleado.nombre}</strong> · {r.mesesServicio} meses de servicio ({calculo.empleado.fechaIngreso} → {calculo.fechaSalida}) ·
                  salario {pesos(calculo.empleado.salarioMensualCents)} (diario {pesos(r.salarioDiarioCents)})
                </div>
                <table className="w-full text-sm" data-testid="componentes-liquidacion">
                  <tbody>
                    {r.componentes.length === 0 && <tr><td className="px-4 py-6 text-center text-muted-foreground">No hay nada que liquidar con estos datos.</td></tr>}
                    {r.componentes.map((c) => (
                      <tr key={c.clave} className="border-b align-top last:border-0">
                        <td className="px-4 py-2"><div className="font-medium">{c.nombre}</div><div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.detalle}</div></td>
                        <td className="px-4 py-2 text-right tabular-nums">{pesos(c.montoCents)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30"><td className="px-4 py-2 font-medium">Total devengado</td><td className="px-4 py-2 text-right font-medium tabular-nums">{pesos(l.brutoCents)}</td></tr>
                    {l.afpEmpleadoCents + l.sfsEmpleadoCents > 0 && <tr><td className="px-4 py-1.5 text-muted-foreground">AFP y SFS (sobre las vacaciones)</td><td className="px-4 py-1.5 text-right tabular-nums">−{pesos(l.afpEmpleadoCents + l.sfsEmpleadoCents)}</td></tr>}
                    {l.isrCents > 0 && <tr><td className="px-4 py-1.5 text-muted-foreground">ISR</td><td className="px-4 py-1.5 text-right tabular-nums">−{pesos(l.isrCents)}</td></tr>}
                    {calculo.prestamos.filter((p) => p.descontarCents > 0).map((p) => (
                      <tr key={p.prestamoId}><td className="px-4 py-1.5 text-muted-foreground">Préstamo pendiente{p.comentario ? ` · ${p.comentario}` : ''}</td><td className="px-4 py-1.5 text-right tabular-nums">−{pesos(p.descontarCents)}</td></tr>
                    ))}
                    <tr className="border-t"><td className="px-4 py-2 text-base font-semibold">Neto a pagar</td><td className="px-4 py-2 text-right text-base font-semibold tabular-nums" data-testid="neto-liquidacion">{pesos(l.netoCents)}</td></tr>
                  </tbody>
                </table>
              </CardContent></Card>

              <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="avisos-liquidacion">
                {calculo.avisos.map((a, i) => <p key={i} className="flex items-start gap-2 [overflow-wrap:anywhere]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {a}</p>)}
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setConfirmar(true)} disabled={guardando || r.totalCents <= 0} className="gap-1.5">
                  <Calculator className="h-4 w-4" /> Registrar salida y crear liquidación
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Dar de baja y crear la liquidación"
        description={`${calculo?.empleado.nombre ?? 'El empleado'} queda de baja desde el ${calculo?.fechaSalida ?? ''} y se crea una corrida de liquidación en borrador por ${calculo ? pesos(calculo.linea.netoCents) : ''}. Si borras ese borrador, el empleado vuelve a estar activo.`}
        confirmLabel={guardando ? 'Creando…' : 'Registrar'}
        loading={guardando}
        onConfirm={registrar}
      />
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
