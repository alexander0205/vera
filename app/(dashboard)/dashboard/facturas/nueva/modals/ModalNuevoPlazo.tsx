'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

export function ModalNuevoPlazo({
  open, onClose, npNombre, setNpNombre, npDias, setNpDias, npError, onGuardar,
}: {
  open: boolean;
  onClose: () => void;
  npNombre: string;
  setNpNombre: (v: string) => void;
  npDias: string;
  setNpDias: (v: string) => void;
  npError: string | null;
  onGuardar: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-teal-600">Agregar nuevo término de pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {npError && <p className="text-xs text-red-500">{npError}</p>}
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Ej: 45 días"
              value={npNombre}
              onChange={(e) => setNpNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onGuardar()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Días <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              min={1}
              max={365}
              placeholder="45"
              value={npDias}
              onChange={(e) => setNpDias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onGuardar()}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={onGuardar}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
