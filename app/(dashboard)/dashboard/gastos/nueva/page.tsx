/**
 * Pantalla dedicada de GASTOS (e43 — gastos menores / e47 — pagos al exterior).
 * Categoría fija → el usuario solo elige entre los subtipos de gastos.
 */
import { Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from '@/app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function NuevoGastoPage() {
  await requirePermission('facturas:crear');
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={32} sx={{ color: '#3658e1' }} />
      </Box>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="gastos" />
    </Suspense>
  );
}
