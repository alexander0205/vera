'use client';

/**
 * PosNavRail — navegación propia del módulo Punto de Venta.
 *
 * Es una navegación distinta a la de Facturación (esa vive en el dashboard
 * layout), pero se ve y se comporta IGUAL: el armazón, la escala de color, la
 * tipografía y el orden por uso salen de `components/rail`. Aquí solo queda la
 * lista de secciones del POS.
 *
 * Items: Vender (POS), Terminales, y las entidades COMPARTIDAS (Productos y
 * Contactos — mismas tablas que Facturación). Abajo, volver a Facturación.
 */

import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones } from '@/components/rail/RailSecciones';
import type { RailSeccion } from '@/components/rail/tipos';
import {
  Store, Clock, Wallet, Undo2, Users, Package, Settings, ReceiptText,
} from 'lucide-react';

// Navegación del módulo POS. Todo vive bajo /pos (shell del POS) para no saltar
// a Facturación. Contactos e Inventario son entidades COMPARTIDAS (mismas tablas).
//
// Los `id` van con prefijo del módulo porque los contadores del orden por uso
// viven en un solo localStorage para todo el producto: un 'configuracion' a
// secas sumaría las visitas del POS a la Configuración de Facturación.
const SECCIONES: RailSeccion[] = [
  { tipo: 'item', id: 'pos-vender',        href: '/pos',              label: 'Vender',              icon: Store, exact: true },
  { tipo: 'item', id: 'pos-historial',     href: '/pos/historial',    label: 'Historial',           icon: ReceiptText },
  { tipo: 'item', id: 'pos-turnos',        href: '/pos/turnos',       label: 'Turnos',              icon: Clock },
  { tipo: 'item', id: 'pos-caja',          href: '/pos/caja',         label: 'Gestión de efectivo', icon: Wallet },
  { tipo: 'item', id: 'pos-devoluciones',  href: '/pos/devoluciones', label: 'Devoluciones',        icon: Undo2 },
  { tipo: 'item', id: 'pos-contactos',     href: '/pos/contactos',    label: 'Contactos',           icon: Users,   shared: true },
  { tipo: 'item', id: 'pos-inventario',    href: '/pos/inventario',   label: 'Inventario',          icon: Package, shared: true },
  { tipo: 'item', id: 'pos-configuracion', href: '/pos/configuracion', label: 'Configuración',      icon: Settings },
];

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: contenido del cajón móvil.
 *
 * Mismo contrato que EscolarNavRail y CuentaNavRail. Sin la variante 'drawer'
 * el cajón móvil del POS mostraba el rail de escritorio, que solo se expande al
 * pasar el mouse — o sea, en una pantalla táctil quedaban solo los iconos.
 */
export function PosNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  return (
    <RailArmazon modulo="pos" variant={variant}>
      <RailSecciones secciones={SECCIONES} />
    </RailArmazon>
  );
}
