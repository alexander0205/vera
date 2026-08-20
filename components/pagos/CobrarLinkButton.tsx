'use client';

/**
 * Botón "Cobrar con tarjeta / Link de pago" + modal.
 * Genera un link de pago para un e-CF o una cotización, lo muestra con copiar /
 * WhatsApp / QR, y hace polling del estado hasta que se marca pagado.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PAGOS_ONLINE_ENABLED } from '@/lib/config/pagos-online';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CreditCard, Copy, Check, MessageCircle, Loader2 } from 'lucide-react';

interface Props {
  ecfDocumentId?: number;
  cotizacionId?: number;
  /** Teléfono del cliente para el botón WhatsApp (opcional). */
  telefonoCliente?: string | null;
  /** Se llama cuando el pago se confirma (para refrescar la factura). */
  onPagado?: () => void;
  variant?: 'default' | 'outline';
  className?: string;
  /** Si true, arranca el flujo de cobro apenas monta (viene de ?cobrar=1). */
  autoOpen?: boolean;
}

interface LinkInfo { token: string; url: string; provider: string; montoCentavos: number; }

export function CobrarLinkButton({ ecfDocumentId, cotizacionId, telefonoCliente, onPagado, variant = 'outline', className, autoOpen }: Props) {
  const [open, setOpen]     = useState(false);
  const [loading, setLoad]  = useState(false);
  const [link, setLink]     = useState<LinkInfo | null>(null);
  const [estado, setEstado] = useState<string>('pendiente');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string>('');
  const [providers, setProviders] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // El apagado va acá y no en cada pantalla: este botón lo montan la factura,
  // la cotización y la barra de acciones al emitir, y esconderlo en tres sitios
  // dejaría el cuarto encendido. Ver lib/config/pagos-online.ts.
  //
  // Los hooks van ARRIBA de este return: React exige que se llamen siempre en
  // el mismo orden, y salir antes de declararlos rompe el componente cuando la
  // bandera cambie entre renders.

  const PROVIDER_LABELS: Record<string, string> = {
    cardnet: 'CardNet', azul: 'Azul', simulador: 'Simulador (pruebas)',
  };

  // QR generado localmente (sin request externo → sin problemas de CSP).
  useEffect(() => {
    if (!link) { setQr(''); return; }
    import('qrcode').then((QR) =>
      QR.toDataURL(link.url, { width: 180, margin: 1 }).then(setQr).catch(() => setQr(''))
    );
  }, [link]);

  // Paso 1: al hacer click, mira qué pasarelas están activas.
  // 0 → error · 1 → genera directo · >1 → el modal pregunta cuál.
  async function iniciarCobro() {
    setLoad(true);
    try {
      const r = await fetch('/api/pagos/pasarelas');
      const d = await r.json();
      const activos = (d.configs ?? []).filter((c: { enabled: boolean }) => c.enabled)
        .map((c: { provider: string }) => c.provider);
      if (activos.length === 0) {
        toast.error('No hay pasarela activa. Actívala en Ingresos › Pasarelas de pago.');
        return;
      }
      setProviders(activos);
      if (activos.length === 1) {
        await generar(activos[0]);
      } else {
        setLink(null); setChoosing(true); setOpen(true);
      }
    } catch {
      toast.error('No se pudieron leer las pasarelas');
    } finally { setLoad(false); }
  }

  // Paso 2: genera el link con el proveedor elegido.
  async function generar(provider: string) {
    setLoad(true);
    try {
      const body: Record<string, unknown> = ecfDocumentId ? { ecfDocumentId } : { cotizacionId };
      body.provider = provider;
      const r = await fetch('/api/pagos/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'No se pudo generar el link');
      setChoosing(false); setLink(data); setEstado('pendiente'); setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally { setLoad(false); }
  }

  // Polling del estado mientras el modal está abierto y no pagado.
  useEffect(() => {
    if (!open || !link || estado === 'pagado') return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/pagos/link/${link.token}/status`);
        const d = await r.json();
        if (d.estado && d.estado !== estado) {
          setEstado(d.estado);
          if (d.estado === 'pagado') {
            toast.success('¡Pago recibido y registrado!');
            onPagado?.();
          }
        }
      } catch { /* ignora */ }
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, link, estado, onPagado]);

  // Auto-arranque cuando se llega desde "Guardar y generar link de pago" (?cobrar=1).
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoOpen && !autoRan.current) {
      autoRan.current = true;
      iniciarCobro();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  function copiar() {
    if (!link) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const waHref = link
    ? `https://wa.me/${(telefonoCliente ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Puedes pagar aquí: ${link.url}`)}`
    : '#';

  // Después de todos los hooks, nunca antes.
  if (!PAGOS_ONLINE_ENABLED) return null;

  return (
    <>
      <Button type="button" variant={variant} className={className} disabled={loading} onClick={iniciarCobro}>
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
        Generar link de pago
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{choosing ? '¿Con cuál pasarela cobrar?' : 'Link de pago'}</DialogTitle>
          </DialogHeader>

          {choosing && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Elige la pasarela para generar el link:</p>
              {providers.map((p) => (
                <Button key={p} type="button" variant="outline" className="w-full justify-start"
                  disabled={loading} onClick={() => generar(p)}>
                  <CreditCard className="h-4 w-4 mr-2" /> {PROVIDER_LABELS[p] ?? p}
                </Button>
              ))}
            </div>
          )}

          {!choosing && link && (
            <div className="space-y-4">
              {estado === 'pagado' ? (
                <div className="rounded-lg bg-green-50 text-green-700 p-4 text-center font-semibold">
                  ✓ Pago recibido y registrado
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 text-amber-700 p-3 text-center text-sm flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Esperando pago…
                </div>
              )}

              <div className="flex gap-2">
                <input readOnly value={link.url}
                  className="flex-1 border rounded px-2 py-1.5 text-sm bg-slate-50" />
                <Button type="button" size="sm" variant="outline" onClick={copiar}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" asChild>
                  <a href={waHref} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2 text-green-600" /> WhatsApp
                  </a>
                </Button>
                <Button type="button" variant="outline" className="flex-1" asChild>
                  <a href={link.url} target="_blank" rel="noreferrer">Abrir</a>
                </Button>
              </div>

              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="QR del link de pago" className="mx-auto rounded border p-2 bg-white"
                  width={180} height={180} src={qr} />
              )}
              <p className="text-xs text-center text-muted-foreground">
                Comparte el link o el QR. El cobro se registra solo al pagar.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
