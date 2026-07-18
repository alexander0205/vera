import Box from '@mui/material/Box';
import { CuentaNavRail } from '@/components/cuenta-nav-rail';

export const metadata = { title: 'Zero Administración' };

/**
 * Área de Administración del negocio — su propio espacio, como Facturación y
 * Punto de Venta. Todo lo que aquí vive se centra en la EMPRESA ACTIVA:
 * perfil, usuarios, roles y plan.
 */
export default function CuentaLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      <CuentaNavRail />
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
        {children}
      </Box>
    </Box>
  );
}
