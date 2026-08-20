'use client';

/**
 * EscolarNavRail — navegación del módulo Administración Escolar.
 *
 * Se ve y se comporta igual que los otros tres: el armazón, la escala de color,
 * la tipografía y el orden por uso salen de `components/rail`. Aquí solo queda
 * la lista de secciones del colegio. El colegio se administra sin salir de
 * aquí: al final está el salto a Facturación, que es donde se cobra (los cargos
 * se saldan con facturas).
 */

import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones } from '@/components/rail/RailSecciones';
import type { RailSeccion } from '@/components/rail/tipos';
import {
  Users, ClipboardList, Receipt, Wallet, Settings, Contact, ClipboardCheck, FileText, BellRing,
  LayoutDashboard,
} from 'lucide-react';

type SeccionEscolar = RailSeccion & { oculto?: boolean };

// El orden lo manda cuánto se usa cada pantalla, y después a quién mira. Este
// es el orden POR DEFECTO: el que ve quien entra por primera vez y el que rompe
// los empates; a partir de ahí manda el uso (ver useOrdenNav).
// Matriculación y Estudiantes van pegadas porque se salta de una a otra todo el
// día: la matrícula ES el alumno inscrito en un curso, con sus padres detrás.
//
// `oculto` deja la entrada fuera del menú SIN borrar la pantalla: sigue viva y
// alcanzable por URL. Es para lo que todavía no se va a usar, y quitarle el
// sitio en el menú es más honesto que enseñar una sección vacía. Volver a
// enseñarla es borrar la marca.
//
// Los `id` van con prefijo del módulo: los contadores del orden por uso viven
// en un solo localStorage para todo el producto, y sin prefijo la
// Configuración del colegio sumaría visitas a la de Facturación.
const SECCIONES: SeccionEscolar[] = [
  // El panorama va primero aunque no sea la más usada: la abre el dueño, no la
  // secretaria, y quien entra a mirar cómo va el dinero no tiene por qué saber
  // que eso se deduce de «Cargos». Las demás siguen ordenadas por uso diario.
  { tipo: 'item', id: 'escolar-panorama',    href: '/escolar/dashboard',     label: 'Panorama',       icon: LayoutDashboard },
  // Matriculación va después: es la pantalla que más se abre. Inscribir a un
  // alumno es el trabajo diario del colegio; consultarlo, lo de después.
  { tipo: 'item', id: 'escolar-matriculas',  href: '/escolar/matriculas',    label: 'Matriculación',  icon: ClipboardList },
  { tipo: 'item', id: 'escolar-estudiantes', href: '/escolar/estudiantes',   label: 'Estudiantes y padres', icon: Users },
  // Se mudó de Configuración: el checklist de qué papel se pide (antes una
  // pestaña ahí) ahora vive junto al constructor de formularios propios, y
  // ambos se usan bastante más seguido que una pestaña de configuración.
  //
  // "Documentos" a secas y no "Documentos y formularios": aunque el rail ya
  // mide 264 px, el texto va con `nowrap` y la etiqueta larga se cortaba a
  // media palabra ("Documentos y formular"). Dentro, las pestañas Requeridos y
  // Formularios dicen lo que hay; el menú solo tiene que llevarte hasta ahí.
  { tipo: 'item', id: 'escolar-documentos',  href: '/escolar/documentos',    label: 'Documentos',     icon: FileText },
  { tipo: 'item', id: 'escolar-condicion',   href: '/escolar/condicion-academica', label: 'Condición académica', icon: ClipboardCheck, oculto: true },
  { tipo: 'item', id: 'escolar-personal',    href: '/escolar/personal',      label: 'Personal',       icon: Contact,  oculto: true },
  { tipo: 'item', id: 'escolar-cargos',      href: '/escolar/cargos',        label: 'Cargos y deudas', icon: Receipt, oculto: true },
  // Las familias que pagan. Va antes de Pagos porque la pregunta llega en ese
  // orden: primero quién debe, después qué entró.
  { tipo: 'item', id: 'escolar-responsables', href: '/escolar/responsables', label: 'Responsables',   icon: Contact },
  { tipo: 'item', id: 'escolar-pagos',       href: '/escolar/pagos',         label: 'Pagos',          icon: Wallet },
  // Los recordatorios de cobro se mandan solos, y eso es justo el problema:
  // sin una pantalla que lo enseñe, nadie se entera de que a tres familias no
  // les llegó nada. Va junto a Pagos porque es la otra mitad de cobrar.
  { tipo: 'item', id: 'escolar-avisos',      href: '/escolar/avisos',        label: 'Avisos',         icon: BellRing },
  // SIGERD se fue a Configuración: se usa al montar el colegio y una vez al
  // año, y aquí ocupaba el sitio de algo que se abre a diario.
  { tipo: 'item', id: 'escolar-configuracion', href: '/escolar/configuracion', label: 'Configuración', icon: Settings },
];

const VISIBLES: RailSeccion[] = SECCIONES.filter(s => !s.oculto);

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: es el contenido del cajón móvil,
 *    donde no hay hover y ocultar el menú dejaría la pantalla sin navegación.
 */
export function EscolarNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  return (
    <RailArmazon modulo="escolar" variant={variant}>
      <RailSecciones secciones={VISIBLES} modulo="escolar" />
    </RailArmazon>
  );
}
