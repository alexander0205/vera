import Box from '@mui/material/Box';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import CajaPage from '@/app/(dashboard)/dashboard/caja/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gestión de efectivo — Zero POS' };

/** Gestión de efectivo (turno actual + entradas/salidas/gastos/retiros) dentro
 *  del módulo POS. Reusa el cliente de caja; se renderiza bajo app/pos/layout. */
export default async function PosCajaPage() {
  await requirePermission('caja:ver');
  await requireModule('pos', '/dashboard');
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <CajaPage />
    </Box>
  );
}
