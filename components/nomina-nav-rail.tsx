'use client';

/**
 * NominaNavRail — navegación del módulo Nómina.
 *
 * Mismo armazón que los otros módulos (color, tipografía y orden por uso salen
 * de `components/rail`). Las secciones son las pantallas que existen hoy; el pago
 * se registra dentro de cada corrida, así que no hay una pantalla «Pagos» aparte.
 */

import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones } from '@/components/rail/RailSecciones';
import type { RailSeccion } from '@/components/rail/tipos';
import { Users, CalendarClock, Settings, FileText, Clock } from 'lucide-react';

const SECCIONES: RailSeccion[] = [
  { tipo: 'item', id: 'nomina-empleados',  href: '/nomina/empleados',  label: 'Empleados',  icon: Users },
  { tipo: 'item', id: 'nomina-corridas',   href: '/nomina/corridas',   label: 'Corridas',   icon: CalendarClock },
  // Las horas de quien cobra por hora: se aprueban aquí antes de la corrida.
  { tipo: 'item', id: 'nomina-horas',      href: '/nomina/horas',      label: 'Horas',      icon: Clock },
  { tipo: 'item', id: 'nomina-contratos',  href: '/nomina/contratos',  label: 'Contratos',  icon: FileText },
  { tipo: 'item', id: 'nomina-config',     href: '/nomina/configuracion', label: 'Configuración', icon: Settings },
];

export function NominaNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  return (
    <RailArmazon modulo="nomina" variant={variant}>
      <RailSecciones secciones={SECCIONES} modulo="nomina" />
    </RailArmazon>
  );
}
