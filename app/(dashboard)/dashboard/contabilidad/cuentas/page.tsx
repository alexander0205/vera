import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { sembrarCatalogoBase } from '@/lib/contabilidad/catalogo-base';
import { listarCuentasArbol } from '@/lib/contabilidad/cuentas';
import { CatalogoClient } from './_client';
import { ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

export const dynamic = 'force-dynamic';

/**
 * Catálogo de cuentas contables — Paso 2 del plan.
 *
 * La siembra del catálogo base ocurre aquí, en el primer render: un team que
 * nunca abrió contabilidad no tiene cuentas hasta este momento. Es idempotente.
 */
export default async function CuentasPage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  const user = await getUser();
  if (!teamId || !user) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  // Editar el catálogo es configuración, no gestión diaria: quien solo tiene
  // `contabilidad:ver` lo consulta en modo lectura.
  const puedeConfigurar = await userCanForTeam(
    teamId, user.platformRole, member?.role, 'contabilidad:configurar',
  );

  const sembradas = await sembrarCatalogoBase(teamId, user.id);
  const cuentas = await listarCuentasArbol(teamId, { incluirInactivas: true });

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Catálogo de cuentas</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Catálogo de cuentas
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          El mapa contable de tu empresa: dónde se van a clasificar los movimientos.
          Todavía no hay asientos — eso llega en el siguiente paso.
        </Typography>
      </Box>

      {sembradas > 0 && (
        <Alert severity="info">
          Se creó un catálogo base de {sembradas} cuentas con la numeración estándar
          dominicana. Puedes renombrarlas, agregar las tuyas o desactivar las que no uses.
        </Alert>
      )}

      <CatalogoClient cuentasIniciales={cuentas} puedeConfigurar={puedeConfigurar} />
    </Box>
  );
}
