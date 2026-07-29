import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, ecfDocuments } from '@/lib/db/schema';
import { desc, count } from 'drizzle-orm';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { Building2, Plus, Users } from 'lucide-react';

export default async function AdminEmpresasPage() {
  const allTeams = await db
    .select({
      id: teams.id, name: teams.name, rnc: teams.rnc,
      razonSocial: teams.razonSocial, planName: teams.planName,
      subscriptionStatus: teams.subscriptionStatus, createdAt: teams.createdAt,
    })
    .from(teams)
    .orderBy(desc(teams.createdAt))
    .limit(500);

  const memberCounts = await db.select({ teamId: teamMembers.teamId, c: count() }).from(teamMembers).groupBy(teamMembers.teamId);
  const docCounts    = await db.select({ teamId: ecfDocuments.teamId, c: count() }).from(ecfDocuments).groupBy(ecfDocuments.teamId);
  const memberMap    = Object.fromEntries(memberCounts.map(r => [r.teamId, r.c]));
  const docMap       = Object.fromEntries(docCounts.map(r => [r.teamId, r.c]));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>Empresas ({allTeams.length})</Typography>
        <Link href="/admin/empresas/nueva" style={{ textDecoration: 'none' }}>
          <Button variant="contained" disableElevation startIcon={<Plus size={16} />}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
            Nueva empresa
          </Button>
        </Link>
      </Box>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        {allTeams.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Building2 size={40} color="#e5e7eb" style={{ margin: '0 auto 12px' }} />
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mb: 2 }}>No hay empresas registradas</Typography>
            <Link href="/admin/empresas/nueva" style={{ textDecoration: 'none' }}>
              <Button variant="contained" disableElevation startIcon={<Plus size={16} />}
                sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
                Crear primera empresa
              </Button>
            </Link>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell>Empresa</TableCell>
                  <TableCell>RNC</TableCell>
                  <TableCell>Usuarios</TableCell>
                  <TableCell>Facturas</TableCell>
                  <TableCell>Creada</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {allTeams.map(t => (
                  <TableRow key={t.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem' }}>{t.razonSocial ?? t.name}</Typography>
                      {t.razonSocial && t.razonSocial !== t.name && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{t.name}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#4b5563' }}>{t.rnc ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#4b5563' }}>
                        <Users size={12} />
                        <Typography sx={{ fontSize: '0.875rem' }}>{memberMap[t.id] ?? 0}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>{(docMap[t.id] ?? 0).toLocaleString('es-DO')}</Typography></TableCell>
                    <TableCell><Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{new Date(t.createdAt).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}</Typography></TableCell>
                    <TableCell>
                      <Link href={`/admin/empresas/${t.id}`} style={{ textDecoration: 'none', color: '#0d9488', fontSize: '0.75rem', fontWeight: 500 }}>
                        Ver →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    </Box>
  );
}
