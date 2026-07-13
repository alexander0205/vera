import Box from '@mui/material/Box';

export const metadata = { title: 'Punto de venta' };

export default function PosLayout({ children }: { children: React.ReactNode }) {
  // El <Toaster> vive en el layout raíz (app/layout.tsx). No montar otro aquí:
  // duplicaba cada notificación (salían dos toasts por acción).
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb', color: '#111827' }}>
      {children}
    </Box>
  );
}
