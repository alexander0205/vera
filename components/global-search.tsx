'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search, FileText, Users, Package, Hash, Plus, LayoutDashboard,
  Settings, BarChart3, CreditCard, Shield, Activity, X,
} from 'lucide-react';

const STATIC_ITEMS = [
  { group: 'Páginas', label: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
  { group: 'Páginas', label: 'Contactos', href: '/dashboard/clientes', icon: Users },
  { group: 'Páginas', label: 'Facturas', href: '/dashboard/facturas', icon: FileText },
  { group: 'Páginas', label: 'Productos', href: '/dashboard/productos', icon: Package },
  { group: 'Páginas', label: 'Secuencias NCF', href: '/dashboard/secuencias', icon: Hash },
  { group: 'Páginas', label: 'Reportes DGII', href: '/dashboard/reportes', icon: BarChart3 },
  { group: 'Páginas', label: 'Configuración', href: '/dashboard/configuracion', icon: Settings },
  { group: 'Páginas', label: 'Suscripción', href: '/dashboard/suscripcion', icon: CreditCard },
  { group: 'Páginas', label: 'Seguridad', href: '/dashboard/security', icon: Shield },
  { group: 'Páginas', label: 'Actividad', href: '/dashboard/activity', icon: Activity },
  { group: 'Acciones', label: 'Nueva factura', href: '/dashboard/facturas/nueva', icon: Plus },
  { group: 'Acciones', label: 'Nuevo cliente', href: '/dashboard/clientes', icon: Plus },
  { group: 'Acciones', label: 'Nuevo producto', href: '/dashboard/productos', icon: Plus },
];

interface SearchResult {
  id: number;
  label: string;
  sublabel: string;
  href: string;
  type: 'factura' | 'cliente' | 'producto';
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Cmd+K or Ctrl+K to open
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Search on query change
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [facturas, clientes, productos] = await Promise.all([
          fetch(`/api/facturas?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()),
          fetch(`/api/clientes?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()),
          fetch(`/api/productos?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()),
        ]);
        const items: SearchResult[] = [
          ...(facturas.docs ?? facturas ?? []).map((f: any) => ({
            id: f.id, type: 'factura' as const,
            label: f.encf,
            sublabel: f.razonSocialComprador ?? 'Sin cliente',
            href: `/dashboard/facturas/${f.id}`,
          })),
          ...(Array.isArray(clientes) ? clientes : clientes.items ?? []).map((c: any) => ({
            id: c.id, type: 'cliente' as const,
            label: c.razonSocial,
            sublabel: c.rnc ? `RNC ${c.rnc}` : c.email ?? '',
            href: `/dashboard/clientes`,
          })),
          ...(Array.isArray(productos) ? productos : productos.items ?? []).map((p: any) => ({
            id: p.id, type: 'producto' as const,
            label: p.nombre,
            sublabel: `DOP ${(p.precio / 100).toLocaleString('es-DO')}`,
            href: `/dashboard/productos`,
          })),
        ];
        setResults(items);
      } catch {}
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function navigate(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  const TYPE_ICON = { factura: FileText, cliente: Users, producto: Package };
  const TYPE_LABEL = { factura: 'Factura', cliente: 'Cliente', producto: 'Producto' };

  return (
    <>
      {/* Hidden trigger button — clicked by sidebar search button */}
      <button
        id="global-search-trigger"
        onClick={() => setOpen(true)}
        className="hidden"
        aria-label="Búsqueda global"
      />

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
            <Command className="w-full" shouldFilter={false}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Buscar facturas, clientes, productos..."
                  className="flex-1 text-sm outline-none placeholder-gray-400 text-gray-900 bg-transparent"
                  autoFocus
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <kbd className="hidden sm:inline-flex items-center gap-0.5 text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-80 overflow-y-auto p-2">
                {loading && (
                  <Command.Empty className="py-6 text-center text-sm text-gray-400">Buscando...</Command.Empty>
                )}

                {!loading && query.length >= 2 && results.length === 0 && (
                  <Command.Empty className="py-6 text-center text-sm text-gray-400">
                    Sin resultados para &ldquo;{query}&rdquo;
                  </Command.Empty>
                )}

                {results.length > 0 && (
                  <Command.Group heading={<span className="text-xs text-gray-400 uppercase tracking-wide px-2">Resultados</span>}>
                    {results.map(r => {
                      const Icon = TYPE_ICON[r.type];
                      return (
                        <Command.Item
                          key={`${r.type}-${r.id}`}
                          value={`${r.type}-${r.id}`}
                          onSelect={() => navigate(r.href)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-50 data-[selected]:bg-teal-50"
                        >
                          <div className="h-7 w-7 rounded-md bg-teal-100 flex items-center justify-center shrink-0">
                            <Icon className="h-3.5 w-3.5 text-teal-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                            <p className="text-xs text-gray-400 truncate">{r.sublabel}</p>
                          </div>
                          <span className="text-xs text-gray-300">{TYPE_LABEL[r.type]}</span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {(!query || query.length < 2) && (
                  <>
                    <Command.Group heading={<span className="text-xs text-gray-400 uppercase tracking-wide px-2">Páginas</span>}>
                      {STATIC_ITEMS.filter(i => i.group === 'Páginas').map(item => (
                        <Command.Item
                          key={item.href + item.label}
                          value={item.label}
                          onSelect={() => navigate(item.href)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 data-[selected]:bg-teal-50"
                        >
                          <item.icon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{item.label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                    <Command.Group heading={<span className="text-xs text-gray-400 uppercase tracking-wide px-2">Acciones rápidas</span>}>
                      {STATIC_ITEMS.filter(i => i.group === 'Acciones').map(item => (
                        <Command.Item
                          key={item.label}
                          value={item.label}
                          onSelect={() => navigate(item.href)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 data-[selected]:bg-teal-50"
                        >
                          <item.icon className="h-4 w-4 text-teal-500" />
                          <span className="text-sm text-gray-700">{item.label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                )}
              </Command.List>

              <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
                <span><kbd className="bg-gray-100 rounded px-1 py-0.5">↑↓</kbd> navegar</span>
                <span><kbd className="bg-gray-100 rounded px-1 py-0.5">↵</kbd> abrir</span>
                <span><kbd className="bg-gray-100 rounded px-1 py-0.5">Esc</kbd> cerrar</span>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
