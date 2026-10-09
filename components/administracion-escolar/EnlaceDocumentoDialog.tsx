'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';

/**
 * El enlace con el que la familia sube un documento desde su teléfono.
 *
 * Dos direcciones para lo mismo, a propósito:
 *   · el QR lleva `?c=1` y abre la cámara nada más entrar — quien lo escanea
 *     tiene el papel delante;
 *   · el enlace que se copia va limpio y ofrece elegir entre cámara y archivo,
 *     que es lo que hace falta cuando llega por WhatsApp y el documento ya está
 *     escaneado en el móvil.
 *
 * El token en claro solo existe en esta respuesta: en la base queda su SHA-256.
 * Por eso no hay forma de volver a ver un enlace ya generado — se genera otro,
 * y el anterior queda revocado.
 */

interface Enlace {
  url: string;
  qr: string;
  expiraEn: string;
  dias: number;
  /** El correo del tutor responsable, para no tener que buscarlo. */
  emailSugerido: string | null;
  /** A quién se acaba de enviar. null = todavía no se ha enviado. */
  enviadoA: string | null;
}

export function EnlaceDocumentoDialog({ matriculaId, requeridoId, documento, open, onOpenChange }: {
  matriculaId: number;
  /** null = un enlace para el expediente entero. */
  requeridoId: number | null;
  documento: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [estado, setEstado] = useState<'pidiendo' | 'listo' | 'error'>('pidiendo');
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [intento, setIntento] = useState(0);
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEnlace(null); setEstado('pidiendo'); setCopiado(false);
      setEmail(''); setErrorEnvio(null);
      return;
    }
    let vivo = true;
    setEstado('pidiendo');
    (async () => {
      try {
        const res = await fetch('/api/administracion-escolar/documentos/enlaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matriculaId, requeridoId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) { setError(json.error ?? 'No se pudo generar el enlace'); setEstado('error'); return; }
        setEnlace(json);
        setEmail((e) => e || json.emailSugerido || '');
        setEstado('listo');
      } catch {
        if (vivo) { setError('No se pudo generar el enlace'); setEstado('error'); }
      }
    })();
    return () => { vivo = false; };
  }, [open, matriculaId, requeridoId, intento]);

  /**
   * Enviar el enlace por correo genera uno NUEVO y anula el de arriba.
   *
   * No es un capricho: el token en claro solo existe en la respuesta que lo
   * crea, así que mandar el que ya está en pantalla obligaría a devolverlo al
   * servidor desde el navegador. Se crea y se envía en la misma llamada, y la
   * pantalla se queda con el que de verdad se mandó — que es el que la familia
   * va a abrir.
   */
  async function enviarPorCorreo() {
    const destino = email.trim();
    if (!destino) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch('/api/administracion-escolar/documentos/enlaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matriculaId, requeridoId, email: destino }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErrorEnvio(json.error ?? 'No se pudo enviar el correo'); return; }
      setEnlace(json);
    } catch {
      setErrorEnvio('No se pudo enviar el correo');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ModalHeader
          title="Enlace para la familia"
          subtitle={documento
            ? `Para que suban «${documento}» desde el teléfono.`
            : 'Para que suban todos los documentos que faltan desde el teléfono.'}
        />

        <div className="px-6 py-4">
          {estado === 'pidiendo' && (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>
          )}

          {estado === 'error' && (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-gray-500">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setIntento((i) => i + 1)}>
                <RefreshCw className="mr-1.5 h-4 w-4" />Reintentar
              </Button>
            </div>
          )}

          {estado === 'listo' && enlace && (
            <div className="flex items-center gap-4 text-left">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL generada en el servidor */}
              <img src={enlace.qr} alt="Código QR para subir el documento"
                className="h-40 w-40 shrink-0 rounded-lg border border-gray-100" />

              <div className="min-w-0 flex-1 space-y-2.5">
                <p className="text-sm text-gray-600">
                  Escanea el código para abrir la cámara, o copia el enlace y mándalo por WhatsApp.
                </p>

                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={enlace.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-600"
                  />
                  <Button variant="outline" size="sm" className="shrink-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(enlace.url);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 1800);
                    }}>
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                <p className="text-xs text-gray-400">
                  Caduca en {enlace.dias} días. Lo que suban queda pendiente de tu aprobación.
                </p>

                {/* Generar otro revoca el anterior: si el enlace se mandó a
                    quien no era, esto es lo que lo apaga. */}
                <Button variant="outline" size="sm" onClick={() => setIntento((i) => i + 1)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Generar otro y anular este
                </Button>
              </div>
            </div>
          )}

          {/* Mandarlo por correo, para la familia que no usa WhatsApp o que
              necesita el enlace por escrito. El correo explica qué falta. */}
          {estado === 'listo' && enlace && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              {enlace.enviadoA ? (
                <div className="flex items-center gap-2 text-sm text-zero-700">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Enviado a <b>{enlace.enviadoA}</b>. Es el enlace que se ve arriba.</span>
                </div>
              ) : (
                <>
                  <Label htmlFor="enlace-email" className="text-xs text-gray-500">
                    O mándaselo por correo
                  </Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="enlace-email"
                      type="email"
                      value={email}
                      placeholder="correo del tutor"
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void enviarPorCorreo(); }}
                    />
                    <Button className="shrink-0" onClick={enviarPorCorreo} disabled={enviando || !email.trim()}>
                      {enviando
                        ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        : <Mail className="mr-1.5 h-4 w-4" />}
                      Enviar
                    </Button>
                  </div>
                  {errorEnvio && <p className="mt-1.5 text-xs text-red-600">{errorEnvio}</p>}
                  <p className="mt-1.5 text-xs text-gray-400">
                    Al enviarlo se genera un enlace nuevo y el de arriba deja de valer.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
