'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { ArrowLeft, Loader2, CheckCircle2, BookOpen } from 'lucide-react';

interface Corrida {
  id: number;
  periodo: string;
  descripcion: string;
  tipo: string;
  fechaPago: string | null;
  estado: string;
  anioTasas: number;
  totalBrutoCents: number;
  totalDeduccionesCents: number;
  totalNetoCents: number;
  totalPatronalCents: number;
  asientoId: number | null;
}
interface Linea {
  id: number;
  nombre: string;
  cedula: string | null;
  cargo: string | null;
  brutoCents: number;
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  isrCents: number;
  totalDeduccionesCents: number;
  netoCents: number;
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

export default function CorridaDetalleClient({ id }: { id: string }) {
  const { can } = usePermissions();
  const puedeCorrer = can('nomina:correr');
  const { data, isLoading, mutate } = useSWR<{ corrida: Corrida; lineas: Linea[] }>(`/api/nomina/corridas/${id}`, fetcher);
  const [confirmar, setConfirmar] = useState(false);
  const [aprobando, setAprobando] = useState(false);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!data?.corrida) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-center text-muted-foreground">Corrida no encontrada.</div>;
  }

  const { corrida, lineas } = data;
  const b = BADGE[corrida.estado] ?? BADGE.borrador;

  async function aprobar() {
    setAprobando(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/aprobar`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo aprobar');
      toast.success(j.asiento?.creado ? 'Corrida aprobada y asentada en contabilidad' : 'Corrida aprobada');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setAprobando(false);
      setConfirmar(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/nomina/corridas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Corridas
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{corrida.descripcion}</h1>
            <Badge variant={b.variant}>{b.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Período {corrida.periodo} · {corrida.tipo} · tasas {corrida.anioTasas}
            {corrida.fechaPago ? ` · pago ${corrida.fechaPago}` : ''}
          </p>
        </div>
        {corrida.estado === 'borrador' && puedeCorrer && (
          <Button onClick={() => setConfirmar(true)} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Aprobar corrida
          </Button>
        )}
        {corrida.asientoId && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" /> Asiento #{corrida.asientoId}
          </span>
        )}
      </div>

      {/* Totales */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Totales titulo="Bruto"       valor={pesos(corrida.totalBrutoCents)} />
        <Totales titulo="Deducciones" valor={pesos(corrida.totalDeduccionesCents)} />
        <Totales titulo="Neto a pagar" valor={pesos(corrida.totalNetoCents)} destacado />
        <Totales titulo="Costo patronal" valor={pesos(corrida.totalPatronalCents)} />
      </div>

      {/* Tabla de líneas */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Empleado</th>
                  <th className="px-4 py-2 text-right font-medium">Bruto</th>
                  <th className="px-4 py-2 text-right font-medium">AFP</th>
                  <th className="px-4 py-2 text-right font-medium">SFS</th>
                  <th className="px-4 py-2 text-right font-medium">ISR</th>
                  <th className="px-4 py-2 text-right font-medium">Neto</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{l.nombre}</div>
                      {l.cargo && <div className="text-xs text-muted-foreground">{l.cargo}</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{pesos(l.brutoCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{pesos(l.afpEmpleadoCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{pesos(l.sfsEmpleadoCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{pesos(l.isrCents)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{pesos(l.netoCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Aprobar la corrida"
        description="Se genera el asiento contable del devengo y la corrida queda lista para pagar. No podrás editarla después."
        confirmLabel={aprobando ? 'Aprobando…' : 'Aprobar'}
        onConfirm={aprobar}
      />
    </div>
  );
}

function Totales({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-1 font-semibold ${destacado ? 'text-lg text-zero-700' : ''}`}>{valor}</div>
    </CardContent></Card>
  );
}
