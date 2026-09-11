'use client';

/**
 * NominaNavRail — navegación del módulo Nómina.
 *
 * Mismo armazón que los otros módulos (color, tipografía y orden por uso salen
 * de `components/rail`). En T1 solo existe Empleados; las secciones de corridas
 * y pagos van marcadas `oculto` hasta que su pantalla exista (Fases 2-4): la
 * entrada no se borra, se descubre cuando llega su fase.
 */

import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones } from '@/components/rail/RailSecciones';
import type { RailSeccion } from '@/components/rail/tipos';
import { Users, CalendarClock, Wallet, Settings, LayoutDashboard, FileText } from 'lucide-react';

type SeccionNomina = RailSeccion & { oculto?: boolean };

const SECCIONES: SeccionNomina[] = [
  { tipo: 'item', id: 'nomina-panorama',   href: '/nomina',            label: 'Panorama',   icon: LayoutDashboard, oculto: true },
  { tipo: 'item', id: 'nomina-empleados',  href: '/nomina/empleados',  label: 'Empleados',  icon: Users },
  { tipo: 'item', id: 'nomina-corridas',   href: '/nomina/corridas',   label: 'Corridas',   icon: CalendarClock },
  { tipo: 'item', id: 'nomina-contratos',  href: '/nomina/contratos',  label: 'Contratos',  icon: FileText },
  // Fase 4: archivo de dispersión bancaria y registro del pago.
  { tipo: 'item', id: 'nomina-pagos',      href: '/nomina/pagos',      label: 'Pagos',      icon: Wallet, oculto: true },
  { tipo: 'item', id: 'nomina-config',     href: '/nomina/configuracion', label: 'Configuración', icon: Settings },
];

const VISIBLES: RailSeccion[] = SECCIONES.filter(s => !s.oculto);

export function NominaNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  return (
    <RailArmazon modulo="nomina" variant={variant}>
      <RailSecciones secciones={VISIBLES} modulo="nomina" />
    </RailArmazon>
  );
}
