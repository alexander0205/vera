import Box from '@mui/material/Box';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import { InventarioPageClient } from '@/app/(dashboard)/dashboard/inventario/_page-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventario — Zero POS' };

/** Inventario (movimientos de stock) dentro del módulo POS. Entidad compartida
 *  con Facturación (mismas tablas). */
export default async function PosInventarioPage() {
  await requirePermission('productos:ver');
  await requireModule('pos', '/dashboard');
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <InventarioPageClient />
    </Box>
  );
}
