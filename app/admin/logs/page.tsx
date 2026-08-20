import { db } from '@/lib/db/drizzle';
import { systemLogs, teams } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

export default async function AdminLogsPage() {
  const logs = await db
    .select({
      id: systemLogs.id, level: systemLogs.level, source: systemLogs.source,
      message: systemLogs.message, details: systemLogs.details,
      createdAt: systemLogs.createdAt, teamName: teams.name,
    })
    .from(systemLogs)
    .leftJoin(teams, eq(systemLogs.teamId, teams.id))
    .orderBy(desc(systemLogs.createdAt))
    .limit(500);

  const LEVEL_ICON = { error: XCircle, warn: AlertTriangle, info: Info };
  const LEVEL_COLOR = { error: '#ef4444', warn: '#f59e0b', info: '#3b82f6' };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>System Logs</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {logs.map(log => {
          const level = log.level as 'error' | 'warn' | 'info';
          const Icon  = LEVEL_ICON[level] ?? Info;
          const color = LEVEL_COLOR[level] ?? '#9ca3af';
          return (
            <Box key={log.id} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Icon size={16} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.message}
                    </Typography>
                    {log.source && (
                      <Box component="code" sx={{ fontSize: '0.6875rem', color: '#9ca3af', bgcolor: '#f3f4f6', borderRadius: '4px', px: 1, flexShrink: 0 }}>
                        {log.source}
                      </Box>
                    )}
                  </Box>
                  {log.details && (
                    <Box component="pre" sx={{ fontSize: '0.6875rem', color: '#6b7280', bgcolor: '#f9fafb', borderRadius: '6px', p: 1, overflowX: 'auto', maxHeight: 128, mt: 0.5, m: 0 }}>
                      {log.details}
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                    {log.teamName && <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>Empresa: {log.teamName}</Typography>}
                    <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{new Date(log.createdAt).toLocaleString('es-DO')}</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
