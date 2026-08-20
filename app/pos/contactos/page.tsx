import Box from '@mui/material/Box';
import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import ClientesClient from '@/app/(dashboard)/dashboard/clientes/_page-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contactos — Zero POS' };

/** Contactos (clientes) dentro del módulo POS. Entidad COMPARTIDA con
 *  Facturación — misma tabla — así no te saca del punto de venta. */
export default async function PosContactosPage() {
  await requirePermission('clientes:ver');
  await requireModule('pos', '/dashboard');
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <ClientesClient />
    </Box>
  );
}
