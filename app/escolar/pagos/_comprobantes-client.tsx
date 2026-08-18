'use client';

/**
 * La cola de comprobantes que suben los padres.
 *
 * Es una cola de trabajo, no un listado: lo pendiente arriba, el archivo a un
 * clic y las dos decisiones —aprobar o rechazar— siempre a la vista. Quien
 * revisa esto tiene la pantalla del banco abierta al lado y va comparando.
 *
 * Aprobar registra el cobro contra la factura del cargo. Lo que no tiene
 * factura no se puede cobrar, y eso se dice DESPUÉS de aprobar, con el detalle
 * de qué quedó fuera: esconderlo haría creer que la deuda bajó cuando no bajó.
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fmtDOP } from '@/lib/utils/format';
import {
  CheckCircle2, Clock, FileText, Loader2, Paperclip, XCircle, AlertTriangle, ExternalLink,
} from 'lucide-react';

interface CargoSnapshot {
  cargoId: number;
  estudiante: string;
  concepto: string;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

interface Comprobante {
  id: number;
  estado: string;
  montoCentavos: number;
  referencia: string | null;
  bancoOrigen: string | null;
  nota: string | null;
  responsable: string | null;
  responsableEmail: string | null;
  archivoNombre: string | null;
  archivoMime: string;
  archivoBytes: number;
  cargos: CargoSnapshot[];
  motivoRechazo: string | null;
  creadoEn: string;
  revisadoEn: string | null;
}

const ESTADO: Record<string, { label: string; clase: string; icono: typeof Clock }> = {
  pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800', icono: Clock },
  aprobado:  { label: 'Aprobado',  clase: 'bg-emerald-100 text-emerald-800', icono: CheckCircle2 },
  rechazado: { label: 'Rechazado', clase: 'bg-red-100 text-red-800', icono: XCircle },
};

function cuando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-DO', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function ComprobantesClient() {
  const [filas, setFilas] = useState<Comprobante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [viendo, setViendo] = useState<Comprobante | null>(null);
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/comprobantes');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error cargando comprobantes');
      setFilas(d.comprobantes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando comprobantes');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function decidir(id: number, accion: 'aprobar' | 'rechazar', motivoTexto?: string) {
    setOcupado(id); setAviso(null); setError(null);
    try {
      const r = await fetch(`/api/administracion-escolar/comprobantes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, motivo: motivoTexto }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'No se pudo procesar'); return; }

      if (accion === 'aprobar') {
        const partes = [`Cobro registrado: ${fmtDOP(d.aplicadoCentavos ?? 0)}`];
        if (d.sinAplicarCentavos > 0) {
          partes.push(
            `Quedaron ${fmtDOP(d.sinAplicarCentavos)} sin aplicar` +
            (d.cargosSinFactura?.length
              ? `: ${d.cargosSinFactura.join(', ')} todavía no está facturado. Factura el cargo y registra el cobro en la factura.`
              : ' porque las facturas ya estaban saldadas.'),
          );
        }
        setAviso(partes.join('. '));
      }
      setRechazando(null); setMotivo('');
      await cargar();
    } catch {
      setError('Error de red');
    } finally {
      setOcupado(null);
    }
  }

  const pendientes = filas.filter((f) => f.estado === 'pendiente');
  const montoPendiente = pendientes.reduce((s, f) => s + f.montoCentavos, 0);

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Clock className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <b>{pendientes.length}</b> {pendientes.length === 1 ? 'comprobante' : 'comprobantes'} por revisar
            {' · '}{fmtDOP(montoPendiente)}. Mientras no los apruebes, la deuda sigue abierta y a la
            familia le seguirán saliendo los avisos.
          </p>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-900">{aviso}</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {filas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Paperclip className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-900">Todavía no hay comprobantes</p>
            <p className="mt-1 text-sm text-gray-500">
              Aparecerán aquí cuando una familia suba el suyo desde su enlace de pago.
            </p>
          </CardContent>
        </Card>
      ) : (
        filas.map((c) => {
          const e = ESTADO[c.estado] ?? ESTADO.pendiente;
          const Icono = e.icono;
          const esImagen = c.archivoMime.startsWith('image/');
          return (
            <Card key={c.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{c.responsable ?? 'Responsable eliminado'}</span>
                      <Badge className={e.clase}><Icono className="mr-1 h-3 w-3" />{e.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {cuando(c.creadoEn)}
                      {c.referencia && <> · ref. <span className="font-mono">{c.referencia}</span></>}
                      {c.bancoOrigen && <> · {c.bancoOrigen}</>}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{fmtDOP(c.montoCentavos)}</p>
                </div>

                {c.cargos.length > 0 && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Lo que debía al subirlo
                    </p>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {c.cargos.map((x) => (
                        <li key={x.cargoId} className="flex justify-between gap-3">
                          <span className="truncate">{x.concepto} · {x.estudiante}</span>
                          <span className="shrink-0 tabular-nums">{fmtDOP(x.montoCentavos)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.nota && <p className="text-sm italic text-gray-600">«{c.nota}»</p>}
                {c.motivoRechazo && (
                  <p className="text-sm text-red-700">Rechazado: {c.motivoRechazo}</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViendo(c)}>
                    <FileText className="mr-1.5 h-4 w-4" /> Ver comprobante
                  </Button>
                  <a href={`/api/administracion-escolar/comprobantes/${c.id}/archivo`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {esImagen ? 'Abrir imagen' : 'Abrir PDF'}
                    <span className="text-gray-400">({Math.round(c.archivoBytes / 1024)} KB)</span>
                  </a>

                  {c.estado === 'pendiente' && (
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" disabled={ocupado === c.id}
                        onClick={() => { setRechazando(c.id); setMotivo(''); }}>
                        Rechazar
                      </Button>
                      <Button size="sm" disabled={ocupado === c.id}
                        onClick={() => decidir(c.id, 'aprobar')}>
                        {ocupado === c.id
                          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                        Aprobar y registrar cobro
                      </Button>
                    </div>
                  )}
                </div>

                {rechazando === c.id && (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <label className="block text-sm font-medium text-red-900">
                      ¿Por qué lo rechazas? La familia lo va a leer en su pantalla.
                    </label>
                    <textarea rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)}
                      placeholder="Ej.: el comprobante no muestra el monto, o la transferencia no aparece en la cuenta."
                      className="w-full rounded-md border border-red-200 p-2 text-sm" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm"
                        onClick={() => { setRechazando(null); setMotivo(''); }}>Cancelar</Button>
                      <Button size="sm" disabled={!motivo.trim() || ocupado === c.id}
                        onClick={() => decidir(c.id, 'rechazar', motivo)}>
                        Confirmar rechazo
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Ver el archivo sin salir de la cola. */}
      {viendo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setViendo(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-lg bg-white p-4"
            onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{viendo.responsable}</p>
                <p className="text-sm text-gray-500">
                  {fmtDOP(viendo.montoCentavos)} · {viendo.archivoNombre}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setViendo(null)}>Cerrar</Button>
            </div>
            {viendo.archivoMime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/administracion-escolar/comprobantes/${viendo.id}/archivo`}
                alt="Comprobante" className="mx-auto max-w-full rounded" />
            ) : (
              <iframe src={`/api/administracion-escolar/comprobantes/${viendo.id}/archivo`}
                className="h-[70vh] w-full rounded border" title="Comprobante" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
