import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { activityLogs, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Activity } from 'lucide-react';
import { PlanGate } from '@/components/plan-gate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';

const ACTION_LABELS: Record<string, string> = {
  SIGN_UP: 'Registro de usuario',
  SIGN_IN: 'Inicio de sesión',
  SIGN_OUT: 'Cierre de sesión',
  UPDATE_PASSWORD: 'Cambio de contraseña',
  DELETE_ACCOUNT: 'Eliminación de cuenta',
  UPDATE_ACCOUNT: 'Actualización de cuenta',
  CREATE_TEAM: 'Creación de empresa',
  REMOVE_TEAM_MEMBER: 'Miembro eliminado del equipo',
  INVITE_TEAM_MEMBER: 'Invitación enviada',
  ACCEPT_INVITATION: 'Invitación aceptada',
  EMIT_ECF: 'Comprobante emitido',
  VOID_ECF: 'Comprobante anulado',
  UPLOAD_CERT: 'Certificado subido',
  REGISTER_SEQUENCES: 'Secuencias registradas',
};

export default async function ActivityPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const logs = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.teamId, teamId))
    .orderBy(desc(activityLogs.timestamp))
    .limit(200);

  return (
    <>
      <PlanGate feature="actividad" />
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Registro de Actividad
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Historial de acciones realizadas en esta empresa
          </Typography>
        </Box>

        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          {logs.length === 0 ? (
            <Box sx={{ py: 10, textAlign: 'center' }}>
              <Activity style={{ width: 40, height: 40, color: '#e5e7eb', margin: '0 auto 12px' }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                No hay actividad registrada
              </Typography>
            </Box>
          ) : (
            logs.map((log, i) => (
              <Box key={log.id}>
                {i > 0 && <Divider sx={{ mx: 2 }} />}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 1.5 }}>
                  <Box sx={{
                    width: 34, height: 34, borderRadius: '50%',
                    bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Activity style={{ width: 16, height: 16, color: '#0d9488' }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {log.userName ?? log.userEmail ?? 'Sistema'}
                      {log.ipAddress && ` · ${log.ipAddress}`}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                    {new Date(log.timestamp).toLocaleString('es-DO')}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </Card>
      </Box>
    </>
  );
}
