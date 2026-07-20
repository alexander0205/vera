import Box from '@mui/material/Box';
import { EscolarNavRail } from '@/components/escolar-nav-rail';
import { ModuleHeader } from '@/components/module-header';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { getUser } from '@/lib/db/queries';

export const metadata = { title: 'Zero Administración Escolar' };

/**
 * Módulo Administración Escolar — su propio espacio, como Facturación y Punto
 * de Venta. Doble gate de servidor sobre TODO lo que cuelga de /escolar:
 *
 *   1. requireModule    → la empresa tiene el módulo activo (es opt-in, no
 *      todo el mundo lo lleva) y el rol tiene 'modulo:escolar'.
 *   2. requirePermission → ya dentro del módulo, el rol puede al menos mirar.
 *
 * Sub-rutas más estrictas (p. ej. configuracion) agregan su propio
 * requirePermission encima de este.
 */
export default async function EscolarLayout({ children }: { children: React.ReactNode }) {
  await requireModule('escolar', '/dashboard');
  await requirePermission('administracion-escolar:ver');
  const user = await getUser();

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      <EscolarNavRail />
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <ModuleHeader current="escolar" user={user ?? null} />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
