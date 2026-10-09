'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { HandCoins, Info } from 'lucide-react';

// Catálogo de ingresos y descuentos de la empresa y la cuenta contable de cada
// uno. Sin cuenta, un ingreso va a sueldos y un descuento a «otras deducciones
// por pagar»; con ella, el asiento de la nómina lo manda a su propia cuenta
// (incentivos → gasto de incentivos, avances → cuentas por cobrar a empleados).

interface Concepto {
  id: number; codigo: string; nombre: string; tipo: 'ingreso' | 'descuento';
  cotizaTss: boolean; cuentaId: number | null; activo: boolean;
}
interface CuentaPlana {
  id: number; codigo: string; nombre: string; tipo: string; imputable: boolean; activa: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ConceptosNomina() {
  const { data, mutate } = useSWR<{ conceptos: Concepto[] }>('/api/nomina/conceptos', fetcher);
  const { data: dCuentas } = useSWR<{ cuentas?: CuentaPlana[] }>('/api/contabilidad/cuentas?plano=true', fetcher);
  const [guardando, setGuardando] = useState<number | null>(null);

  const conceptos = (data?.conceptos ?? []).filter((c) => c.activo);
  const cuentas = (dCuentas?.cuentas ?? []).filter((c) => c.imputable && c.activa);
  const sinCuentas = dCuentas !== undefined && !dCuentas.cuentas;

  async function cambiar(c: Concepto, cambios: Partial<Pick<Concepto, 'cuentaId' | 'cotizaTss'>>) {
    setGuardando(c.id);
    try {
      const res = await fetch('/api/nomina/conceptos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, ...cambios }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(null);
    }
  }

  const grupo = (tipo: 'ingreso' | 'descuento', titulo: string, sugeridas: string[]) => {
    const filas = conceptos.filter((c) => c.tipo === tipo);
    const opciones = [...cuentas].sort((a, b) => Number(sugeridas.includes(b.tipo)) - Number(sugeridas.includes(a.tipo)) || a.codigo.localeCompare(b.codigo));
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{titulo}</div>
        {filas.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 rounded-md border p-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{c.nombre}</span>
              {tipo === 'ingreso' && (
                <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" checked={c.cotizaTss} disabled={guardando === c.id}
                    onChange={(e) => cambiar(c, { cotizaTss: e.target.checked })}
                    className="h-3.5 w-3.5 cursor-pointer accent-zero-600"
                  />
                  Cotiza a la TSS y entra al ISR
                </label>
              )}
            </div>
            <NativeSelect
              value={c.cuentaId ?? ''} disabled={guardando === c.id || sinCuentas}
              onChange={(e) => cambiar(c, { cuentaId: e.target.value ? Number(e.target.value) : null })}
              className="sm:w-72" aria-label={`Cuenta contable de ${c.nombre}`}
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
              préstamos suelen ir a una cuenta por cobrar a empleados. Se asignan a cada empleado desde su ficha.
              {sinCuentas && ' No tienes acceso al catálogo de cuentas: pídele a quien administra la contabilidad que las asigne.'}
            </span>
          </p>
          {grupo('ingreso', 'Ingresos', ['gasto', 'costo'])}
          {grupo('descuento', 'Descuentos', ['activo', 'pasivo'])}
        </CardContent>
      </Card>
    </>
  );
}
