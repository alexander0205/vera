'use client';

/**
 * «Cuando llegue la fecha de emisión, saca la factura tú.»
 *
 * Vive junto al catálogo de conceptos porque es ahí donde está el calendario
 * que lo dispara: cada concepto dice qué día emite cada cuota, y esto decide si
 * ese día además nace la factura o solo el cargo.
 *
 * Lo que enseña no es un sí/no sino DESDE CUÁNDO, porque encenderlo tiene un
 * pasado. Un colegio puede llevar meses devengando cargos sin facturarlos, y un
 * interruptor a secas los habría facturado todos de golpe el primer día.
 */

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { CalendarClock, Loader2 } from 'lucide-react';

interface Estado {
  activa: boolean;
  /** ISO. La primera fecha de emisión que el cron va a facturar. */
  desde: string | null;
}

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

/** Mismo dibujo que el interruptor de Avisos: es el mismo gesto. */
function Interruptor({ activo, onCambiar, etiqueta, disabled }: {
  activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta}
      disabled={disabled} onClick={() => onCambiar(!activo)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        disabled ? 'cursor-not-allowed bg-gray-200' : activo ? 'bg-zero-600' : 'bg-gray-300'
      }`}>
      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
        activo ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

const enLetras = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-DO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
};

export function FacturacionAutomatica() {
  const { data, mutate, isLoading } = useSWR<Estado>(
    '/api/administracion-escolar/facturacion-automatica', fetcher,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activa, setActiva] = useState(false);

  // El interruptor se mueve al instante y la petición va detrás: esperar medio
  // segundo a que el servidor conteste hace dudar de si el clic entró.
  useEffect(() => { if (data) setActiva(data.activa); }, [data]);

  const cambiar = useCallback(async (v: boolean) => {
    setActiva(v);
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/facturacion-automatica', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: v }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo guardar');
      mutate(d, { revalidate: false });
    } catch (e) {
      setActiva(!v); // se deshace: el interruptor no puede mentir sobre lo guardado
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }, [mutate]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">Facturar solo al llegar la fecha de emisión</p>
          <p className="mt-0.5 text-sm text-gray-500">
            Cada cuota emite su factura el día que le toca en el calendario del concepto.
            Sale una por familia —los hermanos van en la misma— en borrador y a crédito, así que
            queda en cuentas por cobrar y se puede editar antes de enviarla.
          </p>

          {activa && data?.desde && (
            <p className="mt-2 text-sm text-gray-600">
              Encendida desde el <strong>{enLetras(data.desde)}</strong>. Las cuotas
              con fecha de emisión anterior siguen siendo trabajo manual: encenderla no
              factura hacia atrás.
            </p>
          )}
          {!activa && !isLoading && (
            <p className="mt-2 text-sm text-gray-600">
              Apagada: el calendario crea el cargo, pero la factura la hace alguien a mano
              desde la ficha de la familia.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-2">
          {(guardando || isLoading) && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Interruptor
            activo={activa}
            onCambiar={cambiar}
            etiqueta="Facturar automáticamente al llegar la fecha de emisión"
            disabled={guardando || isLoading}
          />
        </div>
      </div>
    </div>
  );
}
