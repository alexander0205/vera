import { db } from '@/lib/db/drizzle';
import { systemLogs, teams } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

export default async function AdminLogsPage() {
  const logs = await db
    .select({
      id: systemLogs.id,
      level: systemLogs.level,
      source: systemLogs.source,
      message: systemLogs.message,
      details: systemLogs.details,
      createdAt: systemLogs.createdAt,
      teamName: teams.name,
    })
    .from(systemLogs)
    .leftJoin(teams, eq(systemLogs.teamId, teams.id))
    .orderBy(desc(systemLogs.createdAt))
    .limit(500);

  const LEVEL_ICON = {
    error: XCircle,
    warn: AlertTriangle,
    info: Info,
  };
  const LEVEL_COLOR = {
    error: 'text-red-500',
    warn: 'text-amber-500',
    info: 'text-blue-500',
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">System Logs</h1>
      <div className="space-y-2">
        {logs.map(log => {
          const level = log.level as 'error' | 'warn' | 'info';
          const Icon = LEVEL_ICON[level] ?? Info;
          return (
            <div key={log.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${LEVEL_COLOR[level] ?? 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{log.message}</span>
                    {log.source && <code className="text-xs text-gray-400 bg-gray-100 rounded px-1.5">{log.source}</code>}
                  </div>
                  {log.details && (
                    <pre className="text-xs text-gray-500 bg-gray-50 rounded p-2 overflow-auto max-h-32 mt-1">
                      {log.details}
                    </pre>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {log.teamName && <span>Empresa: {log.teamName}</span>}
                    <span>{new Date(log.createdAt).toLocaleString('es-DO')}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
