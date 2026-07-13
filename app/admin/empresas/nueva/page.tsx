import Link from 'next/link';
import { NuevaEmpresaForm } from './form';
import { getProvincias } from '@/lib/dgii/catalogos';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default async function NuevaEmpresaPage() {
  // Cargar provincias server-side desde la BD local — fallback a [] si falla
  let provincias: { codigo: string; nombre: string }[] = [];
  try {
    provincias = await getProvincias();
  } catch {
    // BD/ecf-api offline — el select queda vacío, usuario puede escribir manualmente
  }

  return (
    <Box sx={{ maxWidth: '672px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Link href="/admin/empresas" style={{ textDecoration: 'none' }}>
          <Typography variant="body2" sx={{ color: '#6b7280', '&:hover': { color: '#374151' } }}>
            ← Empresas
          </Typography>
        </Link>
        <Typography variant="body2" sx={{ color: '#d1d5db' }}>/</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', fontSize: '1.1rem' }}>
          Nueva empresa
        </Typography>
      </Box>

      <NuevaEmpresaForm provincias={provincias} />
    </Box>
  );
}
