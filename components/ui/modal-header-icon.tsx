'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Encabezado de modal con ícono + título + subtítulo, para que los diálogos se
 * vean parejos y menos planos. Reemplaza al `<DialogHeader><DialogTitle>…` suelto.
 */
export function ModalHeaderIcon({
  icon: Icon,
  title,
  subtitle,
  tono = 'teal',
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: string;
  /** color del badge: teal (normal) o amber (confirmaciones/avisos). */
  tono?: 'teal' | 'amber';
}) {
  const color = tono === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-600';
  return (
    <DialogHeader>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </DialogHeader>
  );
}
