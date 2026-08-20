import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

export default async function AdminUsuariosPage() {
  const allUsers = await db
    .select({
      id: users.id, name: users.name, email: users.email,
      role: users.platformRole, emailVerified: users.emailVerified,
      twoFactorEnabled: users.twoFactorEnabled, createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(500);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>Usuarios ({allUsers.length})</Typography>
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Usuario</TableCell>
                <TableCell>Email verificado</TableCell>
                <TableCell>2FA</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Registrado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allUsers.map(u => (
                <TableRow key={u.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem' }}>{u.name ?? '—'}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{u.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={u.emailVerified ? 'Verificado' : 'Pendiente'} size="small"
                      sx={{ bgcolor: u.emailVerified ? '#f0fdf4' : '#f3f4f6', color: u.emailVerified ? '#166534' : '#6b7280', border: '1px solid', borderColor: u.emailVerified ? '#bbf7d0' : '#e5e7eb', fontSize: '0.6875rem', height: 20 }} />
                  </TableCell>
                  <TableCell>
                    <Chip label={u.twoFactorEnabled ? 'Activo' : 'No'} size="small"
                      sx={{ bgcolor: u.twoFactorEnabled ? '#eef2fe' : '#f3f4f6', color: u.twoFactorEnabled ? '#2a45c4' : '#6b7280', border: '1px solid', borderColor: u.twoFactorEnabled ? '#c7d2fc' : '#e5e7eb', fontSize: '0.6875rem', height: 20 }} />
                  </TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{u.role}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{new Date(u.createdAt).toLocaleDateString('es-DO')}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
