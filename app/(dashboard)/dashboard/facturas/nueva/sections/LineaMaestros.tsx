'use client';

/**
 * Plan B (solo lectura): muestra los atributos de maestros asignados al
 * producto de una línea de factura, como chips discretos bajo el campo
 * Producto. No persiste nada en la factura — solo surface la info al facturar.
 *
 * Usa SWR con clave = URL, así varias líneas del mismo producto comparten
 * caché y no se refetchea.
 */

import useSWR from 'swr';
import { Tags } from 'lucide-react';

interface Valor { id: number; valor: string; }
interface Maestro { id: number; nombre: string; valores: Valor[]; }
interface Resp {
  maestros?:     Maestro[];
  asignaciones?: { maestroId: number; valorId: number }[];
}

const fetcher = (u: string) => fetch(u).then(r => r.json());

export function LineaMaestros({ productoId }: { productoId?: number }) {
  const { data } = useSWR<Resp>(
    productoId ? `/api/productos/${productoId}/maestros` : null,
    fetcher,
  );
  if (!productoId || !data) return null;

  const ms  = data.maestros ?? [];
  const asg = data.asignaciones ?? [];
  const grupos = ms
    .map(m => ({
      nombre: m.nombre,
      valores: asg
        .filter(a => a.maestroId === m.id)
        .map(a => m.valores.find(v => v.id === a.valorId)?.valor)
        .filter((v): v is string => !!v),
    }))
    .filter(g => g.valores.length > 0);

  if (grupos.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Tags className="h-3 w-3 text-gray-300 shrink-0" />
      {grupos.map(g => (
        <span key={g.nombre} className="inline-flex items-center gap-1 text-[11px] text-gray-500">
          <span className="text-gray-400">{g.nombre}:</span>
          {g.valores.map(v => (
            <span key={v} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{v}</span>
          ))}
        </span>
      ))}
    </div>
  );
}
