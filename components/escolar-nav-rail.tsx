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
import { FUENTE_SECCION } from '@/components/rail/estilos';
import type { RailSeccion } from '@/components/rail/tipos';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { Permission } from '@/lib/config/roles';
import Box from '@mui/material/Box';
import Link from 'next/link';
import {
  Users, ClipboardList, Wallet, Settings, Contact, ClipboardCheck, FileText, BellRing,
  LayoutDashboard, Plus, FilePlus2,
} from 'lucide-react';

/**
 * `permiso`: la entrada solo sale a quien lo tiene. El menú de Gobernanza no
 * filtra por permiso (lo hace cada pantalla al abrirse), pero una acción que
 * crea documentos no debe ofrecerse a quien la pantalla va a rechazar.
 */
type SeccionEscolar = RailSeccion & { oculto?: boolean; permiso?: Permission };

// El orden es FIJO en Gobernanza: este es el que se ve siempre (el rail va con
// `ordenFijo`, ver EscolarNavRail). No se reordena por uso como los otros
// módulos —Alex lo pidió así, porque la sección más usada se adelantaba sola y
// dejaba de estar donde se la busca—.
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
  // que eso se deduce de los cargos. Las demás van en el orden del día a día.
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
  // «Cargos y deudas» se quitó: repetía lo que ya se ve en la ficha del alumno
  // y en la de la familia, y asignar un concepto a un curso vive en Tarifas.
  // Las familias que pagan. Va antes de Pagos porque la pregunta llega en ese
  // orden: primero quién debe, después qué entró.
  { tipo: 'item', id: 'escolar-responsables', href: '/escolar/responsables', label: 'Responsables',   icon: Contact },
  { tipo: 'item', id: 'escolar-pagos',       href: '/escolar/pagos',         label: 'Pagos',          icon: Wallet },
  // Crear las facturas de muchos alumnos de una vez. Va pegada a Pagos porque
  // son las dos mitades de cobrar: se factura y después entra el dinero. Se
  // ofrece con el permiso de gestionar y no con el de «Nueva Factura»
  // (`facturas:crear`): la secretaria, que es quien lo pidió, no lo tiene a
  // propósito. Ver `personal-escolar` en lib/config/roles.ts.
  { tipo: 'item', id: 'escolar-facturar',    href: '/escolar/facturar',      label: 'Facturar por lote', icon: FilePlus2, permiso: 'administracion-escolar:gestionar' },
  // Los recordatorios de cobro se mandan solos, y eso es justo el problema:
  // sin una pantalla que lo enseñe, nadie se entera de que a tres familias no
  // les llegó nada. Va junto a Pagos porque es la otra mitad de cobrar.
  { tipo: 'item', id: 'escolar-avisos',      href: '/escolar/avisos',        label: 'Avisos',         icon: BellRing },
  // SIGERD se fue a Configuración: se usa al montar el colegio y una vez al
  // año, y aquí ocupaba el sitio de algo que se abre a diario.
  { tipo: 'item', id: 'escolar-configuracion', href: '/escolar/configuracion', label: 'Configuración', icon: Settings },
];

const VISIBLES: SeccionEscolar[] = SECCIONES.filter(s => !s.oculto);

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: es el contenido del cajón móvil,
 *    donde no hay hover y ocultar el menú dejaría la pantalla sin navegación.
 *
 * `ocultas`: las pantallas que el dueño le apagó al rol de quien mira
 * (lib/config/pantallas.ts). Las calcula el layout en el servidor.
 */
export function EscolarNavRail({ variant = 'rail', ocultas = [] }: {
  variant?: 'rail' | 'drawer';
  ocultas?: string[];
} = {}) {
  const { can } = usePermissions();
  const secciones: RailSeccion[] = VISIBLES.filter(s =>
    !ocultas.includes(s.id) && (!s.permiso || can(s.permiso)));
  // «Nueva Factura» abre su cajón sobre el Panorama: a quien tiene el Panorama
  // oculto lo mandaría al aviso de pantalla fuera de su menú.
  const puedeFacturar = can('administracion-escolar:pagos') && can('facturas:crear')
    && !ocultas.includes('escolar-panorama');

  return (
    <RailArmazon modulo="escolar" variant={variant}>
      {puedeFacturar && (
        <Box
          component={Link}
          href="/escolar/dashboard?factura=nueva"
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.5, py: 1, mb: 0.5, borderRadius: '10px',
            bgcolor: 'rgba(255,255,255,0.16)', color: '#ffffff',
            ...FUENTE_SECCION, fontWeight: 700, textDecoration: 'none',
            transition: 'background-color 0.15s',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.26)' },
          }}
        >
          <Plus style={{ width: 17, height: 17, flexShrink: 0 }} />
          <Box component="span" className="nav-text" sx={{ whiteSpace: 'nowrap' }}>Nueva Factura</Box>
        </Box>
      )}
      {/* `ordenFijo`: en Gobernanza el menú NO se reordena por uso. Alex lo
          pidió estático —la sección que se usa mucho se adelantaba sola y
          dejaba de estar donde el usuario la busca—. */}
      <RailSecciones secciones={secciones} modulo="escolar" ordenFijo />
    </RailArmazon>
  );
}
