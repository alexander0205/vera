'use client';

/**
 * Navegación de la cabecera de la documentación.
 *
 * Cliente solo por `usePathname`, para marcar la página en la que se está. En
 * `mcp.zero.com.do` la ruta que ve el navegador es `/herramientas` aunque el
 * proxy sirva `/conector/herramientas`; si alguien entra por la ruta interna se
 * reconoce también, quitándole el prefijo.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PAGINAS_DOCS } from '@/lib/mcp/conector';

function rutaLimpia(ruta: string): string {
  const sin = ruta.replace(/^\/conector(?=\/|$)/, '') || '/';
  return sin.length > 1 ? sin.replace(/\/$/, '') : sin;
}

export function NavegacionDocs() {
  const actual = rutaLimpia(usePathname() ?? '/');

  return (
    <nav aria-label="Documentación" className="-mx-1 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden">
      {PAGINAS_DOCS.map((p) => {
        const activa = actual === p.ruta;
        return (
          <Link
            key={p.ruta}
            href={p.ruta}
            aria-current={activa ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] transition sm:px-3 sm:text-[13.5px] ${
              activa
                ? 'bg-[#edf1fe] font-semibold text-zero-600'
                : 'font-medium text-[#3b4252] hover:bg-[#f4f7fe] hover:text-zero-600'
            }`}
          >
            {p.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
