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
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Users, ShieldCheck, CreditCard, Layers, LayoutGrid } from 'lucide-react';
import { moduleUrl } from '@/lib/config/modules';

const RAIL = 68;
const OPEN = 224;

type Item = { href: string; label: string; icon: typeof Users };

const ITEMS: Item[] = [
  { href: '/cuenta/empresa',  label: 'Mi empresa',       icon: Building2 },
  { href: '/cuenta/usuarios', label: 'Usuarios',         icon: Users },
  { href: '/cuenta/roles',    label: 'Roles y permisos', icon: ShieldCheck },
  { href: '/cuenta/plan',     label: 'Plan y facturación', icon: CreditCard },
  { href: '/cuenta/empresas', label: 'Mis empresas',     icon: Layers },
];

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: contenido del cajón móvil.
 */
export function CuentaNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
  const pathname = usePathname();
  const abierto = variant === 'drawer';

  return (
    <Box
      component="aside"
      sx={{
        width: abierto ? OPEN : RAIL,
        flexShrink: 0,
        display: abierto ? 'block' : { xs: 'none', md: 'block' },
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
        {/* Identidad del área */}
        <Box sx={{ px: 2, py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 28, height: 28, bgcolor: '#fff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 style={{ width: 16, height: 16, color: '#0f766e' }} />
          </Box>
          <Box className="nav-text" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>Zero</Typography>
            <Typography sx={{ color: 'rgba(204,251,241,0.85)', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Administración</Typography>
          </Box>
        </Box>

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
        </Box>

        {/* Volver al trabajo diario */}
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
            <Box component="span" className="nav-text">Ir a Facturación</Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
