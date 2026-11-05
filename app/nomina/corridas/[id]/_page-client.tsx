'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR, { mutate as mutarCache } from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { FORMATOS_BANCO, FORMATO_POR_DEFECTO } from '@/lib/nomina/formatos-banco';
import { provisionesDeLineas } from '@/lib/nomina/provisiones';
import { LABEL_TIPO_CORRIDA } from '@/lib/nomina/corrida';
import { rangoLegible } from '@/lib/nomina/periodos';
import { partesDeHoras, totalHorasTexto, type ResumenHoras } from '@/lib/nomina/horas';
import { fmtFechaCorta } from '@/lib/utils/format';
import { toast } from '@/lib/toast';
import { ArrowLeft, Loader2, CheckCircle2, BookOpen, Download, Banknote, AlertTriangle, FileText, PiggyBank, Landmark, Trash2 } from 'lucide-react';

interface Corrida {
  id: number;
  periodo: string;
  fechaInicio: string;
  fechaFin: string;
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
  afpPatronalCents: number;
  sfsPatronalCents: number;
  srlPatronalCents: number;
  infotepPatronalCents: number;
  salarioCotizableCents: number | null;
  provisionRegaliaCents: number | null;
  provisionVacacionesCents: number | null;
  provisionCesantiaCents: number | null;
  dependientesAdicionales: number;
  dependientesAdicionalesCents: number;
  diasPagados: number | null;
  diasPeriodo: number | null;
  /** Quien cobra por hora: sus horas aprobadas del período. */
  horasDetalle: ResumenHoras | null;
  pagada: boolean;
}
interface Obligacion {
  id: number;
  destino: string;
  montoCents: number;
  pagada: boolean;
  pagadaEn: string | null;
  asientoId: number | null;
}
/**
 * Lo que se le dice a quien paga cuando la contabilidad está encendida pero el
 * asiento no salió: sin esto el pago quedaba registrado y el libro incompleto sin
 * que nadie se enterara.
 */
const MOTIVO_SIN_ASIENTO: Record<string, string> = {
  'sin-cuenta-cobro': 'falta la cuenta de esa forma de pago en Contabilidad → Configuración',
  'sin-cuenta-por-pagar': 'falta la cuenta por pagar en Contabilidad → Configuración',
  'sin-cuenta-gastos': 'falta la cuenta de gastos en Contabilidad → Configuración',
};

/** El texto del resultado contable de una operación, o null si no hay nada que decir. */
function textoAsiento(asiento?: { creado: boolean; asientoId?: number; motivo?: string } | null): string | null {
  if (!asiento) return null;
  if (asiento.creado) return `asiento #${asiento.asientoId}`;
  if (!asiento.motivo || asiento.motivo === 'contabilidad-apagada' || asiento.motivo === 'ya-tiene-asiento') return null;
  return `sin asiento: ${MOTIVO_SIN_ASIENTO[asiento.motivo] ?? asiento.motivo}`;
}

const LABEL_DESTINO: Record<string, string> = {
  TSS: 'TSS · Seguridad Social',
  DGII: 'DGII · ISR retenido',
};

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
    afpEmpleadoCents: number;
    sfsEmpleadoCents: number;
    afpPatronalCents: number;
    sfsPatronalCents: number;
    afpTotalCents: number;
    sfsTotalCents: number;
    srlPatronalCents: number;
    infotepPatronalCents: number;
    dependientesAdicionalesCents: number;
    totalTSSCents: number;
  };
  nota: string;
}

export default function CorridaDetalleClient({ id }: { id: string }) {
  const { can } = usePermissions();
  const puedeCorrer = can('nomina:correr');
  const puedePagar = can('nomina:pagar');
  const { data, isLoading, mutate } = useSWR<{ corrida: Corrida; lineas: Linea[]; obligaciones: Obligacion[]; horasPendientes?: number }>(`/api/nomina/corridas/${id}`, fetcher);
  const [confirmar, setConfirmar] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [pagandoEmp, setPagandoEmp] = useState(false);
  const [pagandoObl, setPagandoObl] = useState<number | null>(null);
  const [metodoObl, setMetodoObl] = useState<'efectivo' | 'transferencia' | 'cheque'>('transferencia');
  const [metodoEmp, setMetodoEmp] = useState<'efectivo' | 'transferencia' | 'cheque'>('transferencia');
  const [descargandoTSS, setDescargandoTSS] = useState(false);
  const [formato, setFormato] = useState(FORMATO_POR_DEFECTO);
  const [borrar, setBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  // Candado de las operaciones que mueven dinero o estado. Un ref y no estado de
  // React: entre la respuesta y el re-render el botón volvía a habilitarse un
  // instante, y un segundo clic ahí devolvía el 409 de «ya pagada».
  const ocupadoRef = useRef(false);
  const router = useRouter();

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
  const obligaciones = data.obligaciones ?? [];
  const b = BADGE[corrida.estado] ?? BADGE.borrador;
  // Provisiones del período (regalía/vacaciones/cesantía): estimación lineal
  // sobre el bruto de cada línea. No se descuenta al empleado; es costo futuro.
  const prov = provisionesDeLineas(lineas);
  // Cómo se reparten los totales, para que la TSS, las deducciones y el costo
  // patronal se puedan cuadrar a ojo (en la reunión parecían «descuadrados»).
  const suma = (f: (l: Linea) => number) => lineas.reduce((s, l) => s + f(l), 0);
  const tssEmpleado = suma((l) => l.afpEmpleadoCents + l.sfsEmpleadoCents + (l.dependientesAdicionalesCents ?? 0));
  const isrTotal = suma((l) => l.isrCents);
  const tssEmpresa = suma((l) => l.afpPatronalCents + l.sfsPatronalCents + l.srlPatronalCents);
  const infotepTotal = suma((l) => l.infotepPatronalCents);

  const aprobada = corrida.estado !== 'borrador';
  const empPagados = lineas.filter((l) => l.pagada).length;
  const netoPendiente = lineas.filter((l) => !l.pagada).reduce((s, l) => s + l.netoCents, 0);
  const oblPendiente = obligaciones.filter((o) => !o.pagada).reduce((s, o) => s + o.montoCents, 0);
  const seleccionables = lineas.filter((l) => !l.pagada);
  const todosSel = seleccionables.length > 0 && seleccionables.every((l) => sel.has(l.id));
  const toggleSel = (lid: number) => setSel((s) => { const n = new Set(s); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });
  const toggleTodosSel = () => setSel(todosSel ? new Set() : new Set(seleccionables.map((l) => l.id)));

  async function aprobar() {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setAprobando(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/aprobar`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo aprobar');
      const contable = textoAsiento(j.asiento);
      toast.success(contable ? `Corrida aprobada · ${contable}` : 'Corrida aprobada');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
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
      a.download = `dispersion-nomina-${corrida.fechaInicio}-${formato}.csv`;
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

  async function pagarEmpleados(cuerpo: { lineaIds: number[] } | { todos: true }) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setPagandoEmp(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/pagar-empleados`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, metodo: metodoEmp }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar el pago');
      const contable = textoAsiento(j.asiento);
      toast.success(`Pago a empleados registrado${contable ? ` · ${contable}` : ''}`);
      setSel(new Set());
      // Se espera la recarga ANTES de soltar el botón: así lo pagado ya no está
      // en pantalla cuando el botón vuelve a poder pulsarse.
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setPagandoEmp(false);
    }
  }

  async function pagarObligacion(oblId: number) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setPagandoObl(oblId);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}/obligaciones/${oblId}/pagar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metodo: metodoObl }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo registrar el pago');
      const contable = textoAsiento(j.asiento);
      toast.success(`Obligación pagada${contable ? ` · ${contable}` : ''}`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setPagandoObl(null);
    }
  }

  /** Un borrador todavía no tiene efecto contable: se puede borrar entero. */
  async function borrarBorrador() {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setBorrando(true);
    try {
      const res = await fetch(`/api/nomina/corridas/${id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo borrar el borrador');
      toast.success('Borrador eliminado');
      // Se saca de la lista en caché ANTES de volver: sin esto la lista seguía
      // enseñando el borrador borrado hasta la siguiente recarga.
      await mutarCache<{ corridas: { id: number }[] }>(
        '/api/nomina/corridas',
        (actual) => (actual ? { ...actual, corridas: actual.corridas.filter((c) => c.id !== Number(id)) } : actual),
        { revalidate: true },
      );
      router.push('/nomina/corridas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
      setBorrando(false);
      setBorrar(false);
    } finally {
      ocupadoRef.current = false;
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
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
            Del {rangoLegible({ inicio: corrida.fechaInicio, fin: corrida.fechaFin })} · {LABEL_TIPO_CORRIDA[corrida.tipo] ?? corrida.tipo} · tasas {corrida.anioTasas}
            {corrida.fechaPago ? ` · pago ${fmtFechaCorta(corrida.fechaPago)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {corrida.asientoId && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" /> Asiento #{corrida.asientoId}
            </span>
          )}
          {corrida.estado === 'borrador' && puedeCorrer && (
            <>
              <Button variant="outline" onClick={() => setBorrar(true)} className="gap-1.5 text-red-600 hover:text-red-700">
                <Trash2 className="h-4 w-4" /> Borrar borrador
              </Button>
              <Button onClick={() => setConfirmar(true)} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Aprobar corrida
              </Button>
            </>
          )}
          {corrida.estado !== 'borrador' && puedePagar && (
            <div className="flex flex-wrap items-center gap-1.5">
              <NativeSelect
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                // En línea: el ancho 100% del select estilizado le gana a w-auto y empujaba los botones abajo.
                style={{ width: 'auto', height: 36 }}
                title="Formato del archivo según tu banco"
              >
                {FORMATOS_BANCO.map((f) => (
                  <option key={f.key} value={f.key}>{f.nombre}</option>
                ))}
              </NativeSelect>
              <Button variant="outline" onClick={descargarDispersion} disabled={descargando} className="shrink-0 gap-1.5 whitespace-nowrap">
                {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar dispersión
              </Button>
              <Button variant="outline" onClick={descargarTSS} disabled={descargandoTSS} className="shrink-0 gap-1.5 whitespace-nowrap" title="Autodeterminación de la TSS (CSV)">
                {descargandoTSS ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                Autodeterminación TSS
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Aviso: horas sin revisar en estas fechas; el borrador solo paga las aprobadas */}
      {corrida.estado === 'borrador' && (data?.horasPendientes ?? 0) > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" data-testid="aviso-horas-pendientes">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-medium">
              {data?.horasPendientes} registro{data?.horasPendientes === 1 ? '' : 's'} de horas sin revisar en estas fechas.
            </span>{' '}
            Esta corrida paga solo las horas aprobadas: revísalas en{' '}
            <Link href="/nomina/horas" className="font-medium underline">Horas</Link>, borra este borrador y vuelve a generarlo.
          </div>
        </div>
      )}

      {/* Aviso: empleados sin cuenta de banco que quedan fuera de la dispersión */}
      {corrida.estado === 'aprobada' && preview && preview.incompletos.length > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-medium">{preview.incompletos.length} empleado(s) quedan fuera del archivo del banco</span>:{' '}
            {preview.incompletos.map((i) => `${i.nombre}: ${i.motivo.toLowerCase()}`).join('; ')}. Complétalo en su
            ficha para incluirlos.
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
        <Totales
          titulo="Deducciones"
          valor={pesos(corrida.totalDeduccionesCents)}
          sub={`TSS ${pesos(tssEmpleado)} · ISR ${pesos(isrTotal)}`}
        />
        <Totales titulo="Neto a pagar" valor={pesos(corrida.totalNetoCents)} destacado sub="Bruto − deducciones" />
        <Totales
          titulo="Costo patronal"
          valor={pesos(corrida.totalPatronalCents)}
          sub={`TSS ${pesos(tssEmpresa)} · INFOTEP ${pesos(infotepTotal)}`}
        />
      </div>

      {/* Provisiones del período (regalía, vacaciones, cesantía) */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <PiggyBank className="h-4 w-4 text-zero-600" /> Provisiones del período
            </div>
            <span className="text-xs text-muted-foreground">
              {lineas.every((l) => l.provisionCesantiaCents != null)
                ? 'Según la antigüedad de cada empleado · costo de la empresa, no se descuenta'
                : 'Estimación lineal (corrida anterior al cálculo por antigüedad) · no se descuenta'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini titulo="Regalía (13.º)" valor={pesos(prov.regaliaCents)} sub="1/12 de lo devengado, con tope de 5 mínimos" />
            <Mini titulo="Vacaciones" valor={pesos(prov.vacacionesCents)} sub="14 días al año, 18 desde los 5 años" />
            <Mini titulo="Cesantía" valor={pesos(prov.cesantiaCents)} sub="Lo que subió la cesantía ganada (0 antes de 3 meses)" />
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
            <div className={`grid grid-cols-2 gap-3 ${previewTSS.totales.dependientesAdicionalesCents > 0 ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-5'}`}>
              <Mini
                titulo="AFP (pensiones)"
                valor={pesos(previewTSS.totales.afpTotalCents)}
                sub={`Empleados ${pesos(previewTSS.totales.afpEmpleadoCents)} · Empresa ${pesos(previewTSS.totales.afpPatronalCents)}`}
              />
              <Mini
                titulo="SFS (salud)"
                valor={pesos(previewTSS.totales.sfsTotalCents)}
                sub={`Empleados ${pesos(previewTSS.totales.sfsEmpleadoCents)} · Empresa ${pesos(previewTSS.totales.sfsPatronalCents)}`}
              />
              <Mini titulo="SRL (riesgo)" valor={pesos(previewTSS.totales.srlPatronalCents)} sub="Empresa" />
              <Mini titulo="INFOTEP" valor={pesos(previewTSS.totales.infotepPatronalCents)} sub="Empresa" />
              {previewTSS.totales.dependientesAdicionalesCents > 0 && (
                <Mini titulo="Dependientes adicionales" valor={pesos(previewTSS.totales.dependientesAdicionalesCents)} sub="Empleados" />
              )}
              <Mini
                titulo="Total TSS"
                valor={pesos(previewTSS.totales.totalTSSCents)}
                destacado
                sub={`Empleados ${pesos(tssEmpleado)} · Empresa ${pesos(tssEmpresa + infotepTotal)}`}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground" data-testid="cuadre-tss">
              Cómo cuadra: lo de los empleados ({pesos(tssEmpleado)}) sale de las deducciones, que además llevan el ISR
              ({pesos(isrTotal)}) que se paga a la DGII; lo de la empresa ({pesos(tssEmpresa + infotepTotal)}) es el costo patronal.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Obligaciones al Estado (se pagan aparte y después) */}
      {aprobada && obligaciones.length > 0 && (
        <Card className="mb-5">
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Landmark className="h-4 w-4 text-zero-600" /> Obligaciones al Estado
              </div>
              {puedePagar && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Pagar con</span>
                  <NativeSelect value={metodoObl} onChange={(e) => setMetodoObl(e.target.value as typeof metodoObl)} className="h-8 w-auto">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                  </NativeSelect>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {obligaciones.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{LABEL_DESTINO[o.destino] ?? o.destino}</span>
                      {o.pagada
                        ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Pagada</Badge>
                        : <Badge variant="outline" className="border-amber-400 text-amber-700">Pendiente</Badge>}
                    </div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums">{pesos(o.montoCents)}</div>
                    {o.pagada && o.pagadaEn && (
                      <div className="text-xs text-muted-foreground">
                        Pagada el {new Date(o.pagadaEn).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {o.asientoId ? ` · asiento #${o.asientoId}` : ''}
                      </div>
                    )}
                  </div>
                  {puedePagar && !o.pagada && (
                    <Button size="sm" onClick={() => pagarObligacion(o.id)} disabled={pagandoObl !== null || pagandoEmp} className="shrink-0 gap-1.5">
                      {pagandoObl === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
                      Registrar pago
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {oblPendiente > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Pendiente a la TSS/DGII: <span className="font-medium">{pesos(oblPendiente)}</span></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Barra de pago a empleados */}
      {aprobada && puedePagar && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{empPagados}</span> de {lineas.length} empleados pagados
            {netoPendiente > 0 && <> · neto pendiente <span className="font-medium text-foreground">{pesos(netoPendiente)}</span></>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {seleccionables.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Pagar con</span>
                <NativeSelect
                  aria-label="Método de pago a empleados"
                  value={metodoEmp}
                  onChange={(e) => setMetodoEmp(e.target.value as typeof metodoEmp)}
                  style={{ width: 'auto', height: 32 }}
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                </NativeSelect>
              </div>
            )}
            {sel.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => pagarEmpleados({ lineaIds: [...sel] })} disabled={pagandoEmp || pagandoObl !== null} className="gap-1.5">
                {pagandoEmp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
                Marcar pagados ({sel.size})
              </Button>
            )}
            {seleccionables.length > 0 && (
              <Button size="sm" onClick={() => pagarEmpleados({ todos: true })} disabled={pagandoEmp || pagandoObl !== null} className="gap-1.5">
                <Banknote className="h-3.5 w-3.5" /> Marcar todos pagados
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tabla de líneas */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {aprobada && puedePagar && (
                    <th className="w-10 px-3 py-2">
                      <input type="checkbox" checked={todosSel} onChange={toggleTodosSel}
                        disabled={seleccionables.length === 0} className="h-4 w-4 cursor-pointer accent-zero-600"
                        aria-label="Seleccionar todos" />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Empleado</th>
                  <th className="px-3 py-2 text-right font-medium">Bruto</th>
                  <th className="px-3 py-2 text-right font-medium">AFP</th>
                  <th className="px-3 py-2 text-right font-medium">SFS</th>
                  <th className="px-3 py-2 text-right font-medium">ISR</th>
                  <th className="px-3 py-2 text-right font-medium">Neto</th>
                  {aprobada && <th className="px-3 py-2 text-center font-medium">Pago</th>}
                  <th className="px-3 py-2 text-right font-medium">Volante</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    {aprobada && puedePagar && (
                      <td className="px-3 py-2">
                        {!l.pagada && (
                          <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggleSel(l.id)}
                            className="h-4 w-4 cursor-pointer accent-zero-600" aria-label={`Seleccionar ${l.nombre}`} />
                        )}
                      </td>
                    )}
                    <td className="min-w-[13rem] px-3 py-2">
                      <div className="font-medium">{l.nombre}</div>
                      {l.cargo && <div className="text-xs text-muted-foreground">{l.cargo}</div>}
                      {l.horasDetalle ? (
                        <div className="text-xs text-muted-foreground" data-testid="detalle-horas">
                          {totalHorasTexto(l.horasDetalle)} h a {pesos(l.horasDetalle.tarifaHoraCents)} en {l.horasDetalle.dias} día{l.horasDetalle.dias === 1 ? '' : 's'}
                          {partesDeHoras(l.horasDetalle).length > 0 && (
                            <span className="block">{partesDeHoras(l.horasDetalle).join(' · ')}</span>
                          )}
                        </div>
                      ) : l.diasPagados != null && l.diasPeriodo != null && l.diasPagados < l.diasPeriodo && (
                        <div className="text-xs text-amber-700" title="Entró o salió dentro del período: cobra solo sus días">
                          {l.diasPagados} de {l.diasPeriodo} días
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pesos(l.brutoCents)}
                      {l.salarioCotizableCents != null && l.salarioCotizableCents > l.brutoCents && (
                        <div className="text-xs text-amber-700" title="El salario está por debajo del mínimo del sector: la TSS cobra sobre el mínimo">
                          cotiza {pesos(l.salarioCotizableCents)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pesos(l.afpEmpleadoCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {pesos(l.sfsEmpleadoCents)}
                      {l.dependientesAdicionalesCents > 0 && (
                        <div className="text-xs" title="Cápita de dependientes adicionales del seguro de salud">
                          +{pesos(l.dependientesAdicionalesCents)} · {l.dependientesAdicionales} dep.
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pesos(l.isrCents)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{pesos(l.netoCents)}</td>
                    {aprobada && (
                      <td className="px-3 py-2 text-center">
                        {l.pagada
                          ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Pagado</Badge>
                          : <Badge variant="outline" className="border-amber-400 text-amber-700">Pendiente</Badge>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
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
        loading={aprobando}
        onConfirm={aprobar}
      />

      <ConfirmDialog
        open={borrar}
        onOpenChange={setBorrar}
        title="Borrar este borrador"
        description="Se borra la corrida con todas sus líneas. Todavía no tiene asiento ni pagos, así que no afecta nada más. Puedes volver a calcularla cuando quieras."
        confirmLabel={borrando ? 'Borrando…' : 'Borrar borrador'}
        loading={borrando}
        destructive
        onConfirm={borrarBorrador}
      />

    </div>
  );
}

function Totales({ titulo, valor, destacado, sub }: { titulo: string; valor: string; destacado?: boolean; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-1 font-semibold ${destacado ? 'text-lg text-zero-700' : ''}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

/** Celda compacta para los desgloses de provisiones y TSS (sin Card propia). */
function Mini({ titulo, valor, destacado, sub }: { titulo: string; valor: string; destacado?: boolean; sub?: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${destacado ? 'text-zero-700' : ''}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</div>}
    </div>
  );
}
