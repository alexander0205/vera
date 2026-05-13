'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { TIPOS_ECF } from '@/lib/ecf/types';
import type { SecuenciaInfo } from '../utils/types';

export function ModalEditarNCF({
  open, onClose, tipoEcf, secuencia,
  ncfSiguienteNum, setNcfSiguienteNum,
  ncfFechaVenc, setNcfFechaVenc,
  ncfPieFactura, setNcfPieFactura,
  ncfError, ncfSaving, onSave,
}: {
  open: boolean;
  onClose: () => void;
  tipoEcf: string;
  secuencia: SecuenciaInfo | null;
  ncfSiguienteNum: string;
  setNcfSiguienteNum: (v: string) => void;
  ncfFechaVenc: string;
  setNcfFechaVenc: (v: string) => void;
  ncfPieFactura: string;
  setNcfPieFactura: (v: string) => void;
  ncfError: string | null;
  ncfSaving: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Editar numeración</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-500">Nombre</Label>
            <Input value={TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? ''} readOnly className="bg-gray-50 text-gray-600" />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm text-gray-500">Numeración automática</Label>
            <input type="checkbox" checked readOnly className="h-4 w-4 accent-teal-600 cursor-default" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-500">Tipo de NCF</Label>
            <Input value={`B${tipoEcf}`} readOnly className="bg-gray-50 text-gray-600 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Siguiente número</Label>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder={secuencia?.encf?.slice(-8) ?? '1'}
              value={ncfSiguienteNum}
              onChange={(e) => setNcfSiguienteNum(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Fecha de vencimiento</Label>
            <Input
              type="date"
              value={ncfFechaVenc}
              onChange={(e) => setNcfFechaVenc(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Pie de factura</Label>
            <textarea
              className="w-full min-h-[80px] text-sm border border-gray-200 rounded-md p-2 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
              placeholder="Texto que aparecerá al pie del comprobante..."
              value={ncfPieFactura}
              onChange={(e) => setNcfPieFactura(e.target.value)}
            />
          </div>
        </div>
        {ncfError && <p className="text-xs text-red-500 px-1">{ncfError}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            disabled={ncfSaving}
            onClick={onSave}>
            {ncfSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
