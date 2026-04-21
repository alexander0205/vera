'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Package,
  Settings, Activity, Shield, Menu, Plus, ChevronDown, ChevronRight,
  TrendingDown, BarChart3, CreditCard, Building2, Check, LogOut,
  Printer, X, ChevronUp, Search, UserCircle, AlertCircle, Zap,
} from 'lucide-react';
import { GlobalSearch } from '@/components/global-search';
import { planHasFeature } from '@/lib/plans';

// ─── Types ────────────────────────────────────────────────────────────────────

type NavGroup = {
  id: string;
  label: string;
  icon: React.ElementType;
  children: { href: string; label: string; plusHref?: string }[];
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
      { href: '/dashboard/notas-credito',        label: 'Notas de crédito' },
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
      { href: '/dashboard/categorias',     label: 'Categorías' },
      { href: '/dashboard/almacenes',      label: 'Almacenes' },
      { href: '/dashboard/listas-precios', label: 'Listas de precios' },
      { href: '/dashboard/vendedores',     label: 'Vendedores' },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    children: [
      { href: '/dashboard/configuracion', label: 'Mi empresa' },
      { href: '/dashboard/secuencias',    label: 'Secuencias NCF' },
      { href: '/dashboard/certificado',   label: 'Certificado P12' },
      { href: '/dashboard/equipo',        label: 'Usuarios y equipo' },
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

interface Team     { id: number; razonSocial: string | null; rnc: string | null; planName: string | null; subscriptionStatus: string | null; role: string; logo: string | null; }
interface UserInfo { name: string | null; email: string; }

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

// ─── Company switcher (top bar, light theme) ──────────────────────────────────

// ─── Helpers visuales para empresas ──────────────────────────────────────────

function CompanyAvatar({ team, size = 'sm' }: { team: Team; size?: 'sm' | 'md' }) {
  const dim  = size === 'md' ? 'h-7 w-7' : 'h-6 w-6';
  const text = size === 'md' ? 'text-xs'  : 'text-[11px]';
  const label = (team.razonSocial ?? team.rnc ?? 'E')[0]?.toUpperCase() ?? 'E';

  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt={team.razonSocial ?? 'Logo'}
        className={`${dim} rounded-md object-cover shrink-0`}
      />
    );
  }
  return (
    <div className={`${dim} rounded-md bg-teal-600 flex items-center justify-center shrink-0`}>
      <span className={`text-white font-bold ${text}`}>{label}</span>
    </div>
  );
}

function planBadgeStyle(planName: string | null) {
  const p = planName?.toLowerCase();
  if (!p) return null;
  if (p === 'pro')      return 'bg-purple-50 text-purple-700 border-purple-200';
  if (p === 'business') return 'bg-teal-50 text-teal-700 border-teal-100';
  if (p === 'invoice')  return 'bg-orange-50 text-orange-700 border-orange-200';
  if (p === 'starter')  return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

// ─── Plan helpers ─────────────────────────────────────────────────────────────

function teamHasPlan(t: Team) {
  const name = t.planName?.toLowerCase();
  if (!name || name === 'gratis') return false;
  const s = t.subscriptionStatus?.toLowerCase();
  if (s === 'canceled' || s === 'unpaid') return false;
  return true;
}

// ─── Company switcher ─────────────────────────────────────────────────────────

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
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => { setOpen(false); setSearch(''); });

  const active   = teams.find(t => t.id === activeTeamId) ?? teams[0];
  const filtered = teams.filter(t =>
    !search ||
    t.razonSocial?.toLowerCase().includes(search.toLowerCase()) ||
    t.rnc?.includes(search)
  );

  async function switchTeam(teamId: number) {
    if (teamId === activeTeamId) { setOpen(false); setSearch(''); return; }
    setOpen(false);
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
      // Siempre ir al inicio y refrescar data del servidor al cambiar de empresa
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-colors max-w-xs"
      >
        <CompanyAvatar team={active ?? { id: 0, razonSocial: null, rnc: null, planName: null, role: '', logo: null }} size="sm" />
        <span className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">
          {active?.razonSocial ?? active?.rnc ?? 'Mi empresa'}
        </span>
        {active && teamHasPlan(active) && planBadgeStyle(active.planName) && (
          <span className={`hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${planBadgeStyle(active.planName)}`}>
            {active.planName}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-xl border-2 border-gray-200 z-50 overflow-hidden">
          {/* Search */}
          {teams.length > 3 && (
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
                />
              </div>
            </div>
          )}

          {/* Lista */}
          <div className="py-1 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</p>
            ) : filtered.map(t => {
              const hasPlan = teamHasPlan(t);
              const isActive = t.id === activeTeamId;
              return (
                <button
                  key={t.id}
                  onClick={() => switchTeam(t.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <CompanyAvatar team={t} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.razonSocial ?? t.rnc ?? 'Sin nombre'}
                    </p>
                    {t.rnc && <p className="text-xs text-gray-400 mt-0.5">RNC {t.rnc}</p>}
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 text-teal-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 p-1.5 flex gap-1">
            <Link
              href="/dashboard/empresas"
              onClick={() => { setOpen(false); setSearch(''); }}
              className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 text-xs text-gray-600 font-medium transition-colors"
            >
              <Building2 className="h-3.5 w-3.5" />
              Gestionar empresas
            </Link>
            <Link
              href="/dashboard/empresas"
              onClick={() => { setOpen(false); setSearch(''); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-teal-50 text-xs text-teal-700 font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile dropdown (top bar) ───────────────────────────────────────────────

function ProfileDropdown({
  user,
  canSeeActivity,
}: {
  user: UserInfo | null;
  canSeeActivity: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false));

  async function handleSignOut() {
    setOpen(false);
    await fetch('/api/user', { method: 'DELETE' });
    router.push('/sign-in');
    router.refresh();
  }

  const menuItems = [
    { href: '/dashboard/perfil',      icon: UserCircle, label: 'Mi perfil' },
    { href: '/dashboard/suscripcion', icon: CreditCard, label: 'Suscripción' },
    ...(canSeeActivity ? [{ href: '/dashboard/activity', icon: Activity, label: 'Actividad' }] : []),
    { href: '/dashboard/security',    icon: Shield,     label: 'Seguridad' },
    { href: '/dashboard/empresas',    icon: Building2,  label: 'Mis empresas' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-semibold">
            {user ? getInitials(user.name, user.email) : '?'}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name ?? user?.email}</p>
            {user?.name && <p className="text-xs text-gray-400 truncate">{user.email}</p>}
          </div>

          {/* Items */}
          <div className="py-1">
            {menuItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <item.icon className="h-4 w-4 text-gray-400" />
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-100 py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function DashboardTopBar({
  teams,
  activeTeamId,
  user,
  plan,
  onMenuClick,
  onSwitch,
}: {
  teams: Team[];
  activeTeamId: number | null;
  user: UserInfo | null;
  plan: string | null;
  onMenuClick: () => void;
  onSwitch: (teamId: number) => void;
}) {
  const canSeeActivity = planHasFeature(plan, 'actividad');

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center gap-3 px-4 shrink-0 z-30">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-gray-500 hover:text-gray-700 -ml-1"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo — mobile only (sidebar has logo on desktop) */}
      <div className="lg:hidden flex items-center gap-2 mr-1">
        <div className="h-6 w-6 bg-teal-600 rounded-md flex items-center justify-center shrink-0">
          <span className="text-white font-black text-xs">e</span>
        </div>
        <span className="text-gray-900 font-bold text-sm">EmiteDO</span>
      </div>

      {/* Company switcher */}
      <CompanySwitcher teams={teams} activeTeamId={activeTeamId} onSwitch={onSwitch} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search trigger */}
      <button
        onClick={() => document.querySelector<HTMLButtonElement>('#global-search-trigger')?.click()}
        className="hidden sm:flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Buscar</span>
        <kbd className="hidden md:inline text-xs bg-gray-100 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
      </button>

      {/* Profile */}
      <ProfileDropdown user={user} canSeeActivity={canSeeActivity} />
    </header>
  );
}

// ─── Sidebar (nav only) ───────────────────────────────────────────────────────

function Sidebar({
  teams,
  activeTeamId,
  onClose,
}: {
  teams: Team[];
  activeTeamId: number | null;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  const activeTeam = teams.find(t => t.id === activeTeamId) ?? teams[0];
  const plan       = activeTeam?.planName;
  const hasPlan    = activeTeam ? teamHasPlan(activeTeam) : false;

  // Determina si un item concreto está habilitado según el plan
  function isEnabled(href: string): boolean {
    if (!hasPlan) return false;
    if (href.includes('cotizaciones'))         return planHasFeature(plan, 'cotizaciones');
    if (href.includes('facturas-recurrentes')) return planHasFeature(plan, 'facturas-recurrentes');
    if (href.includes('productos'))            return planHasFeature(plan, 'productos');
    if (href.includes('categorias') || href.includes('almacenes') ||
        href.includes('listas-precios') || href.includes('vendedores'))
                                               return planHasFeature(plan, 'inventario-avanzado');
    if (href.includes('reportes'))             return planHasFeature(plan, 'reportes');
    if (href.includes('clientes'))             return planHasFeature(plan, 'clientes');
    if (href.includes('api-keys'))             return planHasFeature(plan, 'api-keys');
    if (href.includes('webhooks'))             return planHasFeature(plan, 'webhooks');
    if (href.includes('impresoras'))           return planHasFeature(plan, 'impresoras');
    return true;
  }

  const defaultOpen = GROUPS.reduce((acc, g) => {
    acc[g.id] = g.children.some(c => pathname.startsWith(c.href));
    return acc;
  }, {} as Record<string, boolean>);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpen);

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-teal-700">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-teal-600/50">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-white rounded-lg flex items-center justify-center shrink-0">
            <span className="text-teal-700 font-black text-xs">e</span>
          </div>
          <span className="text-white font-bold text-sm tracking-wide">EmiteDO</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

        {/* Sin plan — bloquear nav */}
        {!hasPlan && (
          <div className="mx-1 mt-1 mb-3 rounded-xl bg-amber-500/20 border border-amber-400/30 px-4 py-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-100 leading-snug">
                Esta empresa no tiene un plan activo. Activa un plan para acceder a todas las funciones.
              </p>
            </div>
            <Link
              href="/pricing?reason=no-plan"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-amber-900 text-xs font-semibold transition-colors"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Activar plan
            </Link>
            <Link
              href="/dashboard/empresas"
              onClick={onClose}
              className="text-center text-xs text-teal-300 hover:text-white transition-colors"
            >
              Cambiar empresa
            </Link>
          </div>
        )}

        {/* Nueva Factura */}
        <Link
          href="/dashboard/facturas/nueva"
          onClick={hasPlan ? onClose : e => e.preventDefault()}
          className={`flex items-center gap-2.5 w-full px-3 py-2 mb-2 rounded-lg bg-white/15 text-white text-sm font-medium transition-colors ${
            hasPlan ? 'hover:bg-white/25' : 'opacity-40 cursor-not-allowed'
          }`}
        >
          <Plus className="h-4 w-4 shrink-0" />
          Nueva Factura
        </Link>

        {/* Search trigger */}
        <button
          onClick={() => { onClose?.(); document.querySelector<HTMLButtonElement>('#global-search-trigger')?.click(); }}
          className="flex items-center gap-2.5 w-full px-3 py-2 mb-1 rounded-lg text-teal-200 hover:bg-white/10 hover:text-white text-sm transition-colors"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="text-xs bg-white/10 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
        </button>

        {/* Activar facturación electrónica */}
        <Link
          href="/dashboard/habilitacion"
          onClick={onClose}
          className="flex items-center gap-2.5 w-full px-3 py-2 mb-2 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 hover:text-amber-100 text-sm transition-colors"
        >
          <Zap className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="flex-1 text-left text-xs font-semibold">Activar facturación e-CF</span>
        </Link>

        {/* Top items — todos visibles, disabled según plan */}
        {TOP_ITEMS.map(item => {
          const enabled = isEnabled(item.href);
          const active  = enabled && isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={enabled ? onClose : e => e.preventDefault()}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                !enabled
                  ? 'text-teal-100/40 cursor-not-allowed'
                  : active
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-teal-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="my-1 border-t border-teal-600/40" />

        {/* Grupos — todos visibles, cada child disabled según plan */}
        {GROUPS.map(group => {
          const groupActive = group.children.some(c => pathname.startsWith(c.href));
          const isOpen      = openGroups[group.id] ?? false;
          return (
            <div key={group.id}>
              <button
                onClick={() => toggleGroup(group.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  groupActive ? 'text-white font-medium' : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <group.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {isOpen
                  ? <ChevronUp className="h-3.5 w-3.5 opacity-70" />
                  : <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                }
              </button>

              {isOpen && (
                <div className="ml-6 pl-2 border-l border-teal-500/40 mt-0.5 mb-1 space-y-0.5">
                  {group.children.map(child => {
                    const enabled = isEnabled(child.href);
                    const active  = enabled && pathname.startsWith(child.href);
                    return (
                      <div key={child.href} className="flex items-center group/sub">
                        <Link
                          href={child.href}
                          onClick={enabled ? onClose : e => e.preventDefault()}
                          className={`flex-1 py-1.5 px-2.5 text-sm rounded-lg truncate transition-colors ${
                            !enabled
                              ? 'text-teal-200/40 cursor-not-allowed'
                              : active
                                ? 'text-white font-medium bg-white/15'
                                : 'text-teal-200 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {child.label}
                        </Link>
                        {child.plusHref && enabled && (
                          <Link
                            href={child.plusHref}
                            onClick={onClose}
                            title="Nuevo"
                            className="opacity-0 group-hover/sub:opacity-100 p-1 rounded hover:bg-white/20 text-teal-300 hover:text-white transition-all ml-1"
                          >
                            <Plus className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [teams, setTeams]               = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const [user, setUser]                 = useState<UserInfo | null>(null);

  async function fetchData() {
    const [userData, empresaData] = await Promise.all([
      fetch('/api/user').then(r => r.json()).catch(() => null),
      fetch('/api/empresa/list').then(r => r.json()).catch(() => null),
    ]);
    if (userData) setUser(userData);
    if (empresaData?.teams) {
      setTeams(empresaData.teams);
      setActiveTeamId(empresaData.activeTeamId ?? empresaData.teams[0]?.id ?? null);
    }
  }

  // Carga inicial
  useEffect(() => { fetchData(); }, []);

  // Re-fetch al cambiar de ruta — cubre el retorno desde Stripe/portal
  // y cualquier cambio de plan que haya ocurrido mientras el usuario estaba fuera.
  useEffect(() => { fetchData(); }, [pathname]);

  // Re-fetch cuando el usuario vuelve a la pestaña (tab visible de nuevo)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') fetchData();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Cuando el usuario cambia de empresa: actualizar activeTeamId optimistamente
  // y re-fetch para traer el plan/logo del team nuevo de inmediato.
  function handleSwitch(teamId: number) {
    setActiveTeamId(teamId);
    fetchData();
  }

  const plan = (teams.find(t => t.id === activeTeamId) ?? teams[0])?.planName ?? null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <GlobalSearch />

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-56 flex-col shrink-0">
        <Sidebar teams={teams} activeTeamId={activeTeamId} />
      </aside>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-56 flex flex-col">
            <Sidebar teams={teams} activeTeamId={activeTeamId} onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar
          teams={teams}
          activeTeamId={activeTeamId}
          user={user}
          plan={plan}
          onMenuClick={() => setSidebarOpen(true)}
          onSwitch={handleSwitch}
        />

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
