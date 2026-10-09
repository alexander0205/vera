/**
 * Pantalla dedicada de COMPRAS (e41 — comprobante de compras a proveedores
 * locales con RNC). Categoría fija → sin selector de tipo.
 */
import { Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from '@/app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function NuevaCompraPage() {
  await requirePermission('facturas:crear');
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={32} sx={{ color: '#3658e1' }} />
      </Box>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="compras" />
    </Suspense>
  );
}
