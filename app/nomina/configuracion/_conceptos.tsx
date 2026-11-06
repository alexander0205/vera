'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { HandCoins, Info } from 'lucide-react';

// Catálogo de ingresos y descuentos de la empresa y la cuenta contable de cada
// uno. Sin cuenta, un ingreso va a sueldos y un descuento a «otras deducciones
// por pagar»; con ella, el asiento de la nómina lo manda a su propia cuenta
// (incentivos → gasto de incentivos, avances → cuentas por cobrar a empleados).

interface Concepto {
  id: number; codigo: string; nombre: string; tipo: 'ingreso' | 'descuento';
  cotizaTss: boolean; gravaIsr: boolean; cuentaId: number | null; activo: boolean;
  /** Empleados que lo tienen asignado y vigente. */
  empleadosAfectados?: number;
}
interface CuentaPlana {
  id: number; codigo: string; nombre: string; tipo: string; imputable: boolean; activa: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ConceptosNomina() {
  const { data, mutate } = useSWR<{ conceptos: Concepto[] }>('/api/nomina/conceptos', fetcher);
  const { data: dCuentas } = useSWR<{ cuentas?: CuentaPlana[] }>('/api/contabilidad/cuentas?plano=true', fetcher);
  const [guardando, setGuardando] = useState<number | null>(null);
  // Una marca de impuestos cambia lo que se descuenta en las próximas corridas: si ya hay empleados con
  // ese concepto, se pide confirmación antes de guardar.
  const [pendiente, setPendiente] = useState<{ c: Concepto; cambios: Partial<Pick<Concepto, 'cotizaTss' | 'gravaIsr'>> } | null>(null);

  const conceptos = (data?.conceptos ?? []).filter((c) => c.activo);
  const cuentas = (dCuentas?.cuentas ?? []).filter((c) => c.imputable && c.activa);
  const sinCuentas = dCuentas !== undefined && !dCuentas.cuentas;

  async function cambiar(c: Concepto, cambios: Partial<Pick<Concepto, 'cuentaId' | 'cotizaTss' | 'gravaIsr'>>) {
    setGuardando(c.id);
    try {
      const res = await fetch('/api/nomina/conceptos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, ...cambios }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      await mutate();
      toast.success(`«${c.nombre}» guardado`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(null);
    }
  }

  /** Las marcas de TSS e ISR piden confirmación si ya hay empleados con ese concepto. */
  function cambiarMarca(c: Concepto, cambios: Partial<Pick<Concepto, 'cotizaTss' | 'gravaIsr'>>) {
    if ((c.empleadosAfectados ?? 0) > 0) setPendiente({ c, cambios });
    else void cambiar(c, cambios);
  }

  const grupo = (tipo: 'ingreso' | 'descuento', titulo: string, sugeridas: string[]) => {
    const filas = conceptos.filter((c) => c.tipo === tipo);
    const opciones = [...cuentas].sort((a, b) => Number(sugeridas.includes(b.tipo)) - Number(sugeridas.includes(a.tipo)) || a.codigo.localeCompare(b.codigo));
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{titulo}</div>
        {filas.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 rounded-md border p-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 [overflow-wrap:anywhere] sm:w-56 sm:shrink-0">
              <span className="text-sm font-medium">{c.nombre}</span>
              {tipo === 'ingreso' && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox" checked={c.cotizaTss} disabled={guardando === c.id}
                      onChange={(e) => cambiarMarca(c, { cotizaTss: e.target.checked })}
                      className="h-3.5 w-3.5 cursor-pointer accent-zero-600"
                    />
                    Cotiza a la TSS
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox" checked={c.gravaIsr} disabled={guardando === c.id}
                      onChange={(e) => cambiarMarca(c, { gravaIsr: e.target.checked })}
                      className="h-3.5 w-3.5 cursor-pointer accent-zero-600"
                    />
                    Grava ISR
                  </label>
                </div>
              )}
            </div>
            <NativeSelect
              value={c.cuentaId ?? ''} disabled={guardando === c.id || sinCuentas}
              onChange={(e) => cambiar(c, { cuentaId: e.target.value ? Number(e.target.value) : null })}
              className="sm:min-w-0 sm:flex-1" aria-label={`Cuenta contable de ${c.nombre}`}
            >
              <option value="">{tipo === 'ingreso' ? 'Sueldos (cuenta general)' : 'Otras deducciones por pagar (general)'}</option>
              {opciones.map((cu) => <option key={cu.id} value={cu.id}>{cu.codigo} · {cu.nombre}</option>)}
            </NativeSelect>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <HandCoins className="h-4 w-4 text-zero-600" /> Ingresos y descuentos
        <Badge variant="outline" className="ml-1">Contabilidad</Badge>
      </h2>
      <Card className="mb-8">
        <CardContent className="space-y-5 p-5">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Elige la cuenta de cada concepto para que el asiento de la nómina lo registre aparte. Los avances y
              préstamos suelen ir a una cuenta por cobrar a empleados. El bono vacacional puede ir a su propia cuenta de gasto. Las marcas «Cotiza a la TSS» y «Grava ISR» vienen de fábrica activadas para los ingresos, pero confírmalas con tu contable: cada tipo de pago se trata distinto. Se asignan a cada empleado desde su ficha.
              {sinCuentas && ' No tienes acceso al catálogo de cuentas: pídele a quien administra la contabilidad que las asigne.'}
            </span>
          </p>
          {grupo('ingreso', 'Ingresos', ['gasto', 'costo', 'pasivo'])}
          {grupo('descuento', 'Descuentos', ['activo', 'pasivo'])}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendiente !== null}
        onOpenChange={(o) => { if (!o) setPendiente(null); }}
        title="Cambiar cómo se trata este ingreso"
        description={pendiente && (() => {
          const n = pendiente.c.empleadosAfectados ?? 0;
          const partes = [
            pendiente.cambios.cotizaTss !== undefined
              ? `«${pendiente.c.nombre}» ${pendiente.cambios.cotizaTss ? 'pasará a cotizar' : 'dejará de cotizar'} a la TSS`
              : null,
            pendiente.cambios.gravaIsr !== undefined
              ? `«${pendiente.c.nombre}» ${pendiente.cambios.gravaIsr ? 'pasará a gravar' : 'dejará de gravar'} ISR`
              : null,
          ].filter(Boolean).join(' y ');
          return (
            <span className="block space-y-2" data-testid="resumen-cambio-marca">
              <span className="block">{partes}.</span>
              <span className="block">
                Afecta la TSS y el ISR de <strong>{n} empleado{n === 1 ? '' : 's'}</strong> que lo tienen asignado, desde la próxima
                corrida. Las corridas ya aprobadas no cambian. Confírmalo con tu contable.
              </span>
            </span>
          );
        })()}
        confirmLabel="Sí, cambiarlo"
        loading={pendiente !== null && guardando === pendiente.c.id}
        onConfirm={async () => {
          if (!pendiente) return;
          await cambiar(pendiente.c, pendiente.cambios);
          setPendiente(null);
        }}
      />
    </>
  );
}
