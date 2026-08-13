'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileCheck, FileEdit } from 'lucide-react';

/**
 * Sub-navegación de Documentos y formularios, con rutas de verdad — mismo
 * patrón que app/escolar/configuracion/_nav.tsx: cada pestaña es una URL
 * aparte para poder enlazarla, no perder el módulo entero con "atrás", y que
 * cada una cargue solo lo suyo.
 *
 * "Requeridos" (el checklist de qué papel se pide al matricular) y
 * "Formularios" (el constructor) viven juntos porque responden a la misma
 * pregunta —qué le pide el colegio a la familia, en papel—: uno dice qué
 * hace falta, el otro arma cómo se recoge.
 */
export const TABS = [
  { href: '/escolar/documentos/requeridos', label: 'Requeridos', icon: FileCheck,
    hint: 'Qué papeles se piden al matricular, por nivel y tipo de inscripción.' },
  { href: '/escolar/documentos/formularios', label: 'Formularios', icon: FileEdit,
    hint: 'Construye fichas de inscripción, permisos y encuestas para las familias.' },
];

export function DocumentosNav() {
  const pathname = usePathname();
  const activa = TABS.find((t) => pathname.startsWith(t.href)) ?? TABS[0];

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documentos y formularios</h1>
        <p className="mt-1 text-sm text-gray-500">Solo administradores. {activa.hint}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const on = t.href === activa.href;
          return (
            <Link key={t.href} href={t.href} prefetch
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                on ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
