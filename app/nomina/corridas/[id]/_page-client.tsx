'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { FORMATOS_BANCO, FORMATO_POR_DEFECTO } from '@/lib/nomina/formatos-banco';
import { provisionesDeLineas } from '@/lib/nomina/provisiones';
import { toast } from '@/lib/toast';
import { ArrowLeft, Loader2, CheckCircle2, BookOpen, Download, Banknote, AlertTriangle, FileText, PiggyBank, Landmark } from 'lucide-react';

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

interface PreviewDispersion {
  totalBeneficiarios: number;
  totalCents: number;
  incompletos: { empleadoId: number; nombre: string; motivo: string }[];
  nota?: string;
}

interface PreviewTSS {
  totalEmpleados: number;
  totales: {
    afpTotalCents: number;
    sfsTotalCents: number;
    srlPatronalCents: number;
    infotepPatronalCents: number;
    totalTSSCents: number;
  };
  nota: string;
}

export default function CorridaDetalleClient({ id }: { id: string }) {
  const { can } = usePermissions();
  const puedeCorrer = can('nomina:correr');
  const puedePagar = can('nomina:pagar');
  const { data, isLoading, mutate } = useSWR<{ corrida: Corrida; lineas: Linea[] }>(`/api/nomina/corridas/${id}`, fetcher);
  const [confirmar, setConfirmar] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [confirmarPago, setConfirmarPago] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [descargandoTSS, setDescargandoTSS] = useState(false);
  const [formato, setFormato] = useState(FORMATO_POR_DEFECTO);

  const yaAprobada = data?.corrida && data.corrida.estado !== 'borrador';
  const { data: preview } = useSWR<PreviewDispersion>(
    yaAprobada && puedePagar ? `/api/nomina/corridas/${id}/dispersion?preview=1&formato=${formato}` : null,
    fetcher,
  );
  const { data: previewTSS } = useSWR<PreviewTSS>(
    yaAprobada && puedePagar ? `/api/nomina/corridas/${id}/tss?preview=1` : null,
    fetcher,
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!data?.corrida) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-center text-muted-foreground">Corrida no encontrada.</div>;
  }

  const { corrida, lineas } = data;
  const b = BADGE[corrida.estado] ?? BADGE.borrador;
  // Provisiones del período (regalía/vacaciones/cesantía): estimación lineal
  // sobre el bruto de cada línea. No se descuenta al empleado; es costo futuro.
  const prov = provisionesDeLineas(lineas);

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

  async function descargarDispersion() {
    setDescargando(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/dispersion?formato=${formato}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo generar el archivo');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispersion-nomina-${corrida.periodo}-${formato}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setDescargando(false);
    }
  }

  async function descargarTSS() {
    setDescargandoTSS(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/tss`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo generar el archivo');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autodeterminacion-tss-${corrida.periodo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setDescargandoTSS(false);
    }
  }

  async function pagar() {
    setPagando(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/pagar`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo marcar como pagada');
      toast.success('Corrida marcada como pagada');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setPagando(false);
      setConfirmarPago(false);
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
        <div className="flex flex-wrap items-center gap-2">
          {corrida.asientoId && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" /> Asiento #{corrida.asientoId}
            </span>
          )}
          {corrida.estado === 'borrador' && puedeCorrer && (
            <Button onClick={() => setConfirmar(true)} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Aprobar corrida
            </Button>
          )}
          {corrida.estado !== 'borrador' && puedePagar && (
            <div className="flex items-center gap-1.5">
              <NativeSelect
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                className="h-9 w-auto"
                title="Formato del archivo según tu banco"
              >
                {FORMATOS_BANCO.map((f) => (
                  <option key={f.key} value={f.key}>{f.nombre}</option>
                ))}
              </NativeSelect>
              <Button variant="outline" onClick={descargarDispersion} disabled={descargando} className="gap-1.5">
                {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar dispersión
              </Button>
              <Button variant="outline" onClick={descargarTSS} disabled={descargandoTSS} className="gap-1.5" title="Autodeterminación de la TSS (CSV)">
                {descargandoTSS ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                Autodeterminación TSS
              </Button>
            </div>
          )}
          {corrida.estado === 'aprobada' && puedePagar && (
            <Button onClick={() => setConfirmarPago(true)} className="gap-1.5">
              <Banknote className="h-4 w-4" /> Marcar como pagada
            </Button>
          )}
        </div>
      </div>

      {/* Aviso: empleados sin cuenta de banco que quedan fuera de la dispersión */}
      {corrida.estado === 'aprobada' && preview && preview.incompletos.length > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-medium">{preview.incompletos.length} empleado(s) sin cuenta de banco</span> quedan
            fuera del archivo: {preview.incompletos.map((i) => i.nombre).join(', ')}. Complétales la cuenta en su ficha
            para incluirlos.
          </div>
        </div>
      )}

      {/* Aviso de verificación cuando se elige un preset de banco */}
      {corrida.estado !== 'borrador' && preview?.nota && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{preview.nota}</div>
        </div>
      )}

      {/* Totales */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Totales titulo="Bruto"       valor={pesos(corrida.totalBrutoCents)} />
        <Totales titulo="Deducciones" valor={pesos(corrida.totalDeduccionesCents)} />
        <Totales titulo="Neto a pagar" valor={pesos(corrida.totalNetoCents)} destacado />
        <Totales titulo="Costo patronal" valor={pesos(corrida.totalPatronalCents)} />
      </div>

      {/* Provisiones del período (regalía, vacaciones, cesantía) */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <PiggyBank className="h-4 w-4 text-zero-600" /> Provisiones del período
            </div>
            <span className="text-xs text-muted-foreground">Estimación — costo del empleador, no se descuenta al empleado</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini titulo="Regalía (13.º)" valor={pesos(prov.regaliaCents)} />
            <Mini titulo="Vacaciones" valor={pesos(prov.vacacionesCents)} />
            <Mini titulo="Cesantía" valor={pesos(prov.cesantiaCents)} />
            <Mini titulo="Total provisión" valor={pesos(prov.totalCents)} destacado />
          </div>
        </CardContent>
      </Card>

      {/* Resumen de la autodeterminación TSS (aprobada) */}
      {corrida.estado !== 'borrador' && puedePagar && previewTSS && (
        <Card className="mb-5">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Landmark className="h-4 w-4 text-zero-600" /> A pagar a la TSS
              </div>
              <span className="text-xs text-muted-foreground">{previewTSS.nota}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Mini titulo="AFP (pensiones)" valor={pesos(previewTSS.totales.afpTotalCents)} />
              <Mini titulo="SFS (salud)" valor={pesos(previewTSS.totales.sfsTotalCents)} />
              <Mini titulo="SRL (riesgo)" valor={pesos(previewTSS.totales.srlPatronalCents)} />
              <Mini titulo="INFOTEP" valor={pesos(previewTSS.totales.infotepPatronalCents)} />
              <Mini titulo="Total TSS" valor={pesos(previewTSS.totales.totalTSSCents)} destacado />
            </div>
          </CardContent>
        </Card>
      )}

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
                  <th className="px-4 py-2 text-right font-medium">Volante</th>
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
                    <td className="px-4 py-2 text-right">
                      <a
                        href={`/api/nomina/corridas/${id}/volante/${l.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        title="Abrir volante de pago (PDF)"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
                    </td>
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

      <ConfirmDialog
        open={confirmarPago}
        onOpenChange={setConfirmarPago}
        title="Marcar la corrida como pagada"
        description="Confírmalo una vez que hayas subido el archivo de dispersión a tu banca en línea. Queda registrada la fecha de pago; la app no mueve el dinero."
        confirmLabel={pagando ? 'Guardando…' : 'Sí, ya la pagué'}
        onConfirm={pagar}
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

/** Celda compacta para los desgloses de provisiones y TSS (sin Card propia). */
function Mini({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${destacado ? 'text-zero-700' : ''}`}>{valor}</div>
    </div>
  );
}
