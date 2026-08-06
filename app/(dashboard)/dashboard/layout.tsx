'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard, Users, Package,
  Settings, Activity, Shield, Menu as MenuIcon, Plus, ChevronDown, ChevronRight,
  TrendingDown, BarChart3, CreditCard, Building2, Check, LogOut,
  Printer, X, ChevronUp, Search, UserCircle, AlertCircle, Zap,
  PanelLeftClose, PanelLeftOpen, ShoppingCart, Wallet, BookOpen,
  } from 'lucide-react';
import { GlobalSearch } from '@/components/global-search';
import { ModuleHeader } from '@/components/module-header';
import { RailModulos } from '@/components/rail-modulos';
import { RailBrand } from '@/components/rail-brand';
import { NavFijoProvider, useNavFijo } from '@/lib/hooks/useNavFijo';
import { planHasFeature } from '@/lib/plans';
import { userCan, type Permission } from '@/lib/config/roles';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { ProfileDropdown, getInitials, type UserInfo } from '@/components/profile-dropdown';

// MUI imports
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Collapse from '@mui/material/Collapse';
import Menu from '@mui/material/Menu';

// ─── Types ────────────────────────────────────────────────────────────────────

type NavGroup = {
  id: string;
  label: string;
  icon: React.ElementType;
  children: { href: string; label: string; plusHref?: string; shared?: boolean }[];
};

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
};

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
      { href: '/dashboard/pagos/links',          label: 'Links de pago' },
      { href: '/dashboard/pagos/pasarelas',      label: 'Pasarelas de pago' },
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
      // Usuarios, roles y plan viven en el área de Administración (/cuenta):
      // son del negocio, no de Facturación. Se llega por el switcher de módulo.
      { href: '/dashboard/impresoras',    label: 'Impresoras' },
    ],
  },
];

const TOP_ITEMS: NavItem[] = [
  { href: '/dashboard',          icon: LayoutDashboard, label: 'Inicio',    exact: true },
  { href: '/dashboard/clientes', icon: Users,           label: 'Contactos' },
  { href: '/dashboard/reportes', icon: BarChart3,       label: 'Reportes'  },
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

interface Team     { id: number; razonSocial: string | null; rnc: string | null; planName: string | null; subscriptionStatus: string | null; role: string; logo: string | null; cajaHabilitada: boolean | null; posHabilitado: boolean | null; }

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, cb]);
}

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

function planColor(planName: string | null): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  const p = planName?.toLowerCase();
  if (!p) return 'default';
  if (p === 'pro')      return 'secondary';
  if (p === 'business') return 'primary';
  if (p === 'starter')  return 'info';
  return 'default';
}

// ─── Profile Dropdown ─────────────────────────────────────────────────────────


// ─── Sidebar Content ──────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 224;
const RAIL_WIDTH = 68;   // ancho colapsado (solo iconos) del sidebar desktop

function SidebarContent({
  teams,
  activeTeamId,
  onClose,
}: {
  teams: Team[];
  activeTeamId: number | null;
  onClose?: () => void;
}) {
  const pathname    = usePathname();
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

  // Todos los items siempre habilitados
  function isEnabled(_href: string): boolean {
    return true;
  }

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

  // Filtrar TOP_ITEMS + GROUPS por permisos del rol activo.
  // Grupos sin hijos accesibles se omiten completamente.
  // Para platform admin, activeTeam.role ya es 'admin' (via getUserTeams), que
  // tiene todos los permisos en ROLES. Por eso aquí no necesitamos pasar platformRole.
  // Grupos que pertenecen SOLO a Facturación: si el usuario no tiene ese módulo
  // (p.ej. un cajero solo-POS) no deben aparecer aunque un href suelto no esté
  // gateado por permiso. Inventario/Configuración quedan (traen entidades
  // compartidas como Productos). null en modules = aún cargando → no ocultar.
  const FACTURACION_ONLY_GROUPS = new Set(['ingresos', 'compras']);
  const sinFacturacion = !permsLoading && !modules.includes('facturacion');

  const topItemsVisibles  = TOP_ITEMS.filter(item => can(item.href));
  const staticGroupsVis   = GROUPS
    .filter(g => !(sinFacturacion && FACTURACION_ONLY_GROUPS.has(g.id)))
    .map(g => ({ ...g, children: g.children.filter(c => can(c.href)) }))
    .filter(g => g.children.length > 0);
  const groupsVisibles    = [cajaGroup, ...staticGroupsVis].filter((g): g is NavGroup => g !== null);

  const defaultOpen = groupsVisibles.reduce((acc, g) => {
    acc[g.id] = g.children.some(c => pathname.startsWith(c.href));
    return acc;
  }, {} as Record<string, boolean>);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpen);

  const toggleGroup = (id: string) =>
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <Box
      sx={{
        width:    SIDEBAR_WIDTH,
        height:   '100%',
        display:  'flex',
        flexDirection: 'column',
        bgcolor:  '#0f766e',
        overflow: 'hidden',
      }}
    >
      <RailBrand modulo="facturacion" />

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>

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
              borderRadius: '8px',
              bgcolor:     'rgba(255,255,255,0.15)',
              color:       '#ffffff',
              fontSize:    '0.875rem',
              fontWeight:  600,
              textDecoration: 'none',
              transition:  'background-color 0.15s',
              ...(hasPlan
                ? { '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }
                : { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }),
            }}
          >
            <Plus style={{ width: 16, height: 16, flexShrink: 0 }} />
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
            borderRadius: '8px',
            color:       'rgba(204,251,241,0.8)',
            fontSize:    '0.875rem',
            cursor:      'pointer',
            bgcolor:     'transparent',
            border:      'none',
            transition:  'all 0.15s',
            '&:hover':   { bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff' },
          }}
        >
          <Search style={{ width: 16, height: 16, flexShrink: 0 }} />
          <Box component="span" className="nav-text" sx={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>Buscar...</Box>
          <Box
            component="kbd"
            className="nav-text"
            sx={{
              fontSize:    '0.6875rem',
              bgcolor:     'rgba(255,255,255,0.1)',
              borderRadius: '4px',
              px:          0.75,
              py:          0.25,
              fontFamily:  'monospace',
            }}
          >
            ⌘K
          </Box>
        </Box>

        {/* Top items */}
        {topItemsVisibles.map(item => {
          const active = isActive(item.href, item.exact);
          return (
            <Box
              key={item.href}
              component={Link}
              href={item.href}
              onClick={onClose}
              sx={{
                display:     'flex',
                alignItems:  'center',
                gap:         1,
                px:          1.5,
                py:          0.875,
                borderRadius: '8px',
                fontSize:    '0.875rem',
                fontWeight:  active ? 600 : 400,
                color:       active ? '#ffffff' : 'rgba(204,251,241,0.85)',
                bgcolor:     active ? 'rgba(255,255,255,0.2)' : 'transparent',
                textDecoration: 'none',
                transition:  'all 0.15s',
                '&:hover':   { bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff' },
              }}
            >
              <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
              <Box component="span" className="nav-text" sx={{ whiteSpace: 'nowrap' }}>{item.label}</Box>
            </Box>
          );
        })}

        <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.15)' }} />

        {/* Groups */}
        {groupsVisibles.map(group => {
          const groupActive = group.children.some(c => pathname.startsWith(c.href));
          const isOpen      = openGroups[group.id] ?? false;

          return (
            <Box key={group.id}>
              <Box
                component="button"
                onClick={() => toggleGroup(group.id)}
                sx={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         1,
                  width:       '100%',
                  px:          1.5,
                  py:          0.875,
                  borderRadius: '8px',
                  fontSize:    '0.875rem',
                  fontWeight:  groupActive ? 600 : 400,
                  color:       groupActive ? '#ffffff' : 'rgba(204,251,241,0.85)',
                  bgcolor:     'transparent',
                  border:      'none',
                  cursor:      'pointer',
                  transition:  'all 0.15s',
                  '&:hover':   { bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff' },
                }}
              >
                <group.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                <Box component="span" className="nav-text" sx={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{group.label}</Box>
                <Box component="span" className="nav-text" sx={{ display: 'flex' }}>
                  {isOpen
                    ? <ChevronUp style={{ width: 14, height: 14, opacity: 0.7 }} />
                    : <ChevronRight style={{ width: 14, height: 14, opacity: 0.7 }} />
                  }
                </Box>
              </Box>

              <Collapse className="nav-children" in={isOpen} timeout="auto">
                <Box sx={{ ml: 3, pl: 1, borderLeft: '1px solid rgba(255,255,255,0.2)', mt: 0.25, mb: 0.5 }}>
                  {group.children.map(child => {
                    const active = pathname.startsWith(child.href);
                    return (
                      <Box
                        key={child.href}
                        sx={{ display: 'flex', alignItems: 'center', '&:hover .plus-btn': { opacity: 1 } }}
                      >
                        <Box
                          component={Link}
                          href={child.href}
                          onClick={onClose}
                          sx={{
                            flex:        1,
                            minWidth:    0,
                            py:          0.75,
                            px:          1.25,
                            borderRadius: '6px',
                            fontSize:    '0.8125rem',
                            fontWeight:  active ? 600 : 400,
                            color:       active ? '#ffffff' : 'rgba(204,251,241,0.8)',
                            bgcolor:     active ? 'rgba(255,255,255,0.15)' : 'transparent',
                            textDecoration: 'none',
                            transition:  'all 0.15s',
                            whiteSpace:  'nowrap',
                            overflow:    'hidden',
                            textOverflow: 'ellipsis',
                            display:     'flex',
                            alignItems:  'center',
                            gap:         0.75,
                            '&:hover':   { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.08)' },
                          }}
                        >
                          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{child.label}</Box>
                          {child.shared && (
                            <Box
                              component="span"
                              title="Compartido con Facturación — mismos productos y contactos en ambos módulos"
                              sx={{ flexShrink: 0, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', px: 0.625, py: '1px', borderRadius: '4px', bgcolor: 'rgba(255,255,255,0.16)', color: 'rgba(204,251,241,0.95)' }}
                            >
                              Compartido
                            </Box>
                          )}
                        </Box>
                        {child.plusHref && can(child.plusHref) && (
                          <Box
                            component={Link}
                            href={child.plusHref}
                            onClick={onClose}
                            className="plus-btn"
                            title="Nuevo"
                            sx={{
                              opacity:     0,
                              p:           0.5,
                              borderRadius: '4px',
                              color:       'rgba(204,251,241,0.7)',
                              transition:  'all 0.15s',
                              display:     'flex',
                              '&:hover':   { bgcolor: 'rgba(255,255,255,0.2)', color: '#ffffff' },
                            }}
                          >
                            <Plus style={{ width: 12, height: 12 }} />
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Collapse>
            </Box>
          );
        })}

        {/* Justo después de Configuración, dentro de la lista que hace scroll —
            no anclado al pie. Mismo componente y misma fuente de datos que en
            los otros 3 menús: los módulos que la empresa tiene y el rol puede
            ver. Antes acá había enlaces sueltos a POS y Escolar a mano. */}
        <RailModulos current="facturacion" />
      </Box>

      {/* La versión lleva a Novedades: ver el número y querer saber qué cambió es
          el mismo gesto. Evita un item más en el menú para algo que se mira de
          vez en cuando. */}
      <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <Typography
          component={Link}
          href="/dashboard/novedades"
          onClick={onClose}
          title="Ver qué hay de nuevo"
          className="nav-text"
          sx={{
            fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap',
            textDecoration: 'none', transition: 'color 0.15s',
            '&:hover': { color: 'rgba(204,251,241,0.9)' },
          }}
        >
          Zero v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'} · Novedades
        </Typography>
      </Box>
    </Box>
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
  const { data: ambienteData, mutate: mutateAmbiente } = useSWR<{ ambiente: string | null } | null>('/api/sistema/ambiente', layoutFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });

  const dgiiAmbiente = ambienteData?.ambiente ?? null;
  const teams: Team[] = empresaData?.teams ?? [];
  const activeTeamId  = activeTeamOverride ?? empresaData?.activeTeamId ?? teams[0]?.id ?? null;
  // Gate del contador de turno: sin el módulo, el badge no debe ni consultar.
  const cajaHabilitada = (teams.find(t => t.id === activeTeamId) ?? teams[0])?.cajaHabilitada ?? false;

  function handleSwitch(teamId: number) {
    setActiveTeamOverride(teamId);
    mutateEmpresa();
    mutateAmbiente();
  }

  return (
    <Box sx={{ display: 'flex', height: '100dvh', bgcolor: 'grey.50', overflow: 'hidden' }}>
      <GlobalSearch />

      {/* Arquitectura idéntica al Punto de Venta: rail full-height a la izquierda
          (mismo menú que se abre/cierra al pasar el mouse) + columna de contenido
          (header + página) a la derecha. */}
      <Box
          component="aside"
          sx={{ width: navFijo ? SIDEBAR_WIDTH : RAIL_WIDTH, flexShrink: 0, display: { xs: 'none', lg: 'block' }, position: 'relative' }}
        >
          <Box
            sx={{
              position:   'absolute',
              top:        0,
              left:       0,
              height:     '100%',
              width:      navFijo ? SIDEBAR_WIDTH : RAIL_WIDTH,
              overflow:   'hidden',
              zIndex:     40,
              transition: 'width 0.2s ease, box-shadow 0.2s ease',
              '& .nav-text':      { opacity: navFijo ? 1 : 0, transition: 'opacity 0.12s ease' },
              '& .nav-children':  { display: navFijo ? 'block' : 'none' },
              ...(navFijo ? {} : {
                '&:hover':               { width: SIDEBAR_WIDTH, boxShadow: '6px 0 28px rgba(0,0,0,0.22)' },
                '&:hover .nav-text':     { opacity: 1 },
                '&:hover .nav-children': { display: 'block' },
              }),
            }}
          >
            <SidebarContent teams={teams} activeTeamId={activeTeamId} />
          </Box>
        </Box>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box', border: 'none' },
        }}
      >
        <SidebarContent teams={teams} activeTeamId={activeTeamId} onClose={() => setMobileOpen(false)} />
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
