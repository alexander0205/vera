'use client';

/**
 * CuentaNavRail — navegación del área de Administración del negocio.
 *
 * Tercer espacio del producto, junto a Facturación y Punto de Venta: todo lo
 * que es "administrar MI negocio" (perfil de la empresa, usuarios, roles y
 * plan) vive aquí, centrado en la empresa activa. Se ve y se comporta igual que
 * los otros tres: armazón, color, tipografía y orden por uso salen de
 * `components/rail`; aquí solo queda la lista de secciones.
 *
 * NO es un módulo facturable (no está en teams.modulosHabilitados): toda
 * empresa necesita administrarse. El acceso se limita por ROL.
 */

import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones } from '@/components/rail/RailSecciones';
import type { RailSeccion } from '@/components/rail/tipos';
import { Building2, Users, ShieldCheck, CreditCard, Layers } from 'lucide-react';
import { BILLING_ENABLED } from '@/lib/config/billing';

// Los `id` van con prefijo del módulo: los contadores del orden por uso viven
// en un solo localStorage para todo el producto, y "Mi empresa" de aquí no es
// la "Mi empresa" de Facturación.
const SECCIONES: RailSeccion[] = [
  { tipo: 'item', id: 'cuenta-empresa',  href: '/cuenta/empresa',  label: 'Mi empresa',       icon: Building2 },
  { tipo: 'item', id: 'cuenta-usuarios', href: '/cuenta/usuarios', label: 'Usuarios',         icon: Users },
  { tipo: 'item', id: 'cuenta-roles',    href: '/cuenta/roles',    label: 'Roles y permisos', icon: ShieldCheck },
  // Plan y facturación solo cuando el billing está activo (lib/config/billing).
  ...(BILLING_ENABLED
    ? [{ tipo: 'item', id: 'cuenta-plan', href: '/cuenta/plan', label: 'Plan y facturación', icon: CreditCard } as RailSeccion]
    : []),
  { tipo: 'item', id: 'cuenta-empresas', href: '/cuenta/empresas', label: 'Mis empresas',     icon: Layers },
];

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: contenido del cajón móvil.
 */
export function CuentaNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  return (
    <RailArmazon modulo="administracion" variant={variant}>
      <RailSecciones secciones={SECCIONES} />
    </RailArmazon>
  );
}
