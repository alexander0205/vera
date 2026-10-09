'use client';

import dynamic from 'next/dynamic';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import type { EmpresaPerfil } from '../../nueva/page';
import type { BorradorInicial } from '../../nueva/NuevaFacturaForm';

const NuevaFacturaForm = dynamic(() => import('../../nueva/NuevaFacturaForm'), {
  ssr: false,
  loading: () => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <CircularProgress size={32} sx={{ color: '#3658e1' }} />
    </Box>
  ),
});

export default function EditarBorradorClient({
  initialPerfil,
  initialData,
}: {
  initialPerfil: EmpresaPerfil | null;
  initialData:   BorradorInicial;
}) {
  return <NuevaFacturaForm initialPerfil={initialPerfil} initialData={initialData} />;
}
