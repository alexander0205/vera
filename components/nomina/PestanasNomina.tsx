'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, Clock, FileText, Settings, Users } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { NOMINA_EN_GOBERNANZA } from '@/lib/nomina/rutas';

/**
 * Las secciones de nómina dentro de Gobernanza, como pestañas: el menú de la
 * izquierda es el del colegio, y la nómina ocupa ahí una sola entrada. Mismo
 * orden que el menú del módulo Nómina (`components/nomina-nav-rail.tsx`).
 */
const PESTANAS = [
  { href: `${NOMINA_EN_GOBERNANZA}/empleados`, label: 'Empleados', icon: Users },
  { href: `${NOMINA_EN_GOBERNANZA}/corridas`, label: 'Corridas', icon: CalendarClock },
  { href: `${NOMINA_EN_GOBERNANZA}/horas`, label: 'Horas', icon: Clock },
  { href: `${NOMINA_EN_GOBERNANZA}/contratos`, label: 'Contratos', icon: FileText },
  { href: `${NOMINA_EN_GOBERNANZA}/configuracion`, label: 'Configuración', icon: Settings, permiso: 'nomina:configurar' as const },
];

export function PestanasNomina() {
  const pathname = usePathname();
  const { can } = usePermissions();
  const visibles = PESTANAS.filter((t) => !t.permiso || can(t.permiso));
  const activa = visibles.find((t) => pathname.startsWith(t.href))?.href;

  return (
    <nav aria-label="Secciones de nómina" className="flex gap-1 overflow-x-auto border-b border-gray-200 px-4 pt-4 sm:px-6 lg:px-8">
      {visibles.map((t) => {
        const on = t.href === activa;
        return (
          <Link key={t.href} href={t.href} prefetch aria-current={on ? 'page' : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              on ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
