import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { hoyRD } from '@/lib/utils/format';
import { listarCuentas } from '@/lib/contabilidad/cuentas';
import { NuevoAsientoClient } from './_client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const dynamic = 'force-dynamic';

/**
 * Nuevo asiento manual — para lo que no nace de una factura ni un cobro:
 * nómina, alquiler, depreciación, ajustes del contador.
 *
 * La página exige `contabilidad:gestionar` (el sidebar ya la oculta a quien solo
 * puede ver). El formulario vive en el cliente porque el cuadre se calcula en
 * vivo mientras el usuario escribe; el guardado va por POST a la API.
 */
export default async function NuevoAsientoPage() {
  await requirePermission('contabilidad:gestionar');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  // Solo cuentas imputables y activas: un asiento no cae sobre una agrupadora.
  const cuentas = (await listarCuentas(teamId)).filter((c) => c.imputable);

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Nuevo asiento manual</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Nuevo asiento manual
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Para registrar a mano lo que no sale de una factura o un cobro. El
          asiento tiene que cuadrar: el total del debe y el del haber deben ser
          iguales.
        </Typography>
      </Box>

      {cuentas.length === 0 ? (
        <Typography sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          Todavía no hay cuentas imputables en el catálogo.{' '}
          <Box component="a" href="/dashboard/contabilidad/cuentas" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
            Ve al catálogo de cuentas
          </Box>{' '}
          primero.
        </Typography>
      ) : (
        <NuevoAsientoClient cuentas={cuentas} hoy={hoyRD()} />
      )}
    </Box>
  );
}
