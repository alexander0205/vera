import Box from '@mui/material/Box';
import { CuentaNavRail } from '@/components/cuenta-nav-rail';
import { ModuleHeader } from '@/components/module-header';
import { getUser } from '@/lib/db/queries';

export const metadata = { title: 'Zero Administración' };

/**
 * Área de Administración del negocio — su propio espacio, como Facturación y
 * Punto de Venta. Todo lo que aquí vive se centra en la EMPRESA ACTIVA:
 * perfil, usuarios, roles y plan.
 *
 * No es un módulo del catálogo (toda empresa se administra), así que el header
 * va con título propio y sin marcar módulo activo en el switcher.
 */
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      <CuentaNavRail />
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <ModuleHeader current={null} titulo="Administración" user={user ?? null} />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
