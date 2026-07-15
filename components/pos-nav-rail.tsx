'use client';

/**
 * PosNavRail — navegación propia del módulo Punto de Venta.
 *
 * Es una navegación distinta a la de Facturación (esa vive en el dashboard
 * layout). Rail de solo-iconos que se expande al pasar el mouse, igual patrón
 * que el sidebar del dashboard: colapsado 68px, hover → 224px flotando sobre
 * el contenido, labels con .nav-text. CSS-only, animado, sin re-render.
 *
 * Items: Vender (POS), Terminales, y las entidades COMPARTIDas (Productos y
 * Contactos — mismas tablas que Facturación). Abajo, volver a Facturación.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Store, MonitorSmartphone, Package, Users, FileText, LayoutGrid,
} from 'lucide-react';
import { moduleUrl } from '@/lib/config/modules';

const RAIL = 68;
const OPEN = 224;

type Item = { href: string; label: string; icon: typeof Store; shared?: boolean };

const ITEMS: Item[] = [
  { href: '/pos',                      label: 'Vender',            icon: Store },
  { href: '/dashboard/pos-terminales', label: 'Terminales',        icon: MonitorSmartphone },
  { href: '/dashboard/productos',      label: 'Productos',         icon: Package, shared: true },
  { href: '/dashboard/clientes',       label: 'Contactos',         icon: Users,   shared: true },
];

export function PosNavRail() {
  const pathname = usePathname();

  return (
    <Box component="aside" sx={{ width: RAIL, flexShrink: 0, display: { xs: 'none', md: 'block' }, position: 'relative' }}>
      <Box
        sx={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: RAIL, overflow: 'hidden', zIndex: 40,
          bgcolor: '#0f766e', display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s ease, box-shadow 0.2s ease',
          '& .nav-text': { opacity: 0, transition: 'opacity 0.12s ease', whiteSpace: 'nowrap' },
          '&:hover': { width: OPEN, boxShadow: '6px 0 28px rgba(0,0,0,0.22)' },
          '&:hover .nav-text': { opacity: 1 },
        }}
      >
        {/* Logo */}
        <Box sx={{ px: 2, py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 28, height: 28, bgcolor: '#fff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store style={{ width: 16, height: 16, color: '#0f766e' }} />
          </Box>
          {/* Identidad del producto: "Zero Punto de Venta" (como Alegra POS). */}
          <Box className="nav-text" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>Zero</Typography>
            <Typography sx={{ color: 'rgba(204,251,241,0.85)', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Punto de Venta</Typography>
          </Box>
        </Box>

        {/* Items */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {ITEMS.map(it => {
            const active = it.href === '/pos' ? pathname === '/pos' : pathname.startsWith(it.href);
            return (
              <Box
                key={it.href}
                component={Link}
                href={it.href}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
                  borderRadius: '8px', fontSize: '0.875rem', textDecoration: 'none',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#fff' : 'rgba(204,251,241,0.85)',
                  bgcolor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
                }}
              >
                <it.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <Box component="span" className="nav-text" sx={{ flex: 1 }}>{it.label}</Box>
                {it.shared && (
                  <Box component="span" className="nav-text" sx={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', px: 0.625, py: '1px', borderRadius: '4px', bgcolor: 'rgba(255,255,255,0.16)', color: 'rgba(204,251,241,0.95)' }}>
                    Compartido
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Cambiar a Facturación */}
        <Box sx={{ px: 1.5, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Box
            component={Link}
            href={moduleUrl('facturacion')}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
              borderRadius: '8px', fontSize: '0.875rem', textDecoration: 'none',
              color: 'rgba(204,251,241,0.85)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
            }}
          >
            <LayoutGrid style={{ width: 18, height: 18, flexShrink: 0 }} />
            <Box component="span" className="nav-text" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <FileText style={{ width: 14, height: 14 }} /> Ir a Facturación
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
