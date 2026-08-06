'use client';

/**
 * EscolarNavRail — navegación del módulo Administración Escolar.
 *
 * Mismo patrón que los otros módulos (solo-iconos, se expande al pasar el
 * mouse). El colegio se administra sin salir de aquí: al final está el salto
 * a Facturación, que es donde se cobra (los cargos se saldan con facturas).
 */

import Box from '@mui/material/Box';
import { RailBrand } from '@/components/rail-brand';
import { RailModulos } from '@/components/rail-modulos';
import { useNavFijo } from '@/lib/hooks/useNavFijo';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GraduationCap, Users, ClipboardList, Receipt, Wallet, Settings, FileText, DownloadCloud, Contact, ClipboardCheck,
} from 'lucide-react';

const RAIL = 68;
const OPEN = 224;

type Item = { href: string; label: string; icon: typeof Users };

const ITEMS: Item[] = [
  { href: '/escolar/estudiantes',   label: 'Estudiantes',    icon: Users },
  { href: '/escolar/personal',      label: 'Personal',       icon: Contact },
  { href: '/escolar/condicion-academica', label: 'Condición académica', icon: ClipboardCheck },
  { href: '/escolar/matriculas',    label: 'Matrículas',     icon: ClipboardList },
  { href: '/escolar/cargos',        label: 'Cargos y deudas', icon: Receipt },
  { href: '/escolar/pagos',         label: 'Pagos',          icon: Wallet },
  { href: '/escolar/sigerd',        label: 'SIGERD',         icon: DownloadCloud },
  { href: '/escolar/configuracion', label: 'Configuración',  icon: Settings },
];

/**
 * `variant`:
 *  - 'rail'   → columna de iconos que se expande al pasar el mouse (escritorio).
 *  - 'drawer' → siempre abierto, sin animación: es el contenido del cajón móvil,
 *    donde no hay hover y ocultar el menú dejaría la pantalla sin navegación.
 */
export function EscolarNavRail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' } = {}) {
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
        <RailBrand modulo="escolar" />

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
          <RailModulos current="escolar" />
        </Box>
      </Box>
    </Box>
  );
}
