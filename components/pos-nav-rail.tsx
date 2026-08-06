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
import { RailBrand } from '@/components/rail-brand';
import { RailModulos } from '@/components/rail-modulos';
import { useNavFijo } from '@/lib/hooks/useNavFijo';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Store, Clock, Wallet, Undo2, Users, Package, Settings, FileText, } from 'lucide-react';

const RAIL = 68;
const OPEN = 224;

type Item = { href: string; label: string; icon: typeof Store; shared?: boolean };

// Navegación del módulo POS. Todo vive bajo /pos (shell del POS) para no saltar
// a Facturación. Contactos e Inventario son entidades COMPARTIDAS (mismas tablas).
const ITEMS: Item[] = [
  { href: '/pos',              label: 'Vender',              icon: Store },
  { href: '/pos/turnos',       label: 'Turnos',              icon: Clock },
  { href: '/pos/caja',         label: 'Gestión de efectivo', icon: Wallet },
  { href: '/pos/devoluciones', label: 'Devoluciones',        icon: Undo2 },
  { href: '/pos/contactos',    label: 'Contactos',           icon: Users,   shared: true },
  { href: '/pos/inventario',   label: 'Inventario',          icon: Package, shared: true },
  { href: '/pos/configuracion', label: 'Configuración',      icon: Settings },
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
  const pathname = usePathname();
  // El cajón móvil va siempre abierto; en escritorio manda la preferencia
  // "menú fijo". Ambos casos usan la misma rama: ancho completo, texto visible
  // y sin expansión por hover.
  const { fijo } = useNavFijo();
  const abierto = variant === 'drawer' || fijo;

  return (
    <Box
      component="aside"
      sx={{
        width: abierto ? OPEN : RAIL,
        flexShrink: 0,
        display: abierto ? 'block' : { xs: 'none', lg: 'block' },
        position: 'relative',
        height: '100%',
      }}
    >
      <Box
        sx={{
          position: abierto ? 'static' : 'absolute', top: 0, left: 0, height: '100%',
          width: abierto ? OPEN : RAIL, overflow: 'hidden', zIndex: 40,
          bgcolor: '#2a45c4', display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s ease, box-shadow 0.2s ease',
          '& .nav-text': {
            opacity: abierto ? 1 : 0,
            transition: 'opacity 0.12s ease',
            whiteSpace: 'nowrap',
          },
          ...(abierto ? {} : {
            '&:hover': { width: OPEN, boxShadow: '6px 0 28px rgba(0,0,0,0.22)' },
            '&:hover .nav-text': { opacity: 1 },
          }),
        }}
      >
        <RailBrand modulo="pos" />

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
                  color: active ? '#fff' : 'rgba(224,231,253,0.85)',
                  bgcolor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
                }}
              >
                <it.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <Box component="span" className="nav-text" sx={{ flex: 1 }}>{it.label}</Box>
                {it.shared && (
                  <Box component="span" className="nav-text" sx={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', px: 0.625, py: '1px', borderRadius: '4px', bgcolor: 'rgba(255,255,255,0.16)', color: 'rgba(224,231,253,0.95)' }}>
                    Compartido
                  </Box>
                )}
              </Box>
            );
          })}

          {/* Al final de la lista de items, no anclado al pie. */}
          <RailModulos current="pos" />
        </Box>
      </Box>
    </Box>
  );
}
