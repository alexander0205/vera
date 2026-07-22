'use client';

/**
 * Barra de periodo compartida por el mayor general y el balance de
 * comprobación. Los dos reportes se leen siempre "de tal fecha a tal fecha", y
 * tenerla en un solo sitio evita que una pantalla acabe validando distinto que
 * la otra sobre el mismo concepto.
 *
 * Igual que en el libro diario, el periodo vive en la URL: filtra el servidor,
 * y una vista de un trimestre concreto se puede compartir o guardar.
 */

import { useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface Periodo {
  desde?: string;
  hasta?: string;
}

export function FiltrosPeriodo({
  ruta, periodo, extra, paramsExtra = {},
}: {
  /** Ruta del reporte, p. ej. '/dashboard/contabilidad/balance'. */
  ruta:    string;
  periodo: Periodo;
  /** Controles propios del reporte (el selector de cuenta del mayor). */
  extra?:  ReactNode;
  /** Parámetros que hay que conservar al cambiar el periodo. */
  paramsExtra?: Record<string, string | number | undefined>;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function navegar(cambios: Periodo) {
    const siguiente = { ...periodo, ...cambios };
    const qs = new URLSearchParams();

    for (const [k, v] of Object.entries(paramsExtra)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    if (siguiente.desde) qs.set('desde', siguiente.desde);
    if (siguiente.hasta) qs.set('hasta', siguiente.hasta);

    startTransition(() => router.push(qs.toString() ? `${ruta}?${qs}` : ruta));
  }

  const hayPeriodo = Boolean(periodo.desde || periodo.hasta);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
      {extra}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Desde</span>
        <input
          type="date"
          value={periodo.desde ?? ''}
          disabled={pendiente}
          onChange={(e) => navegar({ desde: e.target.value || undefined })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Hasta</span>
        <input
          type="date"
          value={periodo.hasta ?? ''}
          disabled={pendiente}
          onChange={(e) => navegar({ hasta: e.target.value || undefined })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </label>

      {hayPeriodo && (
        <Button
          variant="outline" size="sm" disabled={pendiente}
          onClick={() => navegar({ desde: undefined, hasta: undefined })}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Todo el histórico
        </Button>
      )}
    </div>
  );
}
