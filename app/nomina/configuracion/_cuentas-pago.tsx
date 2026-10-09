'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { Info, Wallet } from 'lucide-react';

// De qué caja o banco sale el dinero de la nómina. Se fija una vez aquí; al pagar
// se puede cambiar para ese pago. Sin elegir, el pago sale de la cuenta del método
// (efectivo a caja, lo demás a bancos), como siempre.

interface Respuesta {
  cuentas: { id: number; codigo: string; nombre: string }[];
  efectivoId: number | null;
  bancoId: number | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CuentasPagoNomina() {
  const { data, mutate } = useSWR<Respuesta>('/api/nomina/cuentas-pago', fetcher);
  const [guardando, setGuardando] = useState<'efectivoId' | 'bancoId' | null>(null);

  if (!data || !Array.isArray(data.cuentas)) return null;

  async function cambiar(campo: 'efectivoId' | 'bancoId', valor: string) {
    setGuardando(campo);
    try {
      const res = await fetch('/api/nomina/cuentas-pago', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor ? Number(valor) : null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      await mutate();
      toast.success('Cuenta de pago guardada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(null);
    }
  }

  const campo = (clave: 'efectivoId' | 'bancoId', titulo: string, ayuda: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{titulo}</Label>
      <NativeSelect
        value={data[clave] ?? ''} disabled={guardando !== null}
        onChange={(e) => cambiar(clave, e.target.value)} aria-label={titulo}
      >
        <option value="">Según el método de pago (por defecto)</option>
        {data.cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">{ayuda}</p>
    </div>
  );

  return (
    <>
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <Wallet className="h-4 w-4 text-zero-600" /> De dónde sale el pago
      </h2>
      <Card className="mb-8">
        <CardContent className="space-y-4 p-5">
          {campo('efectivoId', 'Pagos en efectivo', 'La caja de la que sale el sueldo que se paga en efectivo.')}
          {campo('bancoId', 'Pagos por transferencia o cheque', 'El banco de donde sale la nómina, la TSS y la DGII.')}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Solo cambia pagos futuros. Al pagar una corrida puedes elegir otra cuenta para ese pago.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
