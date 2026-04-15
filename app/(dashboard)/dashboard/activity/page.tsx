import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { activityLogs, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Activity } from 'lucide-react';
import { PlanGate } from '@/components/plan-gate';

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
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Registro de Actividad</h1>
        <p className="text-sm text-gray-500 mt-1">Historial de acciones realizadas en esta empresa</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay actividad registrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-4 px-5 py-3">
                <div className="h-8 w-8 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                  <Activity className="h-4 w-4 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{ACTION_LABELS[log.action] ?? log.action}</p>
                  <p className="text-xs text-gray-400">
                    {log.userName ?? log.userEmail ?? 'Sistema'}
                    {log.ipAddress && ` · ${log.ipAddress}`}
                  </p>
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(log.timestamp).toLocaleString('es-DO')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
