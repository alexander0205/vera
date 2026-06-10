'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Pencil, Zap, Loader2, RefreshCw, CalendarClock,
  AlertTriangle, FileText, ChevronRight,
} from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FacturaRecurrente {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipoEcf: string;
  tipoPago: number;
  diasParaPago: number | null;
  frecuencia: string;
  diaCobro: number | null;
  fechaInicio: string;
  fechaFin: string | null;
  proximaEmision: string;
  estado: string;
  notas: string | null;
  totalEstimado: number;
  facturasEmitidas: number;
  clientId: number | null;
}

interface FacturaTimeline {
  id: number;
  codigo: string | null;
  encf: string;
  montoTotal: number;
  estadoPago: string;
  pagado: number;
  saldo: number;
}

interface PeriodoTimeline {
  fecha: string;
  montoEstimado: number;
  factura: FacturaTimeline | null;
}

interface DetalleResponse {
  facturaRecurrente: FacturaRecurrente;
  clienteRazonSocial: string | null;
  periodos: PeriodoTimeline[];
  facturasSinPeriodo: FacturaTimeline[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FRECUENCIA_LABEL: Record<string, string> = {
  diario:      'Diario',
  semanal:     'Semanal',
  quincenal:   'Quincenal',
  mensual:     'Mensual',
  bimestral:   'Bimestral',
  trimestral:  'Trimestral',
  semestral:   'Semestral',
  anual:       'Anual',
};

function estadoBadge(estado: string) {
  switch (estado) {
    case 'activa':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 border">Activa</Badge>;
    case 'pausada':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 border">Pausada</Badge>;
    case 'finalizada':
      return <Badge variant="outline" className="text-gray-500 border-gray-300">Finalizada</Badge>;
    default:
      return <Badge variant="outline">{estado}</Badge>;
  }
}

function estadoPagoBadge(estadoPago: string) {
  switch (estadoPago) {
    case 'PAGADA':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 border">Pagada</Badge>;
    case 'PARCIAL':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 border">Parcial</Badge>;
    case 'PENDIENTE':
      return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200 border">Pendiente</Badge>;
    case 'ANULADA':
      return <Badge variant="outline" className="text-gray-500 border-gray-300 line-through">Anulada</Badge>;
    case 'GRATUITA':
      return <Badge variant="outline" className="text-gray-500 border-gray-300">Gratuita</Badge>;
    case 'USO':
      return <Badge variant="outline" className="text-gray-500 border-gray-300">Uso</Badge>;
    default:
      return <Badge variant="outline">{estadoPago}</Badge>;
  }
}

// ─── Tarjeta de sección reutilizable ───────────────────────────────────────────

function Card({ title, icon, children, action }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="text-sm font-medium text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturaRecurrenteDetallePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [data, setData]       = useState<DetalleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [generandoPeriodo, setGenerandoPeriodo] = useState<string | null>(null);
  const didLoad = useRef(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facturas-recurrentes/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error cargando la factura recurrente');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando la factura recurrente');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!didLoad.current) { didLoad.current = true; cargar(); }
  }, [cargar]);

  // Genera una factura. Si se pasa `periodo`, genera ESE período del schedule;
  // si no, genera la proximaEmision ("Generar ahora").
  async function handleGenerar(periodo?: string) {
    if (!id) return;
    if (periodo) setGenerandoPeriodo(periodo); else setGenerando(true);
    try {
      const res = await fetch(`/api/facturas-recurrentes/${id}/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(periodo ? { periodo } : {}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Error generando factura');
        return;
      }
      toast.success(`Factura generada: ${json.encf}`, {
        action: {
          label: 'Ver factura',
          onClick: () => { window.location.href = `/dashboard/facturas/${json.documentoId}`; },
        },
      });
      cargar();
    } catch {
      toast.error('Error de conexión al generar la factura');
    } finally {
      if (periodo) setGenerandoPeriodo(null); else setGenerando(false);
    }
  }

  // ── Estados de carga / error ──────────────────────────────────────────────
  if (loading) {
    return (
      <section className="bg-[#eef0f7] min-h-full p-6">
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando…
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="bg-[#eef0f7] min-h-full p-6 space-y-4">
        <Link href="/dashboard/facturas-recurrentes" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
          {error ?? 'No se encontró la factura recurrente.'}
        </div>
      </section>
    );
  }

  const fr = data.facturaRecurrente;
  const rango = `${fmtFechaCorta(fr.fechaInicio)} – ${fr.fechaFin ? fmtFechaCorta(fr.fechaFin) : 'sin fin'}`;

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">
      {/* ── Volver ─────────────────────────────────────────────────────────── */}
      <Link href="/dashboard/facturas-recurrentes" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4 mr-1" /> Facturas recurrentes
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{fr.nombre}</h1>
              {estadoBadge(fr.estado)}
            </div>
            {fr.descripcion && <p className="text-sm text-gray-500">{fr.descripcion}</p>}
            {(data.clienteRazonSocial || fr.clientId) && (
              <p className="text-sm text-gray-600">
                Cliente: <span className="font-medium">{data.clienteRazonSocial ?? `#${fr.clientId}`}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/dashboard/facturas-recurrentes/${fr.id}/editar`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </Button>
            </Link>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => handleGenerar()} disabled={generando}>
              {generando
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando…</>
                : <><Zap className="h-4 w-4 mr-2" /> Generar ahora</>}
            </Button>
          </div>
        </div>

        {/* Datos clave */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <InfoItem label="Frecuencia" value={FRECUENCIA_LABEL[fr.frecuencia] ?? fr.frecuencia} />
          <InfoItem label="Monto estimado" value={fmtDOP(fr.totalEstimado)} />
          <InfoItem label="Próxima emisión" value={fmtFechaCorta(fr.proximaEmision)} />
          <InfoItem label="Facturas emitidas" value={fr.facturasEmitidas} />
          <InfoItem label="Vigencia" value={rango} />
        </div>
      </div>

      {/* ── Calendario de pagos (timeline unificado) ───────────────────────── */}
      <Card
        title="Calendario de pagos"
        icon={<CalendarClock className="h-4 w-4 text-teal-600" />}
        action={
          <Button variant="ghost" size="sm" onClick={cargar} className="text-gray-500">
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      >
        {fr.estado !== 'activa' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {fr.estado === 'pausada'
                ? 'Esta recurrente está pausada: no se generarán facturas automáticamente hasta reanudarla. Puedes generar manualmente cualquier período.'
                : fr.estado === 'finalizada'
                  ? 'Esta recurrente está finalizada. Puedes seguir generando períodos manualmente si lo necesitas.'
                  : 'Esta recurrente no está activa.'}
            </span>
          </div>
        )}

        {data.periodos.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No hay períodos programados.</p>
        ) : (
          <ul className="divide-y divide-gray-100 -my-1">
            {data.periodos.map((p) => {
              const esProximo = p.fecha === fr.proximaEmision;
              const f = p.factura;
              const rowGenerando = generandoPeriodo === p.fecha;

              const inner = (
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${esProximo ? 'bg-teal-500' : f ? 'bg-gray-400' : 'bg-gray-300'}`} />
                    <span className="text-sm text-gray-700 whitespace-nowrap">{fmtFechaCorta(p.fecha)}</span>
                    {esProximo && (
                      <Badge className="bg-teal-50 text-teal-700 hover:bg-teal-50 border-teal-200 border">Próximo</Badge>
                    )}
                    {f && (
                      <span className="text-xs text-gray-400 truncate hidden sm:inline">{f.codigo ?? f.encf}</span>
                    )}
                  </div>

                  {f ? (
                    <div className="flex items-center gap-3 shrink-0">
                      {estadoPagoBadge(f.estadoPago)}
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{fmtDOP(f.montoTotal)}</div>
                        {f.saldo > 0 && (
                          <div className="text-xs text-amber-700 whitespace-nowrap">Saldo {fmtDOP(f.saldo)}</div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-gray-400 whitespace-nowrap">{fmtDOP(p.montoEstimado)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rowGenerando}
                        onClick={() => handleGenerar(p.fecha)}
                      >
                        {rowGenerando
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generando…</>
                          : <><Zap className="h-3.5 w-3.5 mr-1.5" /> Generar</>}
                      </Button>
                    </div>
                  )}
                </div>
              );

              return (
                <li key={p.fecha}>
                  {f ? (
                    <Link href={`/dashboard/facturas/${f.id}`} className="block -mx-2 px-2 rounded-lg hover:bg-gray-50">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Facturas legacy sin período asignado */}
        {data.facturasSinPeriodo.length > 0 && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Otras facturas generadas</h3>
            </div>
            <ul className="divide-y divide-gray-100 -my-1">
              {data.facturasSinPeriodo.map((f) => (
                <li key={f.id}>
                  <Link href={`/dashboard/facturas/${f.id}`} className="block -mx-2 px-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center justify-between gap-3 py-3">
                      <span className="text-sm text-gray-700 truncate">{f.codigo ?? f.encf}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {estadoPagoBadge(f.estadoPago)}
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{fmtDOP(f.montoTotal)}</div>
                          {f.saldo > 0 && (
                            <div className="text-xs text-amber-700 whitespace-nowrap">Saldo {fmtDOP(f.saldo)}</div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
