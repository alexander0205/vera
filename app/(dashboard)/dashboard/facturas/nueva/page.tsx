/**
 * Server component — carga el perfil de la empresa activa en el servidor.
 * Esto garantiza que al cambiar de empresa (router.refresh), los datos
 * del emisor en el formulario de nueva factura se actualicen correctamente.
 *
 * Pantalla de FACTURA DE VENTA. La categoría queda fija; el usuario solo elige
 * el subtipo (e31/e32/e44/e45/e46/Sin NCF). NC, ND, Compras y Gastos tienen sus
 * propias rutas/pantallas.
 */
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from './_nueva-factura-client';
import { hasPermission } from '@/lib/auth/page-guard';
import { ShieldX } from 'lucide-react';
import Link from 'next/link';
import { Box, Typography, Button } from '@mui/material';

// Re-export para consumidores existentes (editar, wrapper cliente).
export type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

export default async function NuevaFacturaPage() {
  const canCreate = await hasPermission('facturas:crear');
  if (!canCreate) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 2.5,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            height: 56,
            width: 56,
            borderRadius: '50%',
            bgcolor: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldX style={{ width: 28, height: 28, color: '#ef4444' }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>
            Sin permisos para crear facturas
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5, maxWidth: 384 }}>
            Tu rol no tiene acceso para crear facturas. Contacta al administrador si necesitas realizar cambios.
          </Typography>
        </Box>
        <Button
          component="a"
          href="/dashboard/facturas"
          nativeButton={false}
          variant="contained"
          disableElevation
          sx={{
            textTransform: 'none',
            fontSize: '0.875rem',
            px: 2,
            py: 1,
            borderRadius: '8px',
            bgcolor: '#3658e1',
            '&:hover': { bgcolor: '#2a45c4' },
          }}
        >
          Volver a facturas
        </Button>
      </Box>
    );
  }
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 style={{ width: 32, height: 32, color: '#3658e1', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="factura-venta" />
    </Suspense>
  );
}
