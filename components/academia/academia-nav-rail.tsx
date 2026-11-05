'use client';

/**
 * Menú lateral de la Academia. No es un módulo del producto (no se vende ni
 * depende del rol), así que el armazón va sin módulo: el pie ofrece todos los
 * demás para volver a trabajar.
 */

import { usePathname } from 'next/navigation';
import { PlayCircle } from 'lucide-react';
import { RailArmazon } from '@/components/rail/RailArmazon';
import { EnlaceSeccion } from '@/components/rail/RailSecciones';

export function AcademiaNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  const pathname = usePathname();
  return (
    <RailArmazon modulo={null} variant={variant}>
      <EnlaceSeccion
        item={{ id: 'academia-inicio', href: '/academia', label: 'Videos y guías', icon: PlayCircle }}
        activo={pathname.startsWith('/academia')}
      />
    </RailArmazon>
  );
}
