'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Download, FileText, RefreshCw, XCircle,
  Building2, User, Loader2, AlertTriangle, CheckCircle, Clock,
  Printer, Ticket, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FacturaDetalle {
  id: number;
  encf: string;
  tipoEcf: string;
  tipoNombre: string;
  categoria: string;
  estado: string;
  trackId: string | null;
  codigoSeguridad: string | null;
  mensajesDgii: Record<string, unknown> | null;
  ncfModificado: string | null;
  fechaEmision: string;
  updatedAt: string;
  emisor: {
    razonSocial: string;
    nombreComercial?: string;
    rnc?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
  };
  comprador: {
    rnc?: string;
    razonSocial?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
  };
  montos: {
    montoTotalDOP: string;
    totalItbisDOP: string;
    subtotalDOP: string;
  };
  archivos: {
    xmlUrl?: string;
    tieneXmlOriginal: boolean;
    tieneXmlFirmado: boolean;
  };
}

// ─── Estado badge ─────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  ACEPTADO:             { label: 'Aceptado',    variant: 'default',     icon: CheckCircle },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', variant: 'secondary',   icon: CheckCircle },
  EN_PROCESO:           { label: 'En Proceso',  variant: 'outline',     icon: Clock },
  RECHAZADO:            { label: 'Rechazado',   variant: 'destructive', icon: XCircle },
  BORRADOR:             { label: 'Borrador',    variant: 'outline',     icon: Clock },
  ANULADO:              { label: 'Anulado',     variant: 'secondary',   icon: XCircle },
};

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, variant: 'outline' as const, icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 text-sm px-3 py-1">
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </Badge>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturaDetallePage() {
  const params   = useParams();
  const router   = useRouter();
  const docId    = params.id as string;

  const [factura, setFactura]       = useState<FacturaDetalle | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [pollingStatus, setPollingStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pollMsg, setPollMsg]             = useState<string | null>(null);

  const [showAnular, setShowAnular]       = useState(false);
  const [anulando, setAnulando]           = useState(false);
  const [anularError, setAnularError]     = useState<string | null>(null);
  const [anularNota, setAnularNota]       = useState<string | null>(null);

  // ─── Carga inicial ──────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facturas/${docId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando factura');
      setFactura(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Polling de estado DGII ─────────────────────────────────────────────────

  async function consultarEstado() {
    if (!factura?.trackId) return;
    setPollingStatus('loading');
    setPollMsg(null);
    try {
      const res = await fetch(`/api/ecf/estado?trackId=${factura.trackId}&docId=${factura.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error consultando DGII');
      setPollingStatus('done');
      if (data.actualizado) {
        setPollMsg(`Estado actualizado: ${data.estadoAnterior} → ${data.estadoActual}`);
        await cargar();
      } else {
        setPollMsg(`Sin cambios. Estado actual: ${data.estadoActual}`);
      }
    } catch (e: unknown) {
      setPollingStatus('error');
      setPollMsg(e instanceof Error ? e.message : 'Error al consultar');
    }
  }

  // ─── Anular ─────────────────────────────────────────────────────────────────

  async function handleAnular() {
    setAnulando(true);
    setAnularError(null);
    try {
      const res = await fetch(`/api/facturas/${docId}/anular`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error anulando');
      setAnularNota(data.nota ?? null);
      setShowAnular(false);
      await cargar();
    } catch (e: unknown) {
      setAnularError(e instanceof Error ? e.message : 'Error anulando');
    } finally {
      setAnulando(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !factura) {
    return (
      <section className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
          <p className="font-medium">{error ?? 'Documento no encontrado'}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/facturas')}>
            Volver a comprobantes
          </Button>
        </div>
      </section>
    );
  }

  const esAnulable = !['ANULADO'].includes(factura.estado);
  const puedePolling = !!factura.trackId && factura.estado === 'EN_PROCESO';

  return (
    <section className="p-6 space-y-6">

      {/* Breadcrumb + acciones */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/facturas">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Comprobantes
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono">{factura.encf}</h1>
            <p className="text-sm text-gray-500">{factura.tipoNombre}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <EstadoBadge estado={factura.estado} />

          {puedePolling && (
            <Button
              variant="outline" size="sm"
              onClick={consultarEstado}
              disabled={pollingStatus === 'loading'}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${pollingStatus === 'loading' ? 'animate-spin' : ''}`} />
              Consultar DGII
            </Button>
          )}

          {/* Botón Imprimir con dropdown para elegir formato */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-1" />
                Imprimir
                <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/factura/${factura.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Formato normal</p>
                    <p className="text-xs text-gray-400">PDF carta / A4</p>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/factura/${factura.id}/ticket`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Ticket className="h-4 w-4 text-teal-600" />
                  <div>
                    <p className="text-sm font-medium">Ticket térmico</p>
                    <p className="text-xs text-gray-400">Papel 80mm, punto de venta</p>
                  </div>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" asChild>
            <a href={`/api/pdf/factura/${factura.id}`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-1" />
              PDF
            </a>
          </Button>

          {factura.archivos.xmlUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={factura.archivos.xmlUrl} download>
                <FileText className="h-4 w-4 mr-1" />
                XML
              </a>
            </Button>
          )}

          {esAnulable && (
            <Button
              variant="outline" size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { setShowAnular(true); setAnularError(null); }}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Anular
            </Button>
          )}
        </div>
      </div>

      {/* Nota de anulación si fue anulado en esta sesión */}
      {anularNota && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{anularNota}</p>
        </div>
      )}

      {/* Mensaje de polling */}
      {pollMsg && (
        <div className={`rounded-xl p-3 text-sm flex gap-2 ${
          pollingStatus === 'error'
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-teal-50 border border-teal-200 text-teal-700'
        }`}>
          {pollingStatus === 'error'
            ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            : <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          }
          {pollMsg}
        </div>
      )}

      {/* Grid: Emisor + Comprador */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Emisor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-bold text-gray-900">{factura.emisor.razonSocial}</p>
            {factura.emisor.nombreComercial && (
              <p className="text-gray-600">{factura.emisor.nombreComercial}</p>
            )}
            {factura.emisor.rnc && (
              <p className="text-gray-500">RNC: {factura.emisor.rnc}</p>
            )}
            {factura.emisor.direccion && (
              <p className="text-gray-500">{factura.emisor.direccion}</p>
            )}
            {factura.emisor.telefono && (
              <p className="text-gray-500">Tel: {factura.emisor.telefono}</p>
            )}
            {factura.emisor.email && (
              <p className="text-gray-500">{factura.emisor.email}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <User className="h-4 w-4" />
              Comprador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {factura.comprador.razonSocial ? (
              <>
                <p className="font-bold text-gray-900">{factura.comprador.razonSocial}</p>
                {factura.comprador.rnc && (
                  <p className="text-gray-500">RNC: {factura.comprador.rnc}</p>
                )}
                {factura.comprador.email && (
                  <p className="text-gray-500">{factura.comprador.email}</p>
                )}
                {factura.comprador.telefono && (
                  <p className="text-gray-500">Tel: {factura.comprador.telefono}</p>
                )}
                {factura.comprador.direccion && (
                  <p className="text-gray-500">{factura.comprador.direccion}</p>
                )}
              </>
            ) : (
              <p className="text-gray-400 italic">Consumidor final</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detalles del comprobante */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600">
            Información del comprobante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">e-NCF</dt>
              <dd className="font-mono font-bold text-gray-900">{factura.encf}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Tipo</dt>
              <dd className="text-gray-800">e-{factura.tipoEcf} · {factura.tipoNombre}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Fecha de emisión</dt>
              <dd className="text-gray-800">
                {new Date(factura.fechaEmision).toLocaleDateString('es-DO', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </dd>
            </div>
            {factura.trackId && (
              <div>
                <dt className="text-gray-500">Track ID (DGII)</dt>
                <dd className="font-mono text-xs text-gray-700 break-all">{factura.trackId}</dd>
              </div>
            )}
            {factura.codigoSeguridad && (
              <div>
                <dt className="text-gray-500">Código de seguridad</dt>
                <dd className="font-mono font-bold text-teal-700 text-lg">{factura.codigoSeguridad}</dd>
              </div>
            )}
            {factura.ncfModificado && (
              <div>
                <dt className="text-gray-500">NCF que modifica</dt>
                <dd className="font-mono text-gray-800">{factura.ncfModificado}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Totales */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600">Montos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm max-w-xs ml-auto">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (sin ITBIS)</span>
              <span>DOP {parseFloat(factura.montos.subtotalDOP).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>ITBIS</span>
              <span>DOP {parseFloat(factura.montos.totalItbisDOP).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-2">
              <span>TOTAL</span>
              <span>DOP {parseFloat(factura.montos.montoTotalDOP).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mensajes DGII si hay */}
      {factura.mensajesDgii && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Mensajes de la DGII
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 overflow-auto max-h-48">
              {JSON.stringify(factura.mensajesDgii, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Modal: Confirmar anulación */}
      <Dialog open={showAnular} onOpenChange={setShowAnular}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Anular comprobante?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {anularError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {anularError}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Vas a anular el comprobante{' '}
              <strong className="font-mono">{factura.encf}</strong>.
            </p>
            {(factura.estado === 'ACEPTADO' || factura.estado === 'ACEPTADO_CONDICIONAL') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Este comprobante ya fue aceptado por la DGII. La anulación formal
                  requiere emitir una <strong>Nota de Crédito (e-34)</strong> referenciando este e-NCF.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnular(false)} disabled={anulando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleAnular} disabled={anulando}>
              {anulando
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Anulando…</>
                : 'Sí, anular'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
