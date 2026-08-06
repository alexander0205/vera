import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { ConsultaNcfClient } from './_client';
import { AnularRangoPanel } from './_anular-rango';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const dynamic = 'force-dynamic';

export default async function ConsultaNcfPage() {
  await requirePermission('contabilidad:ver');

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Link href="/dashboard/contabilidad/secuencias" style={{ textDecoration: 'none' }}>
          <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280', '&:hover': { color: '#3658e1' } }}>
            Contabilidad
          </Typography>
        </Link>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>
          Consulta de e-NCF
        </Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Consulta de e-NCF
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Busca cualquier comprobante o rango completo y mira exactamente qué pasó con cada número:
          si llegó a la DGII, si falló y por qué, o si nunca se llegó a generar.
        </Typography>
      </Box>

      <ConsultaNcfClient />

      {/* Acción fiscal: colgada del final a propósito — se llega aquí después de
          revisar el rango, no antes. El panel se oculta solo si el usuario no
          tiene `facturas:anular` (el contador consulta pero no anula). */}
      <Box sx={{ mt: 2.5 }}>
        <AnularRangoPanel />
      </Box>
    </Box>
  );
}
