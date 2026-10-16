'use client';

import { useRouter } from 'next/navigation';
import { Paginador } from '@/components/ui/paginador';

/**
 * El paginador de Gastos. La pantalla es de servidor y la página viaja en la
 * URL (`?p=`), así que esto solo traduce el clic del paginador compartido a una
 * navegación, conservando el filtro que haya puesto (`filtro` = query string).
 */
export function PaginadorGastos({ pagina, paginas, total, porPagina, filtro }: {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  filtro: string;
}) {
  const router = useRouter();
  return (
    <Paginador
      pagina={pagina}
      paginas={paginas}
      total={total}
      porPagina={porPagina}
      onCambiar={(p) => {
        const q = new URLSearchParams(filtro);
        if (p > 1) q.set('p', String(p));
        const s = q.toString();
        router.push(`/dashboard/gastos${s ? `?${s}` : ''}`);
      }}
    />
  );
}
