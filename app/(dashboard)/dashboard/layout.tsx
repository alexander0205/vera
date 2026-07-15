'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard, Users, Package,
  Settings, Activity, Shield, Menu as MenuIcon, Plus, ChevronDown, ChevronRight,
  TrendingDown, BarChart3, CreditCard, Building2, Check, LogOut,
  Printer, X, ChevronUp, Search, UserCircle, AlertCircle, Zap,
  PanelLeftClose, PanelLeftOpen, ShoppingCart, Wallet, Store,
} from 'lucide-react';
import { GlobalSearch } from '@/components/global-search';
import { ModuleSwitcher } from '@/components/module-switcher';
import { planHasFeature } from '@/lib/plans';
import { userCan, type Permission } from '@/lib/config/roles';
import { usePermissions } from '@/lib/hooks/usePermissions';

// MUI imports
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Collapse from '@mui/material/Collapse';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';

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
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    children: [
      { href: '/dashboard/configuracion', label: 'Mi empresa' },
      { href: '/dashboard/maestros',      label: 'Maestros' },
      { href: '/dashboard/secuencias',    label: 'Secuencias NCF' },
      { href: '/dashboard/certificado',   label: 'Certificado digital' },
      { href: '/dashboard/equipo',        label: 'Usuarios y equipo' },
      { href: '/dashboard/equipo/permisos', label: 'Roles y permisos' },
      { href: '/dashboard/api-keys',      label: 'API Keys' },
      { href: '/dashboard/webhooks',      label: 'Webhooks' },
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

  '/dashboard/secuencias':            'configuracion:gestionar',
  '/dashboard/certificado':           'configuracion:gestionar',
  '/dashboard/equipo':                'equipo:ver',
  '/dashboard/equipo/permisos':       'equipo:gestionar',
  '/dashboard/api-keys':              'configuracion:gestionar',
  '/dashboard/webhooks':              'configuracion:gestionar',
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
interface UserInfo { name: string | null; email: string; platformRole?: string | null; }

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

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

// ─── Company Switcher ─────────────────────────────────────────────────────────

function CompanySwitcher({
  teams,
  activeTeamId,
  onSwitch,
}: {
  teams: Team[];
  activeTeamId: number | null;
  onSwitch: (teamId: number) => void;
}) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [search, setSearch]     = useState('');
  const open = Boolean(anchorEl);

  const active   = teams.find(t => t.id === activeTeamId) ?? teams[0];
  const filtered = teams.filter(t =>
    !search ||
    t.razonSocial?.toLowerCase().includes(search.toLowerCase()) ||
    t.rnc?.includes(search)
  );

  async function switchTeam(teamId: number) {
    if (teamId === activeTeamId) { setAnchorEl(null); setSearch(''); return; }
    setAnchorEl(null);
    setSearch('');
    await fetch('/api/empresa/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    });
    onSwitch(teamId);
    const target = teams.find(t => t.id === teamId);
    if (!target || !teamHasPlan(target)) {
      router.push('/pricing?reason=no-plan');
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  const label = active?.razonSocial ?? active?.rnc ?? 'Mi empresa';

  return (
    <>
      <Box
        component="button"
        onClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        sx={{
          display:       'flex',
          alignItems:    'center',
          gap:           1,
          px:            1.5,
          py:            0.75,
          borderRadius:  '8px',
          border:        '1px solid',
          borderColor:   'divider',
          bgcolor:       'background.paper',
          cursor:        'pointer',
          transition:    'all 0.15s',
          maxWidth:      240,
          '&:hover':     { bgcolor: 'grey.50', borderColor: 'grey.400' },
        }}
      >
        {active?.logo ? (
          <img src={active.logo} alt={label} style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
        ) : (
          <Avatar sx={{ width: 24, height: 24, fontSize: '0.6875rem', fontWeight: 700, bgcolor: 'primary.main', borderRadius: '6px' }}>
            {(label[0] ?? 'E').toUpperCase()}
          </Avatar>
        )}
        <Typography
          variant="body2"
          noWrap
          sx={{ maxWidth: 140, flex: 1, textAlign: 'left', fontWeight: 600, color: 'text.primary' }}
        >
          {label}
        </Typography>
        {active && teamHasPlan(active) && active.planName && (
          <Chip
            label={active.planName}
            size="small"
            color={planColor(active.planName)}
            sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700, display: { xs: 'none', sm: 'flex' } }}
          />
        )}
        <ChevronDown
          style={{
            width:      14,
            height:     14,
            color:      '#9ca3af',
            transform:  open ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => { setAnchorEl(null); setSearch(''); }}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              borderRadius: '12px',
              border:       '1px solid #e5e7eb',
              boxShadow:    '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              minWidth:     280,
              mt:           0.5,
            },
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {teams.length > 3 && (
          <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              bgcolor: 'grey.50', borderRadius: '8px', px: 1.5, py: 0.75,
            }}>
              <Search style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
              <InputBase
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar empresa..."
                sx={{ flex: 1, fontSize: '0.875rem' }}
              />
            </Box>
          </Box>
        )}

        <Box sx={{ py: 0.5, maxHeight: 240, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5, textAlign: 'center' }}>
              Sin resultados
            </Typography>
          ) : filtered.map(t => (
            <MenuItem
              key={t.id}
              onClick={() => switchTeam(t.id)}
              sx={{
                borderRadius: '6px',
                mx: 0.5,
                gap: 1.5,
                py: 1,
                '&:hover': { bgcolor: 'grey.50' },
              }}
            >
              {t.logo ? (
                <img src={t.logo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
              ) : (
                <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', fontWeight: 700, bgcolor: 'primary.main', borderRadius: '6px', flexShrink: 0 }}>
                  {((t.razonSocial ?? t.rnc ?? 'E')[0] ?? 'E').toUpperCase()}
                </Avatar>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {t.razonSocial ?? t.rnc ?? 'Sin nombre'}
                </Typography>
                {t.rnc && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    RNC {t.rnc}
                  </Typography>
                )}
              </Box>
              {t.id === activeTeamId && (
                <Check style={{ width: 16, height: 16, color: '#0d9488', flexShrink: 0 }} />
              )}
            </MenuItem>
          ))}
        </Box>
      </Menu>
    </>
  );
}

// ─── Profile Dropdown ─────────────────────────────────────────────────────────

function ProfileDropdown({ user }: { user: UserInfo | null }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  async function handleSignOut() {
    setAnchorEl(null);
    await fetch('/api/user', { method: 'DELETE' });
    router.push('/sign-in');
    router.refresh();
  }

  const menuItems = [
    ...(user?.platformRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Panel admin' }] : []),
    { href: '/dashboard/perfil',      icon: UserCircle, label: 'Mi perfil' },
    { href: '/dashboard/suscripcion', icon: CreditCard, label: 'Suscripción' },
    { href: '/dashboard/activity',    icon: Activity,   label: 'Actividad' },
    { href: '/dashboard/security',    icon: Shield,     label: 'Seguridad' },
  ];

  const initials = user ? getInitials(user.name, user.email) : '?';

  return (
    <>
      <Tooltip title={user?.name ?? user?.email ?? ''} placement="bottom">
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          sx={{ p: 0.5 }}
        >
          <Avatar
            sx={{
              width:    32,
              height:   32,
              bgcolor:  'primary.main',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {initials}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              borderRadius: '12px',
              border:       '1px solid #e5e7eb',
              boxShadow:    '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              minWidth:     220,
              mt:           0.5,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {user?.name ?? user?.email}
          </Typography>
          {user?.name && (
            <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
              {user.email}
            </Typography>
          )}
        </Box>

        <Box sx={{ py: 0.5 }}>
          {menuItems.map(item => (
            <MenuItem
              key={item.href}
              component={Link}
              href={item.href}
              sx={{ borderRadius: '6px', mx: 0.5, gap: 1.5, py: '6px', fontSize: '0.875rem' }}
            >
              <ListItemIcon sx={{ minWidth: 'auto' }}>
                <item.icon style={{ width: 16, height: 16, color: '#6b7280' }} />
              </ListItemIcon>
              {item.label}
            </MenuItem>
          ))}
        </Box>

        <Divider sx={{ my: 0 }} />

        <Box sx={{ py: 0.5 }}>
          <MenuItem
            onClick={handleSignOut}
            sx={{
              borderRadius: '6px',
              mx: 0.5,
              gap: 1.5,
              py: '6px',
              fontSize: '0.875rem',
              color: 'error.main',
              '&:hover': { bgcolor: '#fef2f2' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}>
              <LogOut style={{ width: 16, height: 16, color: '#ef4444' }} />
            </ListItemIcon>
            Cerrar sesión
          </MenuItem>
        </Box>
      </Menu>
    </>
  );
}

// ─── Ambiente Badge ───────────────────────────────────────────────────────────

function AmbienteBadge({ ambiente }: { ambiente: string | null }) {
  if (!ambiente || ambiente === 'Produccion') return null;

  const map: Record<string, { label: string; color: 'warning' | 'secondary' | 'default' }> = {
    TesteCF: { label: 'Pruebas',       color: 'warning' },
    CerteCF: { label: 'Certificación', color: 'secondary' },
  };
  const item = map[ambiente] ?? { label: 'No producción', color: 'default' as const };

  return (
    <Chip
      icon={<AlertCircle style={{ width: 12, height: 12 }} />}
      label={item.label}
      size="small"
      color={item.color}
      variant="outlined"
      sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 22 }}
    />
  );
}

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

  // Grupo Punto de venta — solo visible si posHabilitado y el rol tiene acceso.
  // Incluye accesos a las entidades COMPARTIDAS entre módulos (productos y
  // contactos): son las mismas tablas que usa Facturación, así el usuario del
  // POS las gestiona sin salir a buscar en el menú de Facturación.
  const posHabilitado = activeTeam?.posHabilitado ?? false;
  const posCandidatos: NavGroup['children'] = [
    { href: '/pos',                      label: 'Abrir punto de venta' },
    { href: '/dashboard/pos-terminales', label: 'Terminales' },
    { href: '/dashboard/productos',      label: 'Productos y servicios', plusHref: '/dashboard/productos', shared: true },
    { href: '/dashboard/clientes',       label: 'Contactos', shared: true },
  ].filter(c => can(c.href));

  const posGroup: NavGroup | null = posHabilitado && posCandidatos.length > 0
    ? { id: 'pos', label: 'Punto de venta', icon: Store, children: posCandidatos }
    : null;

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
  const groupsVisibles    = [posGroup, cajaGroup, ...staticGroupsVis].filter((g): g is NavGroup => g !== null);

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
      {/* Logo */}
      <Box sx={{ px: 2, py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width:   28,
            height:  28,
            bgcolor: '#ffffff',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Typography sx={{ color: '#0f766e', fontWeight: 900, fontSize: '0.75rem', lineHeight: 1 }}>z</Typography>
          </Box>
          <Typography className="nav-text" sx={{ color: '#ffffff', fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
            Zero
          </Typography>
        </Box>
      </Box>

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
      </Box>

      <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)' }}>
          Zero v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
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
  const [mobileOpen, setMobileOpen]         = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeTeamOverride, setActiveTeamOverride] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('emitedo:sidebarCollapsed');
      if (stored === '1') setSidebarVisible(false);
    } catch {}
  }, []);

  function toggleSidebar() {
    setSidebarVisible(prev => {
      const next = !prev;
      try { localStorage.setItem('emitedo:sidebarCollapsed', next ? '0' : '1'); } catch {}
      return next;
    });
  }

  const { data: user }          = useSWR<UserInfo | null>('/api/user', layoutFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const { data: empresaData, mutate: mutateEmpresa } = useSWR<EmpresaListResponse>('/api/empresa/list', layoutFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const { data: ambienteData, mutate: mutateAmbiente } = useSWR<{ ambiente: string | null } | null>('/api/sistema/ambiente', layoutFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });

  const dgiiAmbiente = ambienteData?.ambiente ?? null;
  const teams: Team[] = empresaData?.teams ?? [];
  const activeTeamId  = activeTeamOverride ?? empresaData?.activeTeamId ?? teams[0]?.id ?? null;

  function handleSwitch(teamId: number) {
    setActiveTeamOverride(teamId);
    mutateEmpresa();
    mutateAmbiente();
  }

  return (
    <Box sx={{ display: 'flex', height: '100dvh', bgcolor: 'grey.50', overflow: 'hidden' }}>
      <GlobalSearch />

      {/* Desktop Sidebar — rail de iconos que se expande al pasar el mouse.
          El aside reserva solo RAIL_WIDTH; el panel interno flota (absolute) y
          crece a SIDEBAR_WIDTH en hover, así el contenido principal no se
          reacomoda. Los labels (.nav-text) y los hijos de grupo (.nav-children)
          se ocultan colapsado y aparecen en hover — animado, sin re-render. */}
      {sidebarVisible && (
        <Box
          component="aside"
          sx={{
            width:      RAIL_WIDTH,
            flexShrink: 0,
            display:    { xs: 'none', lg: 'block' },
            position:   'relative',
          }}
        >
          <Box
            sx={{
              position:   'absolute',
              top:        0,
              left:       0,
              height:     '100%',
              width:      RAIL_WIDTH,
              overflow:   'hidden',
              zIndex:     30,
              transition: 'width 0.2s ease, box-shadow 0.2s ease',
              '& .nav-text':      { opacity: 0, transition: 'opacity 0.12s ease' },
              '& .nav-children':  { display: 'none' },
              '&:hover':          { width: SIDEBAR_WIDTH, boxShadow: '6px 0 28px rgba(0,0,0,0.22)' },
              '&:hover .nav-text':     { opacity: 1 },
              '&:hover .nav-children': { display: 'block' },
            }}
          >
            <SidebarContent teams={teams} activeTeamId={activeTeamId} />
          </Box>
        </Box>
      )}

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

      {/* Main column */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor:      '#ffffff',
            color:        'text.primary',
            borderBottom: '1px solid #e5e7eb',
            height:       56,
            flexShrink:   0,
            zIndex:       30,
          }}
        >
          <Toolbar
            variant="dense"
            sx={{ height: 56, minHeight: 56, gap: 1, px: { xs: 1.5, sm: 2 } }}
          >
            {/* Mobile hamburger */}
            <IconButton
              onClick={() => setMobileOpen(true)}
              size="small"
              sx={{ display: { lg: 'none' }, color: 'text.secondary' }}
            >
              <MenuIcon style={{ width: 20, height: 20 }} />
            </IconButton>

            {/* Desktop sidebar toggle */}
            <Tooltip title={sidebarVisible ? 'Ocultar menú' : 'Mostrar menú'} placement="bottom">
              <IconButton
                onClick={toggleSidebar}
                size="small"
                sx={{ display: { xs: 'none', lg: 'flex' }, color: 'text.secondary' }}
              >
                {sidebarVisible
                  ? <PanelLeftClose style={{ width: 20, height: 20 }} />
                  : <PanelLeftOpen  style={{ width: 20, height: 20 }} />
                }
              </IconButton>
            </Tooltip>

            {/* Logo when sidebar collapsed */}
            {!sidebarVisible && (
              <Box
                sx={{
                  display:    { xs: 'none', lg: 'flex' },
                  alignItems: 'center',
                  gap:        1,
                  mr:         1,
                }}
              >
                <Box sx={{ width: 24, height: 24, bgcolor: 'primary.main', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '0.75rem' }}>z</Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'text.primary' }}>Zero</Typography>
              </Box>
            )}

            {/* Mobile logo */}
            <Box
              sx={{
                display:    { xs: 'flex', lg: 'none' },
                alignItems: 'center',
                gap:        1,
                mr:         1,
              }}
            >
              <Box sx={{ width: 24, height: 24, bgcolor: 'primary.main', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '0.75rem' }}>z</Typography>
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'text.primary', display: { xs: 'none', sm: 'block' } }}>Zero</Typography>
            </Box>

            {/* Company switcher */}
            <CompanySwitcher teams={teams} activeTeamId={activeTeamId} onSwitch={handleSwitch} />

            {/* Module switcher (Facturación ↔ POS) */}
            <ModuleSwitcher current="facturacion" />

            {/* DGII ambiente badge */}
            <AmbienteBadge ambiente={dgiiAmbiente} />

            <Box sx={{ flex: 1 }} />

            {/* Search button */}
            <Box
              component="button"
              onClick={() => document.querySelector<HTMLButtonElement>('#global-search-trigger')?.click()}
              sx={{
                display:     { xs: 'none', sm: 'flex' },
                alignItems:  'center',
                gap:         1,
                fontSize:    '0.875rem',
                color:       'text.secondary',
                px:          1.25,
                py:          0.75,
                borderRadius: '8px',
                bgcolor:     'transparent',
                border:      'none',
                cursor:      'pointer',
                transition:  'all 0.15s',
                '&:hover':   { bgcolor: 'grey.50', color: 'text.primary' },
              }}
            >
              <Search style={{ width: 16, height: 16 }} />
              <Box component="span" sx={{ display: { xs: 'none', md: 'block' } }}>Buscar</Box>
              <Box
                component="kbd"
                sx={{
                  display:     { xs: 'none', md: 'block' },
                  fontSize:    '0.6875rem',
                  bgcolor:     'grey.100',
                  borderRadius: '4px',
                  px:          0.75,
                  py:          0.25,
                  fontFamily:  'monospace',
                }}
              >
                ⌘K
              </Box>
            </Box>

            {/* Profile */}
            <ProfileDropdown user={user ?? null} />
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box
          component="main"
          sx={{ flex: 1, overflowY: 'auto', bgcolor: 'grey.50' }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
