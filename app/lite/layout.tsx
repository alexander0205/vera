import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { Receipt, LogOut } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default async function LiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const team = await getTeamForUser();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb' }}>
      <Box
        component="header"
        sx={{
          position: 'sticky', top: 0, zIndex: 10,
          bgcolor: '#fff', borderBottom: '1px solid #e5e7eb',
        }}
      >
        <Box sx={{ maxWidth: '80rem', mx: 'auto', px: { xs: 2, sm: 3 }, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="a" href="/lite" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', minWidth: 0 }}>
            <Receipt size={20} color="#ea580c" style={{ flexShrink: 0 }} />
            <Typography sx={{ fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {team?.razonSocial ?? team?.name ?? 'Factura'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, flexShrink: 0 }}>
            <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.875rem', color: '#4b5563', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </Typography>
            <Box
              component="a"
              href="/sign-out"
              title="Cerrar sesión"
              sx={{ display: 'flex', alignItems: 'center', color: '#4b5563', '&:hover': { color: '#111827' }, p: '4px' }}
            >
              <LogOut size={16} />
            </Box>
          </Box>
        </Box>
      </Box>

      <Box component="main" sx={{ maxWidth: '80rem', mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, sm: 4 } }}>
        {children}
      </Box>
    </Box>
  );
}
