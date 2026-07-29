'use client';

/**
 * Wrapper cliente con ssr:false para evitar el mismatch de aria-ids
 * de Radix UI durante la hidratación en Next.js 15.
 * Recibe los datos del perfil de empresa desde el server component padre.
 */
import dynamic from 'next/dynamic';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

const NuevaFacturaForm = dynamic(() => import('./NuevaFacturaForm'), {
  ssr: false,
  loading: () => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <CircularProgress size={32} sx={{ color: '#0d9488' }} />
    </Box>
  ),
});

export default function NuevaFacturaFormClient({
  initialPerfil,
  categoriaFija,
}: {
  initialPerfil: EmpresaPerfil | null;
  /** Fija la categoría de documento (factura-venta, nota-credito, nota-debito, compras, gastos). */
  categoriaFija?: string;
}) {
  return <NuevaFacturaForm initialPerfil={initialPerfil} categoriaFija={categoriaFija} />;
}
