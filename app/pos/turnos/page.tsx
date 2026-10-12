import Box from '@mui/material/Box';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import HistorialPage from '@/app/(dashboard)/dashboard/caja/historial/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Turnos — Zero POS' };

/** Historial de turnos de caja dentro del módulo POS. */
export default async function PosTurnosPage() {
  await requirePermission('caja:ver');
  await requireModule('pos', '/dashboard');
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <HistorialPage />
    </Box>
  );
}
