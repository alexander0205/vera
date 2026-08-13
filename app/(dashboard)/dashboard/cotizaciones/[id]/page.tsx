'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Download, FileText, Loader2, XCircle, CheckCircle,
  Clock, ChevronDown, Mail, Pencil, FileCheck, MoreVertical,
} from 'lucide-react';
import { useVolver } from '@/lib/hooks/useVolver';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cotizacion {
  id:                   number;
  numero:               string;
  estado:               string;
  razonSocialComprador: string | null;
  rncComprador:         string | null;
  emailComprador:       string | null;
  fechaEmision:         string;
  fechaVencimiento:     string | null;
  montoSubtotal:        number;
  montoTotal:           number;
  items:                string | null;
  notas:                string | null;
  terminosCondiciones:  string | null;
}

interface LineItem {
  descripcion: string;
  precio:      number;
  cantidad:    number;
}

// ─── Estado badge ─────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, {
  label: string;
  className: string;
  icon: React.ElementType;
}> = {
  borrador:  { label: 'Pendiente',  className: 'border-gray-300 text-gray-600',        icon: Clock },
  enviada:   { label: 'Enviada',   className: 'bg-blue-100 text-blue-700',             icon: Mail },
  aceptada:  { label: 'Aceptada',  className: 'bg-green-100 text-green-700',           icon: CheckCircle },
  rechazada: { label: 'Rechazada', className: 'bg-red-100 text-red-700',               icon: XCircle },
  vencida:   { label: 'Vencida',   className: 'bg-amber-100 text-amber-700',           icon: Clock },
};

// Transiciones de estado válidas
const NEXT_STATES: Record<string, Array<{ value: string; label: string }>> = {
  borrador:  [{ value: 'enviada',   label: 'Marcar como Enviada' }],
  enviada:   [
    { value: 'aceptada',  label: 'Marcar como Aceptada' },
    { value: 'rechazada', label: 'Marcar como Rechazada' },
  ],
  aceptada:  [],
  rechazada: [],
  vencida:   [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-DO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso; }
}

function fmtDOP(centavos: number): string {
  return `RD$ ${(centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CotizacionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const cotId  = params.id as string;
  const volver = useVolver('/dashboard/cotizaciones');

  const [cot, setCot]         = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [showEmail, setShowEmail]       = useState(false);
  const [emailTo, setEmailTo]           = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const [converting, setConverting]     = useState(false);
  const [showConfirmConvert, setShowConfirmConvert] = useState(false);

  const [changingEstado, setChangingEstado] = useState(false);

  // ─── Carga ──────────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/cotizaciones/${cotId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando cotización');
      setCot(data.cotizacion);
      setEmailTo(data.cotizacion?.emailComprador ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [cotId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Cambiar estado ──────────────────────────────────────────────────────────

  async function handleCambiarEstado(nuevoEstado: string) {
    setChangingEstado(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cambiando estado');
      toast.success(`Estado cambiado a "${nuevoEstado}"`);
      await cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cambiando estado');
    } finally {
      setChangingEstado(false);
    }
  }

  // ─── Enviar email ────────────────────────────────────────────────────────────

  async function handleSendEmail() {
    if (!emailTo) { toast.error('Email requerido'); return; }
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotId}/email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error enviando email');
      toast.success('Cotización enviada por correo');
      setShowEmail(false);
      // Marcar como enviada automáticamente si aún es borrador
      if (cot?.estado === 'borrador') {
        await handleCambiarEstado('enviada');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error enviando email');
    } finally {
      setSendingEmail(false);
    }
  }

  // ─── Convertir a factura ─────────────────────────────────────────────────────

  async function handleConvertir() {
    setConverting(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotId}/convertir`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error convirtiendo');
      toast.success('Borrador de factura creado');
      router.push(data.redirect);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error convirtiendo');
      setConverting(false);
    }
  }

  // ─── Guards ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !cot) {
    return (
      <section className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
          <p className="font-medium">{error ?? 'Cotización no encontrada'}</p>
          <Button variant="outline" className="mt-4" onClick={volver}>
            Volver a cotizaciones
          </Button>
        </div>
      </section>
    );
  }

  const estadoCfg   = ESTADO_CONFIG[cot.estado] ?? { label: cot.estado, className: '', icon: Clock };
  const EstadoIcon  = estadoCfg.icon;
  const transiciones = NEXT_STATES[cot.estado] ?? [];
  // Convertir a factura disponible desde el inicio (no exige llegar a "aceptada").
  // Solo se excluyen los estados terminales negativos (rechazada/vencida).
  const puedeConvertir = ['borrador', 'enviada', 'aceptada'].includes(cot.estado);

  // Normaliza ítems a { descripcion, precio, cantidad } soportando el shape rico
  // (ItemLinea, cotizaciones nuevas) y el viejo { descripcion, precio, cantidad }.
  let parsedItems: LineItem[] = [];
  try {
    if (cot.items) {
      const raw = JSON.parse(cot.items) as Array<Record<string, unknown>>;
      parsedItems = raw.map(it => ({
        descripcion: String((it.nombreItem ?? it.descripcion) ?? ''),
        precio:      Number(it.precioUnitarioItem ?? it.precio ?? 0),
        cantidad:    Number(it.cantidadItem ?? it.cantidad ?? 1),
      }));
    }
  } catch { /* ignore */ }

  return (
    <section className="p-4 sm:p-6 min-h-full flex flex-col">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={volver}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Cotizaciones</span>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-mono">
                {cot.numero}
              </h1>
              <Badge variant="outline" className={estadoCfg.className}>
                <EstadoIcon className="h-3.5 w-3.5 mr-1" />
                {estadoCfg.label}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Emitida: {fmtDate(cot.fechaEmision)}
              {cot.fechaVencimiento && (
                <> · Válida hasta: <span className="text-teal-700 font-medium">{fmtDate(cot.fechaVencimiento)}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-wrap justify-end">

          {/* Cambiar estado */}
          {transiciones.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={changingEstado}>
                  {changingEstado
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <CheckCircle className="h-4 w-4 mr-1" />}
                  Cambiar estado
                  <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {transiciones.map(t => (
                  <DropdownMenuItem key={t.value} onSelect={() => handleCambiarEstado(t.value)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Editar */}
          {['borrador', 'enviada'].includes(cot.estado) && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/cotizaciones/${cot.id}/editar`}>
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </Link>
            </Button>
          )}

          {/* Más acciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/cotizacion/${cot.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Download className="h-4 w-4 text-gray-500" />
                  Descargar PDF
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setShowEmail(true)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Mail className="h-4 w-4 text-gray-500" />
                Enviar por correo
              </DropdownMenuItem>
              {puedeConvertir && (
                <DropdownMenuItem
                  onSelect={() => { setTimeout(() => setShowConfirmConvert(true), 0); }}
                  className="flex items-center gap-2 cursor-pointer"
                  disabled={converting}
                >
                  <FileCheck className="h-4 w-4 text-teal-600" />
                  {converting ? 'Convirtiendo…' : 'Convertir a factura'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Layout split ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

        {/* ── LEFT: ítems + notas ── */}
        <div className="space-y-4">

          {/* Cliente */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Datos del cliente</h2>
            {cot.razonSocialComprador ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-gray-500">Razón social</dt>
                  <dd className="font-medium text-gray-900">{cot.razonSocialComprador}</dd>
                </div>
                {cot.rncComprador && (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-gray-500">RNC</dt>
                    <dd className="text-gray-800 font-mono">{cot.rncComprador}</dd>
                  </div>
                )}
                {cot.emailComprador && (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-gray-500">Email</dt>
                    <dd className="text-gray-800 break-all">{cot.emailComprador}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin cliente especificado</p>
            )}
          </div>

          {/* Ítems */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Ítems / Servicios</h2>
            </div>
            {parsedItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="text-left font-medium py-2 px-5">Descripción</th>
                      <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Precio</th>
                      <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Cant.</th>
                      <th className="text-right font-medium py-2 px-5 whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {parsedItems.map((it, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/60">
                        <td className="py-2.5 px-5 font-medium text-gray-900">{it.descripcion}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                          {fmtDOP(it.precio * 100)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{it.cantidad}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums font-semibold text-gray-900">
                          {fmtDOP(it.precio * it.cantidad * 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic px-5 py-6 text-center">Sin ítems registrados</p>
            )}
          </div>

          {/* Notas */}
          {cot.notas && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Notas</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{cot.notas}</p>
            </div>
          )}

          {/* Términos */}
          {cot.terminosCondiciones && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Términos y condiciones</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{cot.terminosCondiciones}</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: sidebar ── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">

          {/* Resumen */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-teal-600" />
              Resumen
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium">{fmtDOP(cot.montoSubtotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t pt-2 mt-1 text-base">
                <span>Total</span>
                <span>{fmtDOP(cot.montoTotal)}</span>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4">
            <h3 className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Información</h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Número</dt>
                <dd className="font-mono font-semibold text-gray-900">{cot.numero}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Estado</dt>
                <dd className="text-gray-800 capitalize">{estadoCfg.label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Fecha emisión</dt>
                <dd className="text-gray-800">{fmtDate(cot.fechaEmision)}</dd>
              </div>
              {cot.fechaVencimiento && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Vencimiento</dt>
                  <dd className="text-teal-700 font-medium">{fmtDate(cot.fechaVencimiento)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Acciones rápidas */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
            <a
              href={`/api/pdf/cotizacion/${cot.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-lg py-2 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Ver PDF
            </a>
            <Button
              variant="outline"
              className="w-full text-sm"
              onClick={() => setShowEmail(true)}
            >
              <Mail className="h-4 w-4 mr-2" />
              Enviar por correo
            </Button>
            {puedeConvertir && (
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-sm"
                onClick={() => setShowConfirmConvert(true)}
                disabled={converting}
              >
                {converting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Convirtiendo…</>
                  : <><FileCheck className="h-4 w-4 mr-2" />Convertir a factura</>}
              </Button>
            )}
          </div>
        </aside>
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 mt-auto bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3">
        <Button
          variant="outline"
          className="text-gray-600 h-11 sm:h-9 w-full sm:w-auto"
          onClick={volver}
        >
          Volver
        </Button>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="h-11 sm:h-9 flex-1 sm:flex-none" asChild>
            <a href={`/api/pdf/cotizacion/${cot.id}`} target="_blank" rel="noreferrer">
              <FileText className="h-4 w-4 mr-1.5" />
              Ver PDF
            </a>
          </Button>
          {['borrador', 'enviada'].includes(cot.estado) && (
            <Button variant="outline" className="h-11 sm:h-9 flex-1 sm:flex-none" asChild>
              <Link href={`/dashboard/cotizaciones/${cot.id}/editar`}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Editar
              </Link>
            </Button>
          )}
          {/* Convertir vivía solo en la columna derecha y en el menú "⋮": en
              pantallas chicas la columna cae al final y el botón no se veía. */}
          {puedeConvertir && (
            <Button
              className="bg-teal-600 hover:bg-teal-700 h-11 sm:h-9 flex-1 sm:flex-none"
              onClick={() => setShowConfirmConvert(true)}
              disabled={converting}
            >
              {converting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Convirtiendo…</>
                : <><FileCheck className="h-4 w-4 mr-1.5" />Convertir a factura</>}
            </Button>
          )}
        </div>
      </div>

      {/* ── Modal: Enviar email ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showConfirmConvert}
        onOpenChange={setShowConfirmConvert}
        title="Convertir a factura"
        description={<>Se creará un <strong>borrador de factura</strong> a partir de esta cotización ({cot.numero}) y se abrirá para completarla. La cotización se conserva.</>}
        confirmLabel="Convertir"
        icon={<FileCheck className="h-5 w-5 text-teal-600" />}
        loading={converting}
        onConfirm={handleConvertir}
      />

      <Dialog open={showEmail} onOpenChange={setShowEmail}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar cotización por correo</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <label className="block">
              <span className="text-xs text-gray-600 uppercase tracking-wide">Destinatario</span>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="cliente@dominio.com"
                className="mt-1 w-full h-9 px-3 text-sm rounded-md border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              />
            </label>
            <p className="text-xs text-gray-500">
              Se adjuntará el PDF de la cotización. Si el estado es &quot;Borrador&quot;, se cambiará automáticamente a &quot;Enviada&quot;.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmail(false)} disabled={sendingEmail}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendingEmail || !emailTo}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {sendingEmail
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</>
                : <><Mail className="h-4 w-4 mr-1" />Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </section>
  );
}
