'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Camera, Copy, Loader2, MessageCircle, RefreshCw, Power } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { fmtFechaCorta } from '@/lib/utils/format';

interface Enlace { url: string | null; qr: string | null; creadoEn: string; ultimoUsoEn: string | null }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/**
 * El enlace de la empresa para fotografiar facturas de proveedor. Se comparte
 * por WhatsApp (o se imprime el QR) con quien compra: mensajero, chofer,
 * contable. No vence; se cambia si llegó a quien no debía.
 */
export function EnlaceFotos() {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<'cambiar' | 'desactivar' | null>(null);
  const { data, mutate, isLoading } = useSWR<{ enlace: Enlace | null }>(abierto ? '/api/gastos/capturas/enlace' : null, fetcher);
  const enlace = data?.enlace ?? null;

  async function crear() {
    setOcupado(true);
    try {
      const r = await fetch('/api/gastos/capturas/enlace', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'No se pudo crear el enlace');
      await mutate(j, { revalidate: false });
      toast.success(enlace ? 'Enlace cambiado: el anterior ya no abre' : 'Enlace creado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const r = await fetch('/api/gastos/capturas/enlace', { method: 'DELETE' });
      if (!r.ok) throw new Error('No se pudo desactivar');
      await mutate({ enlace: null }, { revalidate: false });
      toast.success('Enlace desactivado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar: selecciónalo y cópialo a mano');
    }
  }

  const mensaje = (url: string) => `Para enviar las facturas de lo que compres, tómales una foto aquí: ${url}`;

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} data-testid="boton-enlace-fotos"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <Camera className="h-4 w-4" /> Enlace para fotos
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enlace para fotografiar facturas</DialogTitle>
            <DialogDescription>
              Compártelo con quien compra para la empresa. Toma la foto de la factura del proveedor y llega a
              «Facturas por revisar» con los datos leídos.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {isLoading || !data ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>
            ) : !enlace ? (
              <button type="button" onClick={crear} disabled={ocupado} data-testid="crear-enlace"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zero-600 text-sm font-semibold text-white disabled:opacity-60">
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Crear enlace
              </button>
            ) : (
              <>
                {enlace.url ? (
                  <>
                    <div className="flex gap-2">
                      <input readOnly value={enlace.url} onFocus={(e) => e.currentTarget.select()} data-testid="url-enlace"
                        className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 font-mono text-xs" />
                      <button type="button" onClick={() => copiar(enlace.url!)} aria-label="Copiar enlace"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <a href={`https://wa.me/?text=${encodeURIComponent(mensaje(enlace.url))}`} target="_blank" rel="noreferrer"
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-white">
                      <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
                    </a>
                    {enlace.qr && (
                      <div className="flex flex-col items-center gap-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generado en el servidor */}
                        <img src={enlace.qr} alt="QR del enlace" className="h-44 w-44" />
                        <p className="text-xs text-gray-500">Imprímelo y pégalo donde se reciben las compras.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    El enlace sigue activo, pero ya no se puede mostrar. Cámbialo para volver a copiarlo.
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Creado el {fmtFechaCorta(enlace.creadoEn)}
                  {enlace.ultimoUsoEn ? ` · última factura recibida el ${fmtFechaCorta(enlace.ultimoUsoEn)}` : ' · todavía no ha llegado ninguna factura'}
                </p>
                <div className="flex gap-2 border-t pt-3">
                  <button type="button" onClick={() => setConfirmar('cambiar')} disabled={ocupado} data-testid="cambiar-enlace"
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                    <RefreshCw className="h-4 w-4" /> Cambiar enlace
                  </button>
                  <button type="button" onClick={() => setConfirmar('desactivar')} disabled={ocupado}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-sm text-red-700 hover:bg-red-50">
                    <Power className="h-4 w-4" /> Desactivar
                  </button>
                </div>
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmar !== null}
        onOpenChange={(o) => !o && setConfirmar(null)}
        title={confirmar === 'cambiar' ? '¿Cambiar el enlace?' : '¿Desactivar el enlace?'}
        description={confirmar === 'cambiar'
          ? 'El enlace actual deja de funcionar. Tendrás que mandar el nuevo a quienes envían facturas.'
          : 'Nadie podrá enviar facturas hasta que crees un enlace nuevo.'}
        confirmLabel={confirmar === 'cambiar' ? 'Cambiar' : 'Desactivar'}
        destructive={confirmar === 'desactivar'}
        loading={ocupado}
        onConfirm={() => (confirmar === 'cambiar' ? crear() : desactivar())}
      />
    </>
  );
}
