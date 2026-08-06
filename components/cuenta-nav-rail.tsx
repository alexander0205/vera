'use client';

/**
 * CuentaNavRail — navegación del área de Administración del negocio.
 *
 * Tercer espacio del producto, junto a Facturación y Punto de Venta: todo lo
 * que es "administrar MI negocio" (perfil de la empresa, usuarios, roles y
 * plan) vive aquí, centrado en la empresa activa. Mismo patrón de rail que los
 * otros módulos: solo-iconos, se expande al pasar el mouse.
 *
 * NO es un módulo facturable (no está en teams.modulosHabilitados): toda
 * empresa necesita administrarse. El acceso se limita por ROL.
 */

import Box from '@mui/material/Box';
import { RailBrand } from '@/components/rail-brand';
import { RailModulos } from '@/components/rail-modulos';
import { useNavFijo } from '@/lib/hooks/useNavFijo';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Users, ShieldCheck, CreditCard, Layers } from 'lucide-react';
import { BILLING_ENABLED } from '@/lib/config/billing';

const RAIL = 68;
const OPEN = 224;

type Item = { href: string; label: string; icon: typeof Users };

const ITEMS: Item[] = [
  { href: '/cuenta/empresa',  label: 'Mi empresa',       icon: Building2 },
  { href: '/cuenta/usuarios', label: 'Usuarios',         icon: Users },
  { href: '/cuenta/roles',    label: 'Roles y permisos', icon: ShieldCheck },
  // Plan y facturación solo cuando el billing está activo (lib/config/billing).
  ...(BILLING_ENABLED ? [{ href: '/cuenta/plan', label: 'Plan y facturación', icon: CreditCard }] : []),
  { href: '/cuenta/empresas', label: 'Mis empresas',     icon: Layers },
];

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: contenido del cajón móvil.
 */
export function CuentaNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
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
          bgcolor: '#0f766e', display: 'flex', flexDirection: 'column',
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
        <RailBrand modulo="administracion" />

        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {ITEMS.map(it => {
            const active = pathname.startsWith(it.href);
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
              </Box>
            );
          })}

          {/* Al final de la lista de items, no anclado al pie. */}
          <RailModulos current="administracion" />
        </Box>
      </Box>
    </Box>
  );
}
