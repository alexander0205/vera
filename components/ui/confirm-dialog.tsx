'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

/**
 * Diálogo de confirmación reutilizable para acciones consecuentes o
 * irreversibles (convertir a factura, generar mora, etc.).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  loading = false,
  confirmClassName = 'bg-teal-600 hover:bg-teal-700 text-white',
  /**
   * `destructive` pinta el botón en rojo. Hace falta como prop y no basta con
   * mandar clases por `confirmClassName`: el botón es MUI por debajo y sus
   * estilos ganan a las de Tailwind, así que un `bg-red-600` no se veía —el
   * botón de borrar salía del mismo azul que el de guardar—.
   */
  destructive = false,
  icon,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  confirmClassName?: string;
  destructive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="max-w-sm w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{icon}{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-gray-600 pt-1">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : undefined}
            className={destructive ? undefined : confirmClassName}
            onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
