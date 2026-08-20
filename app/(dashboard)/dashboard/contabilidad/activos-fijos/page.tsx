import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { requirePermission, hasPermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { hoyRD } from '@/lib/utils/format';
import { listarActivosFijos } from '@/lib/contabilidad/depreciacion';
import { ActivosFijosClient } from './_client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const dynamic = 'force-dynamic';

/**
 * Activos fijos y depreciación (Nivel 4.2).
 *
 * Listar exige `contabilidad:ver`; registrar y generar depreciaciones, además,
 * `contabilidad:gestionar` — la API lo vuelve a exigir, la pantalla solo esconde
 * los controles a quien no puede. La depreciación se genera sola por el cron; el
 * botón es para "quiero verlo ahora".
 */
export default async function ActivosFijosPage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [activos, puedeGestionar] = await Promise.all([
    listarActivosFijos(teamId),
    hasPermission('contabilidad:gestionar'),
  ]);

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>Activos fijos</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Activos fijos
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Los bienes de larga vida (edificio, equipo, mobiliario) con su costo y
          vida útil. El sistema calcula solo la depreciación de cada mes por el
          método lineal y arma su asiento.
        </Typography>
      </Box>

      <ActivosFijosClient activos={activos} hoy={hoyRD()} puedeGestionar={puedeGestionar} />
    </Box>
  );
}
