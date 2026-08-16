'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard, Users, Package,
  Settings, Plus,
  TrendingDown, BarChart3, CreditCard,
  Search, AlertCircle, Zap,
  ShoppingCart, Wallet, BookOpen,
  } from 'lucide-react';
import { ModuleHeader } from '@/components/module-header';
import { BannerSuscripcion } from '@/components/banner-suscripcion';
import { RailArmazon } from '@/components/rail/RailArmazon';
import { RailSecciones, EnlaceSeccion } from '@/components/rail/RailSecciones';
import { ANCHO_ABIERTO, FUENTE_SECCION, TINTA } from '@/components/rail/estilos';
import type { RailGrupo, RailItem, RailSeccion } from '@/components/rail/tipos';
import { NavFijoProvider, useNavFijo } from '@/lib/hooks/useNavFijo';
import { userCan, type Permission } from '@/lib/config/roles';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { PAGOS_ONLINE_ENABLED } from '@/lib/config/pagos-online';
import { type UserInfo } from '@/components/profile-dropdown';

// MUI imports
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

// ─── Types ────────────────────────────────────────────────────────────────────
// La forma de una lista de menú es la misma en los cuatro módulos y vive en
// components/rail/tipos. Aquí solo se le ponen los nombres de siempre.

type NavGroup   = RailGrupo;
type NavItem    = RailItem;
type NavSeccion = RailSeccion;

// ─── Nav config ───────────────────────────────────────────────────────────────

const GROUPS: NavGroup[] = [
  {
    id: 'ingresos',
    label: 'Ingresos',
    icon: TrendingDown,
    children: [
      { href: '/dashboard/facturas',             label: 'Facturas de venta',    plusHref: '/dashboard/facturas/nueva' },
      { href: '/dashboard/cuentas-por-cobrar',   label: 'Cuentas por cobrar' },
      { href: '/dashboard/pagos',                label: 'Pagos recibidos' },
      // Cobro por internet: oculto mientras no haya credenciales de producción
      // de la pasarela. Ver lib/config/pagos-online.ts.
      ...(PAGOS_ONLINE_ENABLED ? [
        { href: '/dashboard/pagos/links',        label: 'Links de pago' },
        { href: '/dashboard/pagos/pasarelas',    label: 'Pasarelas de pago' },
      ] : []),
      { href: '/dashboard/notas-credito',        label: 'Notas de crédito',     plusHref: '/dashboard/notas-credito/nueva' },
      { href: '/dashboard/notas-debito',         label: 'Notas de débito',      plusHref: '/dashboard/notas-debito/nueva' },
      { href: '/dashboard/cotizaciones',         label: 'Cotizaciones',         plusHref: '/dashboard/cotizaciones/nueva' },
      { href: '/dashboard/facturas-recurrentes', label: 'Facturas recurrentes' },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: Package,
    children: [
      { href: '/dashboard/productos',      label: 'Productos y servicios', plusHref: '/dashboard/productos' },
      { href: '/dashboard/inventario',     label: 'Movimientos de stock' },
      { href: '/dashboard/categorias',     label: 'Categorías' },
      { href: '/dashboard/almacenes',      label: 'Almacenes' },
      { href: '/dashboard/listas-precios', label: 'Listas de precios' },
      { href: '/dashboard/vendedores',     label: 'Vendedores' },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    icon: ShoppingCart,
    children: [
      { href: '/dashboard/compras',      label: 'Facturas recibidas', plusHref: '/dashboard/compras/nueva' },
      { href: '/dashboard/gastos/nueva', label: 'Gastos',             plusHref: '/dashboard/gastos/nueva' },
    ],
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    icon: BookOpen,
    children: [
      { href: '/dashboard/contabilidad/cuentas',      label: 'Catálogo de cuentas' },
      { href: '/dashboard/contabilidad/libro-diario', label: 'Libro diario' },
      { href: '/dashboard/contabilidad/nuevo-asiento', label: 'Nuevo asiento manual' },
      { href: '/dashboard/contabilidad/mayor',        label: 'Mayor general' },
      { href: '/dashboard/contabilidad/balance',      label: 'Balance de comprobación' },
      { href: '/dashboard/contabilidad/estado-resultados', label: 'Estado de resultados' },
      { href: '/dashboard/contabilidad/balance-general', label: 'Balance general' },
      { href: '/dashboard/contabilidad/activos-fijos', label: 'Activos fijos' },
      { href: '/dashboard/contabilidad/cuentas-por-pagar', label: 'Cuentas por pagar' },
      { href: '/dashboard/contabilidad/cierre-ejercicio', label: 'Cierre de ejercicio' },
      { href: '/dashboard/contabilidad/configuracion', label: 'Configuración contable' },
      { href: '/dashboard/contabilidad/secuencias',   label: 'Secuencias' },
      { href: '/dashboard/contabilidad/consulta-ncf', label: 'Consulta de e-NCF' },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    children: [
      { href: '/dashboard/configuracion', label: 'Mi empresa' },
      { href: '/dashboard/maestros',      label: 'Maestros' },
      { href: '/dashboard/secuencias',    label: 'Secuencias NCF' },
      { href: '/dashboard/certificado',   label: 'Certificado digital' },
      { href: '/dashboard/habilitacion',  label: 'Activar facturación electrónica' },
      // Usuarios, roles y plan viven en el área de Administración (/cuenta):
      // son del negocio, no de Facturación. Se llega por el switcher de módulo.
      { href: '/dashboard/impresoras',    label: 'Impresoras' },
    ],
  },
];

/** Secciones sin submenú. Van en la MISMA lista que los grupos: para el
 *  usuario "Contactos" y "Contabilidad" son dos entradas del menú, y el orden
 *  por uso no tendría sentido si vivieran en dos listas separadas.
 *
 *  Reportes ya no sale arriba junto a Contactos: se mira DESPUÉS de cerrar los
 *  números, no antes de empezar el día, así que baja a debajo de Contabilidad
 *  (ver `seccionesBase`). */
const ITEMS: NavItem[] = [
  { id: 'dashboard', href: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { id: 'contactos', href: '/dashboard/clientes', icon: Users,           label: 'Contactos' },
  { id: 'reportes',  href: '/dashboard/reportes', icon: BarChart3,       label: 'Reportes'  },
];

// ─── Permission gating ──────────────────────────────────────────────────────
// Mapeo href → permiso requerido. Si el usuario no tiene el permiso, el item
// se omite del sidebar. Items sin entrada aquí son visibles para todos.

const HREF_PERMISSION: Record<string, Permission | Permission[]> = {
  // Top items
  '/dashboard/clientes':              'clientes:ver',
  '/dashboard/reportes':              'reportes:ver',
  '/dashboard/facturas':              'facturas:ver',
  '/dashboard/facturas/nueva':        'facturas:crear',
  '/dashboard/cuentas-por-cobrar':    'facturas:ver',
  '/dashboard/pagos':                 'pagos:ver',
  '/dashboard/pagos/links':           'pagos:ver',
  '/dashboard/pagos/pasarelas':       'configuracion:ver',
  '/dashboard/notas-credito':         'facturas:ver',
  '/dashboard/cotizaciones':          'cotizaciones:ver',
  '/dashboard/cotizaciones/nueva':    'cotizaciones:gestionar',
  '/dashboard/facturas-recurrentes':  'facturas:ver',
  '/dashboard/productos':             'productos:ver',
  '/dashboard/categorias':            'productos:ver',
  '/dashboard/almacenes':             'productos:ver',
  '/dashboard/listas-precios':        'productos:ver',
  '/dashboard/vendedores':            'productos:ver',

  // Compras — owner/admin (e-CF de proveedores) o productos:gestionar (compras manuales)
  '/dashboard/compras':               ['compras:ver', 'productos:gestionar'],

  // Administración Escolar no vive aquí: es otro módulo, con su propio nav en
  // /escolar. El salto entre módulos lo ofrece RailModulos, al pie del menú.

  // Caja
  '/dashboard/caja':                  'caja:operar',
  '/dashboard/caja/aprobaciones':     'caja:aprobar',
  '/dashboard/caja/historial':        'caja:ver',

  // Punto de venta (POS)
  '/pos':                             'pos:vender',
  '/dashboard/pos-terminales':        'pos:configurar',

  // Configuración — solo roles con configuracion:ver
  '/dashboard/configuracion':         'configuracion:ver',
  '/dashboard/maestros':              'maestros:gestionar', // solo admin/owner

  // Contabilidad — el grupo llegó de main sin gate: cualquiera con dashboard
  // veía secuencias y consulta de e-NCF. Se gatea junto con el motor contable.
  '/dashboard/contabilidad/cuentas':      'contabilidad:ver',
  '/dashboard/contabilidad/libro-diario':  'contabilidad:ver',
  '/dashboard/contabilidad/nuevo-asiento': 'contabilidad:gestionar',
  '/dashboard/contabilidad/mayor':         'contabilidad:ver',
  '/dashboard/contabilidad/balance':       'contabilidad:ver',
  '/dashboard/contabilidad/estado-resultados': 'contabilidad:ver',
  '/dashboard/contabilidad/balance-general': 'contabilidad:ver',
  '/dashboard/contabilidad/activos-fijos': 'contabilidad:ver',
  '/dashboard/contabilidad/cuentas-por-pagar': 'contabilidad:ver',
  '/dashboard/contabilidad/cierre-ejercicio': 'contabilidad:ver',
  '/dashboard/contabilidad/configuracion': 'contabilidad:ver',
  '/dashboard/contabilidad/secuencias':   'contabilidad:ver',
  '/dashboard/contabilidad/consulta-ncf': 'contabilidad:ver',

  '/dashboard/secuencias':            'configuracion:gestionar',
  '/dashboard/certificado':           'configuracion:gestionar',
  '/dashboard/habilitacion':          'configuracion:gestionar',
  '/dashboard/equipo':                'equipo:ver',
  '/dashboard/equipo/permisos':       'equipo:gestionar',
  '/dashboard/impresoras':            'configuracion:ver',
};

// Gating del sidebar por PERMISOS EFECTIVOS (con overrides por empresa, vía
// /api/user). Mientras cargan los permisos se cae al catálogo estático del rol
// para evitar parpadeo. `perms` es null durante la carga.
function canAccessHref(
  href: string,
  perms: Set<string> | null,
  role: string | null | undefined,
): boolean {
  const perm = HREF_PERMISSION[href];
  if (!perm) return true; // sin gate explícito → visible para todos
  const needed = Array.isArray(perm) ? perm : [perm];
  // fallback mientras cargan los permisos efectivos: catálogo estático del rol
  if (!perms) return needed.some(p => userCan(undefined, role, p));
  return needed.some(p => perms.has(p));
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

interface Team     { id: number; razonSocial: string | null; rnc: string | null; planName: string | null; subscriptionStatus: string | null; role: string; logo: string | null; cajaHabilitada: boolean | null; posHabilitado: boolean | null; habilitacionCompletadoAt: string | Date | null; }

function teamHasPlan(t: Team) {
  // Producto en desarrollo: sin billing no existe el concepto de "empresa sin
  // plan", así que nada bloquea la navegación. Ver lib/config/billing.
  if (!BILLING_ENABLED) return true;
  if (t.subscriptionStatus === 'admin') return true;
  const name = t.planName?.toLowerCase();
  if (!name || name === 'gratis') return false;
  const s = t.subscriptionStatus?.toLowerCase();
  if (s === 'canceled' || s === 'unpaid') return false;
  return true;
}

// ─── Sidebar Content ──────────────────────────────────────────────────────────

// Los anchos, la escala de color (TINTA), la tipografía (FUENTE_SECCION) y los
// tiempos de los desplegables son los MISMOS en los cuatro módulos y viven en
// components/rail/estilos. Este archivo dejó de tener su copia el día que el
// rediseño de aquí no llegó a POS, Escolar ni Administración.

function SidebarContent({
  teams,
  activeTeamId,
  dgiiHabilitado,
  variant,
  onClose,
}: {
  teams: Team[];
  activeTeamId: number | null;
  dgiiHabilitado: boolean;
  /** 'rail' = columna que se expande al pasar el mouse; 'drawer' = cajón móvil. */
  variant?: 'rail' | 'drawer';
  onClose?: () => void;
}) {
  const rutaNavegador = usePathname();
  // En facturacion.zero.com.do el proxy sirve el panel por rewrite, así que la
  // barra dice `/` aunque se esté viendo `/dashboard`. Sin normalizarlo, nada
  // quedaba marcado en el menú justo al entrar.
  const pathname    = rutaNavegador === '/' ? '/dashboard' : rutaNavegador;
  const activeTeam  = teams.find(t => t.id === activeTeamId) ?? teams[0];
  const role        = activeTeam?.role;
  const cajaHabilitada = activeTeam?.cajaHabilitada ?? false;
  const hasPlan     = activeTeam ? teamHasPlan(activeTeam) : false;

  // Permisos efectivos (con overrides por empresa). null mientras carga →
  // canAccessHref usa el fallback estático del rol.
  const { permissions, modules, isLoading: permsLoading } = usePermissions();
  const permSet = useMemo(
    () => (permsLoading ? null : new Set<string>(permissions)),
    [permsLoading, permissions],
  );
  const can = useCallback(
    (href: string) => canAccessHref(href, permSet, role),
    [permSet, role],
  );

  // Grupo Caja — solo visible si cajaHabilitada y el rol tiene caja:ver
  const cajaCandidatos: NavGroup['children'] = [
    { href: '/dashboard/caja',              label: 'Mi caja' },
    { href: '/dashboard/caja/aprobaciones', label: 'Aprobaciones' },
    { href: '/dashboard/caja/historial',    label: 'Historial' },
  ].filter(c => can(c.href));

  const cajaGroup: NavGroup | null = cajaHabilitada && cajaCandidatos.length > 0
    ? { id: 'caja', label: 'Caja', icon: Wallet, children: cajaCandidatos }
    : null;

  // Punto de Venta NO es un grupo dentro del nav de Facturación: es OTRO módulo.
  // Como Alegra ("Ir a Alegra POS"), va como acceso separado al final del nav
  // que cambia de producto (a /pos). Solo si el usuario tiene el módulo pos.
  // Mismo trato para Administración Escolar. A diferencia del POS no tiene
  // flag propio en teams: manda `modules` (empresa ∩ rol), así que mientras
  // cargan los permisos NO se muestra — es opt-in y la mayoría no lo tiene.

  // Filtrar ITEMS + GROUPS por permisos del rol activo.
  // Grupos sin hijos accesibles se omiten completamente.
  // Para platform admin, activeTeam.role ya es 'admin' (via getUserTeams), que
  // tiene todos los permisos en ROLES. Por eso aquí no necesitamos pasar platformRole.
  // Grupos que pertenecen SOLO a Facturación: si el usuario no tiene ese módulo
  // (p.ej. un cajero solo-POS) no deben aparecer aunque un href suelto no esté
  // gateado por permiso. Inventario/Configuración quedan (traen entidades
  // compartidas como Productos). null en modules = aún cargando → no ocultar.
  const FACTURACION_ONLY_GROUPS = new Set(['ingresos', 'compras']);
  const sinFacturacion = !permsLoading && !modules.includes('facturacion');

  // "Activar facturación electrónica" vive arriba (fuera de Configuración)
  // mientras el ambiente DGII del team no sea Producción; una vez ahí se
  // mueve a Configuración, su ubicación permanente. Nunca aparece en los dos
  // lugares a la vez. dgiiHabilitado viene de /api/habilitacion/ambiente-actual
  // (lectura en vivo del ambiente en ecf-api) — ver DashboardLayout.
  // Se queda FUERA de la lista reordenable y clavado arriba: es un aviso con
  // fecha de caducidad, no una sección. Si el orden por uso lo mandara al
  // fondo, dejaría de cumplir su único trabajo.
  const habilitacionCta: NavItem | null =
    !dgiiHabilitado && can('/dashboard/habilitacion')
      ? { id: 'habilitacion', href: '/dashboard/habilitacion', icon: Zap, label: 'Activar facturación electrónica' }
      : null;

  const itemsVisibles = new Map(
    ITEMS.filter(i => can(i.href)).map(i => [i.id, { tipo: 'item' as const, ...i }]),
  );
  const staticGroupsVis   = GROUPS
    .filter(g => !(sinFacturacion && FACTURACION_ONLY_GROUPS.has(g.id)))
    .map(g => ({
      ...g,
      children: g.children
        .filter(c => can(c.href) && (dgiiHabilitado || c.href !== '/dashboard/habilitacion'))
        // Dentro de Configuración, ya habilitado, es un ítem permanente — vuelve
        // a su nombre original, distinto del CTA de arriba mientras está pendiente.
        .map(c => c.href === '/dashboard/habilitacion' ? { ...c, label: 'Habilitación e-CF' } : c),
    }))
    .filter(g => g.children.length > 0);
  // Caja va detrás de Inventario, no arriba del todo: se abre una vez al día,
  // mientras que Ingresos e Inventario se tocan a cada rato. El POS no entra
  // aquí: en v2 es un módulo del rail, no un grupo del nav de Facturación.
  const iInventario = staticGroupsVis.findIndex(g => g.id === 'inventario');
  const conCaja = iInventario === -1
    ? [...staticGroupsVis, cajaGroup]
    : [
        ...staticGroupsVis.slice(0, iInventario + 1),
        cajaGroup,
        ...staticGroupsVis.slice(iInventario + 1),
      ];
  const groupsVisibles    = conCaja.filter((g): g is NavGroup => g !== null);

  // ── La lista de secciones, en su orden POR DEFECTO ────────────────────────
  // Este es el orden que ve quien entra por primera vez, y el que rompe los
  // empates cuando dos secciones se usan lo mismo. El orden que se acaba
  // pintando sale de useOrdenNav (abajo).
  const seccionesBase: NavSeccion[] = [];
  const empujarItem = (id: string) => {
    const item = itemsVisibles.get(id);
    if (item) seccionesBase.push(item);
  };

  empujarItem('dashboard');
  empujarItem('contactos');
  for (const g of groupsVisibles) {
    seccionesBase.push({ tipo: 'grupo', ...g });
    if (g.id === 'contabilidad') empujarItem('reportes');
  }
  // Sin permiso de contabilidad no hay de qué colgarlo; cierra la lista.
  if (!seccionesBase.some(s => s.id === 'reportes')) empujarItem('reportes');

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <RailArmazon
      modulo="facturacion"
      variant={variant}
      // La versión lleva a Novedades: ver el número y querer saber qué cambió es
      // el mismo gesto. Evita un item más en el menú para algo que se mira de
      // vez en cuando.
      pie={
        <Typography
          component={Link}
          href="/dashboard/novedades"
          onClick={onClose}
          title="Ver qué hay de nuevo"
          className="nav-text"
          sx={{
            fontSize: '0.6875rem', fontWeight: 500, color: TINTA.tenue, whiteSpace: 'nowrap',
            textDecoration: 'none', transition: 'color 0.15s',
            '&:hover': { color: TINTA.hover },
          }}
        >
          Zero v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'} · Novedades
        </Typography>
      }
    >
        {/* Sin plan — bloquear nav */}
        {!hasPlan && (
          <Box className="nav-children" sx={{ mx: 0.5, mt: 0.5, mb: 1.5, borderRadius: '12px', bgcolor: 'rgba(245,158,11,0.2)', border: '1px solid rgba(251,191,36,0.3)', px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <AlertCircle style={{ width: 16, height: 16, color: '#fcd34d', marginTop: 2, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#fef3c7', lineHeight: 1.4 }}>
                Esta empresa no tiene un plan activo. Activa un plan para acceder a todas las funciones.
              </Typography>
            </Box>
            <Box
              component={Link}
              href="/pricing?reason=no-plan"
              onClick={onClose}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, width: '100%', py: 1, borderRadius: '8px', bgcolor: '#fbbf24', color: '#78350f', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', transition: 'background-color 0.15s', '&:hover': { bgcolor: '#fcd34d' } }}
            >
              <CreditCard style={{ width: 14, height: 14 }} />
              Activar plan
            </Box>
          </Box>
        )}

        {/* Nueva Factura — solo roles con facturas:crear */}
        {can('/dashboard/facturas/nueva') && (
          <Box
            component={Link}
            href="/dashboard/facturas/nueva"
            onClick={hasPlan ? onClose : (e: React.MouseEvent) => e.preventDefault()}
            sx={{
              display:     'flex',
              alignItems:  'center',
              gap:         1,
              px:          1.5,
              py:          1,
              mb:          0.5,
              borderRadius: '10px',
              bgcolor:     'rgba(255,255,255,0.16)',
              color:       '#ffffff',
              ...FUENTE_SECCION,
              fontWeight:  700,
              textDecoration: 'none',
              transition:  'background-color 0.15s',
              ...(hasPlan
                ? { '&:hover': { bgcolor: 'rgba(255,255,255,0.26)' } }
                : { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }),
            }}
          >
            <Plus style={{ width: 17, height: 17, flexShrink: 0 }} />
            <Box component="span" className="nav-text" sx={{ whiteSpace: 'nowrap' }}>Nueva Factura</Box>
          </Box>
        )}

        {/* Search */}
        <Box
          component="button"
          onClick={() => { onClose?.(); document.querySelector<HTMLButtonElement>('#global-search-trigger')?.click(); }}
          sx={{
            display:     'flex',
            alignItems:  'center',
            gap:         1,
            width:       '100%',
            px:          1.5,
            py:          1,
            mb:          0.5,
            borderRadius: '10px',
            color:       TINTA.reposo,
            ...FUENTE_SECCION,
            fontWeight:  600,
            cursor:      'pointer',
            bgcolor:     'transparent',
            border:      'none',
            transition:  'all 0.15s',
            '&:hover':   { bgcolor: 'rgba(255,255,255,0.1)', color: TINTA.hover },
          }}
        >
          <Search style={{ width: 17, height: 17, flexShrink: 0 }} />
          <Box component="span" className="nav-text" sx={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>Buscar...</Box>
          <Box
            component="kbd"
            className="nav-text"
            sx={{
              fontSize:    '0.6875rem',
              bgcolor:     'rgba(255,255,255,0.1)',
              color:       TINTA.tenue,
              borderRadius: '4px',
              px:          0.75,
              py:          0.25,
              fontFamily:  'monospace',
            }}
          >
            ⌘K
          </Box>
        </Box>

        {/* Activar facturación electrónica — clavado arriba mientras haga falta.
            Fuera de la lista reordenable, pero con la MISMA pieza que sus
            secciones: si diverge, se nota que es un pegote. */}
        {habilitacionCta && (
          <EnlaceSeccion
            item={habilitacionCta}
            activo={isActive(habilitacionCta.href)}
            onNavegar={onClose}
            tamanoIcono={17}
            sx={{
              gap: 1.25,
              px:  1.5,
              py:  1,
              mb:  0.5,
              // Un punto menos que el resto: es la única etiqueta larga del
              // menú y a 14px se corta incluso con la barra ya ensanchada.
              fontSize: '0.8125rem',
              fontWeight: 600,
              bgcolor: isActive(habilitacionCta.href) ? 'rgba(255,255,255,0.18)' : 'transparent',
              boxShadow: 'none',
            }}
          />
        )}

        <Divider sx={{ my: 0.75, borderColor: 'rgba(255,255,255,0.14)' }} />

        {/* Secciones — misma pieza que en POS, Escolar y Administración
            (components/rail). El orden lo pone useOrdenNav: el uso de los
            últimos días, no el orden en que están escritas arriba. */}
        <RailSecciones secciones={seccionesBase} modulo="facturacion" onNavegar={onClose} puedeVer={can} />
    </RailArmazon>
  );
}

// ─── Root Layout ──────────────────────────────────────────────────────────────

const layoutFetcher = (url: string) => fetch(url).then(r => r.json()).catch(() => null);

type EmpresaListResponse = {
  teams?: Team[];
  activeTeamId?: number | null;
} | null;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // El provider envuelve todo: el rail y el header deben leer el MISMO estado
  // de "menú fijo", y el provider tiene que estar por encima de los dos.
  return (
    <NavFijoProvider>
      <DashboardLayoutInterno>{children}</DashboardLayoutInterno>
    </NavFijoProvider>
  );
}

function DashboardLayoutInterno({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen]         = useState(false);
  const [activeTeamOverride, setActiveTeamOverride] = useState<number | null>(null);
  // Preferencia compartida con POS, Escolar y Administración: quien fija el
  // menú acá lo encuentra fijo allá. Antes esto era un localStorage propio de
  // Facturación ('emitedo:sidebarCollapsed') que ningún otro módulo leía.
  const { fijo: navFijo, alternar: alternarNavFijo } = useNavFijo();

  const { data: user }          = useSWR<UserInfo | null>('/api/user', layoutFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const { data: empresaData, mutate: mutateEmpresa } = useSWR<EmpresaListResponse>('/api/empresa/list', layoutFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });

  const teams: Team[] = empresaData?.teams ?? [];
  const activeTeamId  = activeTeamOverride ?? empresaData?.activeTeamId ?? teams[0]?.id ?? null;
  // Gate del contador de turno: sin el módulo, el badge no debe ni consultar.
  const cajaHabilitada = (teams.find(t => t.id === activeTeamId) ?? teams[0])?.cajaHabilitada ?? false;

  const activeTeamNav = teams.find(t => t.id === activeTeamId) ?? teams[0];

  // Dónde vive el link de habilitación en el nav: el flag local
  // (habilitacionCompletadoAt) llega gratis en el mismo /api/empresa/list de
  // arriba — decide sin round-trip extra ni parpadeo. La lectura en vivo del
  // ambiente en ecf-api (abajo) corre en paralelo solo para auto-sanar teams
  // que llegaron a Producción antes de que este flag existiera; su GET ya
  // deja el flag escrito (ver ambiente-actual/route.ts), así que solo hace
  // falta revalidar la lista de empresas una vez si detecta un desfase.
  const dgiiHabilitado = !!activeTeamNav?.habilitacionCompletadoAt;
  const { data: ambienteActual } = useSWR<{ ambiente: string | null }>(
    '/api/habilitacion/ambiente-actual',
    layoutFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  useEffect(() => {
    if (ambienteActual?.ambiente === 'Produccion' && !dgiiHabilitado) mutateEmpresa();
  }, [ambienteActual, dgiiHabilitado, mutateEmpresa]);

  function handleSwitch(teamId: number) {
    setActiveTeamOverride(teamId);
    mutateEmpresa();
  }

  return (
    <Box sx={{ display: 'flex', height: '100dvh', bgcolor: 'grey.50', overflow: 'hidden' }}>
      {/* El buscador ya NO se monta aquí: vive dentro de ModuleHeader, en el
          centro de la barra superior. Montarlo también aquí dejaba dos botones
          con el mismo `id="global-search-trigger"` y el del menú lateral abría
          el modal del componente equivocado. */}

      {/* Arquitectura idéntica al Punto de Venta: rail full-height a la izquierda
          (mismo menú que se abre/cierra al pasar el mouse) + columna de contenido
          (header + página) a la derecha. El armazón —ancho, plegado y hover— lo
          pone RailArmazon, el mismo de los otros tres módulos. */}
      <SidebarContent teams={teams} activeTeamId={activeTeamId} dgiiHabilitado={dgiiHabilitado} />

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': { width: ANCHO_ABIERTO, boxSizing: 'border-box', border: 'none' },
        }}
      >
        <SidebarContent teams={teams} activeTeamId={activeTeamId} dgiiHabilitado={dgiiHabilitado} variant="drawer" onClose={() => setMobileOpen(false)} />
      </Drawer>

      {/* Columna de contenido: header (barra) + página */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header único del sistema — el mismo que montan POS, Escolar y
            Administración. Ver components/module-header.tsx. */}
        <ModuleHeader
          current="facturacion"
          user={user ?? null}
          onAbrirMenu={() => setMobileOpen(true)}
          onFijarMenu={alternarNavFijo}
          menuFijo={navFijo}
          onSwitchEmpresa={handleSwitch}
          breakpointMenu="lg"
        />

        {/* Fuera del área que hace scroll: un aviso de cobro que se pierde al
            bajar la página no sirve de nada. */}
        <BannerSuscripcion />

        {/* Page content */}
        <Box
          component="main"
          sx={{ flex: 1, overflowY: 'auto', bgcolor: 'grey.50', minWidth: 0 }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
