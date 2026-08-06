'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { Command } from 'cmdk';
import {
  Search, FileText, Users, Package, Hash, Plus, LayoutDashboard,
  Settings, BarChart3, CreditCard, Shield, Activity, X,
} from 'lucide-react';

// MUI imports
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

const STATIC_ITEMS = [
  { group: 'Páginas', label: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
  { group: 'Páginas', label: 'Contactos', href: '/dashboard/clientes', icon: Users },
  { group: 'Páginas', label: 'Facturas', href: '/dashboard/facturas', icon: FileText },
  { group: 'Páginas', label: 'Productos', href: '/dashboard/productos', icon: Package },
  { group: 'Páginas', label: 'Secuencias NCF', href: '/dashboard/secuencias', icon: Hash },
  { group: 'Páginas', label: 'Reportes DGII', href: '/dashboard/reportes', icon: BarChart3 },
  { group: 'Páginas', label: 'Configuración', href: '/dashboard/configuracion', icon: Settings },
  // Suscripción solo con billing activo (lib/config/billing).
  ...(BILLING_ENABLED ? [{ group: 'Páginas', label: 'Suscripción', href: '/dashboard/suscripcion', icon: CreditCard }] : []),
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

// Estilos de los primitivos de cmdk (input/list/empty/item) — cmdk expone
// atributos `[cmdk-*]` para estilizar sus nodos internos. El item seleccionado
// por teclado lleva `data-selected="true"`.
const cmdkSx = {
  width: '100%',
  '& [cmdk-root]': { width: '100%' },
  '& [cmdk-input]': {
    flex: 1,
    fontSize: '0.875rem',
    outline: 'none',
    border: 'none',
    p: 0,
    m: 0,
    color: '#111827',
    bgcolor: 'transparent',
  },
  '& [cmdk-input]::placeholder': { color: '#9ca3af' },
  '& [cmdk-list]': { maxHeight: 320, overflowY: 'auto', p: 1 },
  '& [cmdk-empty]': { py: 3, textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af' },
  '& [cmdk-item]': {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    borderRadius: '8px',
    cursor: 'pointer',
  },
  '& [cmdk-item]:hover': { bgcolor: '#f9fafb' },
  '& [cmdk-item][data-selected="true"]': { bgcolor: '#eef2fe' },
} as const;

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
      <Box
        component="button"
        id="global-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Búsqueda global"
        sx={{ display: 'none' }}
      />

      {/* Modal */}
      {open && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            pt: '10vh',
            px: 2,
          }}
        >
          <Box
            onClick={() => setOpen(false)}
            sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.4)' }}
          />
          <Paper
            elevation={0}
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: 512,
              bgcolor: '#ffffff',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid #e5e7eb',
              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            }}
          >
            <Box sx={cmdkSx}>
              <Command shouldFilter={false}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <Search style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
                  <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Buscar facturas, clientes, productos..."
                    autoFocus
                  />
                  {query && (
                    <IconButton
                      onClick={() => setQuery('')}
                      sx={{ p: 0.25, color: '#9ca3af', '&:hover': { color: '#4b5563', bgcolor: 'transparent' } }}
                    >
                      <X style={{ width: 16, height: 16 }} />
                    </IconButton>
                  )}
                  <Box
                    component="kbd"
                    sx={{
                      display: { xs: 'none', sm: 'inline-flex' },
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      bgcolor: '#f3f4f6',
                      borderRadius: '4px',
                      px: 0.75,
                      py: 0.25,
                    }}
                  >
                    ESC
                  </Box>
                </Box>

                <Command.List>
                  {loading && (
                    <Command.Empty>Buscando...</Command.Empty>
                  )}

                  {!loading && query.length >= 2 && results.length === 0 && (
                    <Command.Empty>
                      Sin resultados para &ldquo;{query}&rdquo;
                    </Command.Empty>
                  )}

                  {results.length > 0 && (
                    <Command.Group heading={<Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.025em', px: 1 }}>Resultados</Box>}>
                      {results.map(r => {
                        const Icon = TYPE_ICON[r.type];
                        return (
                          <Command.Item
                            key={`${r.type}-${r.id}`}
                            value={`${r.type}-${r.id}`}
                            onSelect={() => navigate(r.href)}
                            style={{ padding: '10px 12px' }}
                          >
                            <Box sx={{ height: 28, width: 28, borderRadius: '6px', bgcolor: '#e0e7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon style={{ width: 14, height: 14, color: '#3658e1' }} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{r.label}</Typography>
                              <Typography noWrap sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{r.sublabel}</Typography>
                            </Box>
                            <Typography component="span" sx={{ fontSize: '0.75rem', color: '#d1d5db' }}>{TYPE_LABEL[r.type]}</Typography>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  )}

                  {(!query || query.length < 2) && (
                    <>
                      <Command.Group heading={<Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.025em', px: 1 }}>Páginas</Box>}>
                        {STATIC_ITEMS.filter(i => i.group === 'Páginas').map(item => (
                          <Command.Item
                            key={item.href + item.label}
                            value={item.label}
                            onSelect={() => navigate(item.href)}
                            style={{ padding: '8px 12px' }}
                          >
                            <item.icon style={{ width: 16, height: 16, color: '#9ca3af' }} />
                            <Typography component="span" sx={{ fontSize: '0.875rem', color: '#374151' }}>{item.label}</Typography>
                          </Command.Item>
                        ))}
                      </Command.Group>
                      <Command.Group heading={<Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.025em', px: 1 }}>Acciones rápidas</Box>}>
                        {STATIC_ITEMS.filter(i => i.group === 'Acciones').map(item => (
                          <Command.Item
                            key={item.label}
                            value={item.label}
                            onSelect={() => navigate(item.href)}
                            style={{ padding: '8px 12px' }}
                          >
                            <item.icon style={{ width: 16, height: 16, color: '#5b73ec' }} />
                            <Typography component="span" sx={{ fontSize: '0.875rem', color: '#374151' }}>{item.label}</Typography>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    </>
                  )}
                </Command.List>

                <Box
                  sx={{
                    borderTop: '1px solid #f3f4f6',
                    px: 2,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                  }}
                >
                  <Box component="span"><Box component="kbd" sx={{ bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.5, py: 0.25 }}>↑↓</Box> navegar</Box>
                  <Box component="span"><Box component="kbd" sx={{ bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.5, py: 0.25 }}>↵</Box> abrir</Box>
                  <Box component="span"><Box component="kbd" sx={{ bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.5, py: 0.25 }}>Esc</Box> cerrar</Box>
                </Box>
              </Command>
            </Box>
          </Paper>
        </Box>
      )}
    </>
  );
}
