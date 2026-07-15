import Box from '@mui/material/Box';
import { PosNavRail } from '@/components/pos-nav-rail';

export const metadata = { title: 'Zero Punto de Venta' };

export default function PosLayout({ children }: { children: React.ReactNode }) {
  // El <Toaster> vive en el layout raíz (app/layout.tsx). No montar otro aquí:
  // duplicaba cada notificación (salían dos toasts por acción).
  //
  // Navegación PROPIA del POS (rail de iconos) a la izquierda — distinta a la
  // de Facturación. El contenido del POS ocupa el resto (min-w-0 para no
  // desbordar la grilla táctil).
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      <PosNavRail />
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
        {children}
      </Box>
    </Box>
  );
}
