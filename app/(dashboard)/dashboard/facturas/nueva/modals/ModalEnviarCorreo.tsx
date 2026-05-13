'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Mail } from 'lucide-react';

export function ModalEnviarCorreo({
  open, onClose, emailEnviar, setEmailEnviar, correoEncf, correoDocumentoId,
  emailSending, setEmailSending,
}: {
  open: boolean;
  onClose: () => void;
  emailEnviar: string;
  setEmailEnviar: (v: string) => void;
  correoEncf: string;
  correoDocumentoId: number | null;
  emailSending: boolean;
  setEmailSending: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-600" />Enviar comprobante
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Correo electrónico del destinatario</Label>
            <Input
              type="email"
              placeholder="cliente@empresa.com"
              value={emailEnviar}
              onChange={(e) => setEmailEnviar(e.target.value)}
            />
          </div>
          {correoEncf && (
            <p className="text-xs text-gray-500">
              Se enviará el comprobante <span className="font-mono font-medium text-teal-700">{correoEncf}</span>
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            disabled={emailSending || !emailEnviar.includes('@')}
            onClick={async () => {
              if (!correoDocumentoId) return;
              setEmailSending(true);
              try {
                await fetch(`/api/facturas/${correoDocumentoId}/enviar-correo`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: emailEnviar }),
                });
                onClose();
              } finally {
                setEmailSending(false);
              }
            }}>
            {emailSending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</> : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
