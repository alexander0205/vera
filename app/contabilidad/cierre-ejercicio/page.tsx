import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { requirePermission, hasPermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { listarCierres, aniosConActividad } from '@/lib/contabilidad/cierre';
import { CierreEjercicioClient } from './_client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const dynamic = 'force-dynamic';

/**
 * Cierre de ejercicio (cierre anual). Lleva los saldos de resultado (4/5/6) a
 * 3102 al terminar el año. Ver exige `contabilidad:ver`; cerrar y reabrir,
 * `contabilidad:gestionar`.
 */
export default async function CierreEjercicioPage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [cierres, anios, puedeGestionar] = await Promise.all([
    listarCierres(teamId),
    aniosConActividad(teamId),
    hasPermission('contabilidad:gestionar'),
  ]);

  const cerrados = new Set(cierres.map((c) => c.ejercicio));
  const aniosDisponibles = anios.filter((a) => !cerrados.has(a));

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>Cierre de ejercicio</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Cierre de ejercicio
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Al terminar el año, el cierre pasa los ingresos, costos y gastos a
          Resultados acumulados y deja esas cuentas en cero para empezar limpio el
          año siguiente. Es reversible.
        </Typography>
      </Box>

      <CierreEjercicioClient cierres={cierres} aniosDisponibles={aniosDisponibles} puedeGestionar={puedeGestionar} />
    </Box>
  );
}
