import { db } from '@/lib/db/drizzle';
import { users, teams, ecfDocuments } from '@/lib/db/schema';
import { count, gte } from 'drizzle-orm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default async function AdminDashboard() {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [totalUsers, totalTeams, totalDocs, docsMes] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(teams),
    db.select({ c: count() }).from(ecfDocuments),
    db.select({ c: count() }).from(ecfDocuments).where(gte(ecfDocuments.createdAt, startOfMonth)),
  ]);

  const stats = [
    { label: 'Usuarios registrados', value: totalUsers[0]?.c ?? 0, bgcolor: '#eff6ff', color: '#1d4ed8' },
    { label: 'Empresas (teams)',      value: totalTeams[0]?.c ?? 0, bgcolor: '#f0fdfa', color: '#0f766e' },
    { label: 'Total e-CF emitidos',   value: totalDocs[0]?.c ?? 0,  bgcolor: '#faf5ff', color: '#7c3aed' },
    { label: 'e-CF este mes',         value: docsMes[0]?.c ?? 0,    bgcolor: '#f0fdf4', color: '#166534' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Dashboard Admin</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        {stats.map(s => (
          <Box key={s.label} sx={{ bgcolor: s.bgcolor, borderRadius: '12px', p: 2.5, border: '1px solid', borderColor: `${s.color}33` }}>
            <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: s.color }}>
              {s.value.toLocaleString('es-DO')}
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: s.color, opacity: 0.8, mt: 0.5 }}>{s.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
