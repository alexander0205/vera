import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getUserModules } from '@/lib/auth/modules';
import { MODULE_LABELS, moduleUrl } from '@/lib/config/modules';

/**
 * /sin-acceso — destino cuando el usuario entra a un módulo que su empresa
 * no tiene activo o su rol no le permite. Muestra los módulos a los que SÍ
 * puede ir; sin ninguno, indica contactar al administrador de la empresa.
 */
export default async function SinAccesoPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const mods = await getUserModules(teamId, user.platformRole, m?.role);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9fafb', p: 3 }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 56, height: 56, borderRadius: '16px', bgcolor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <Typography sx={{ fontSize: '1.5rem' }}>🔒</Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
          No tienes acceso a este módulo
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>
          {mods.length > 0
            ? 'Tu empresa o tu rol no incluye este módulo. Puedes continuar en:'
            : 'Tu cuenta no tiene módulos activos en esta empresa. Pide al administrador que te asigne acceso.'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {mods.map(mod => (
            <Button
              key={mod}
              href={moduleUrl(mod)}
              variant="contained"
              disableElevation
              sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600 }}
            >
              Ir a {MODULE_LABELS[mod]}
            </Button>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
