/**
 * Pantalla dedicada de NOTA DE DÉBITO (e33). Categoría fija → sin selector de
 * tipo. Acepta ?padreId=N para prellenar desde una factura de origen.
 */
import { Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from '@/app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function NuevaNotaDebitoPage() {
  await requirePermission('facturas:crear');
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={32} sx={{ color: '#0d9488' }} />
      </Box>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="nota-debito" />
    </Suspense>
  );
}
