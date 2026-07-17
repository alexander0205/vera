'use client';

/**
 * Filtro de rango de fechas para reportes. Navega client-side (soft nav) con
 * router.push en vez de un submit GET nativo: así solo se re-renderiza el
 * contenido del reporte, NO el layout/sidebar (que antes parpadeaba en cada
 * "Aplicar" por recargar el documento completo).
 */
import { useRouter, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { Calendar } from 'lucide-react';

export function DateRangeFilter({ desde, hasta }: { desde: string; hasta: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function aplicar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();
    const d = String(fd.get('desde') ?? '');
    const h = String(fd.get('hasta') ?? '');
    if (d) qs.set('desde', d);
    if (h) qs.set('hasta', h);
    startTransition(() => router.push(`${pathname}?${qs.toString()}`));
  }

  return (
    <form onSubmit={aplicar} className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input type="date" name="desde" defaultValue={desde} className="bg-transparent border-0 focus:outline-none text-sm" />
          <span className="text-gray-400">—</span>
          <input type="date" name="hasta" defaultValue={hasta} className="bg-transparent border-0 focus:outline-none text-sm" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg"
        >
          {pending ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
    </form>
  );
}
