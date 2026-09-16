'use client';

/**
 * ContabilidadNavRail — navegación del módulo Contabilidad.
 *
 * Mismo armazón que los demás módulos (`components/rail`). Las pantallas son
 * las que antes colgaban del grupo «Contabilidad» de Facturación; salieron a su
 * propio espacio para que quien solo factura no se tope con el libro diario.
 * Secuencias y consulta de e-NCF se quedaron en Facturación: son de la DGII,
 * no del libro.
 *
 * Los `id` llevan prefijo del módulo: el orden por uso comparte localStorage
 * con los otros rails.
 */

import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones } from '@/components/rail/RailSecciones';
import type { RailSeccion } from '@/components/rail/tipos';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { Permission } from '@/lib/config/roles';
import {
  LayoutDashboard, BookOpen, PenLine, ListTree, BarChart3, Receipt, Building2, Lock, Settings,
} from 'lucide-react';

type SeccionContable = RailSeccion & { permiso?: Permission };

const SECCIONES: SeccionContable[] = [
  // El panorama va primero: es donde se ve si los módulos están llegando al libro.
  { tipo: 'item', id: 'contabilidad-panorama', href: '/contabilidad', label: 'Panorama', icon: LayoutDashboard, exact: true },
  { tipo: 'item', id: 'contabilidad-libro', href: '/contabilidad/libro-diario', label: 'Libro diario', icon: BookOpen },
  { tipo: 'item', id: 'contabilidad-asiento', href: '/contabilidad/nuevo-asiento', label: 'Nuevo asiento', icon: PenLine, permiso: 'contabilidad:gestionar' },
  { tipo: 'item', id: 'contabilidad-cuentas', href: '/contabilidad/cuentas', label: 'Catálogo de cuentas', icon: ListTree },
  {
    tipo: 'grupo', id: 'contabilidad-reportes', label: 'Reportes', icon: BarChart3,
    children: [
      { href: '/contabilidad/mayor', label: 'Mayor general' },
      { href: '/contabilidad/balance', label: 'Balance de comprobación' },
      { href: '/contabilidad/estado-resultados', label: 'Estado de resultados' },
      { href: '/contabilidad/balance-general', label: 'Balance general' },
    ],
  },
  { tipo: 'item', id: 'contabilidad-cxp', href: '/contabilidad/cuentas-por-pagar', label: 'Cuentas por pagar', icon: Receipt },
  { tipo: 'item', id: 'contabilidad-activos', href: '/contabilidad/activos-fijos', label: 'Activos fijos', icon: Building2 },
  { tipo: 'item', id: 'contabilidad-cierre', href: '/contabilidad/cierre-ejercicio', label: 'Cierre de ejercicio', icon: Lock },
  { tipo: 'item', id: 'contabilidad-config', href: '/contabilidad/configuracion', label: 'Configuración', icon: Settings },
];

export function ContabilidadNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  const { can } = usePermissions();
  const visibles: RailSeccion[] = SECCIONES
    .filter((s) => !s.permiso || can(s.permiso))
    .map(({ permiso: _permiso, ...s }) => s as RailSeccion);
  return (
    <RailArmazon modulo="contabilidad" variant={variant}>
      <RailSecciones secciones={visibles} modulo="contabilidad" />
    </RailArmazon>
  );
}
