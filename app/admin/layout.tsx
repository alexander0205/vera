import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { me } from '@/lib/ecf-api/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Wifi, WifiOff } from 'lucide-react';

async function fetchEcfApiMe() {
  try { return await me(); } catch (e) {
    console.error('[admin layout] ecf-api /me error:', e);
    return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') redirect('/dashboard');

  const ecfMe = await fetchEcfApiMe();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb' }}>
      {/* Header */}
      <Box component="header" sx={{ bgcolor: '#111827', color: '#fff', px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexShrink: 0 }}>
          <Box sx={{ height: 28, width: 28, bgcolor: '#0d9488', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: '#fff', lineHeight: 1 }}>z</Typography>
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.875rem', sm: '1rem' }, color: '#fff' }}>Zero Admin</Typography>
        </Box>
        <Box component="nav" sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, overflowX: 'auto', order: { xs: 3, sm: 2 }, width: { xs: '100%', sm: 'auto' }, ml: { sm: 1 } }}>
          {[['Dashboard','/admin'],['Usuarios','/admin/usuarios'],['Empresas','/admin/empresas'],['Logs','/admin/logs']].map(([label, href]) => (
            <Box key={href} component="a" href={href} sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, color: '#d1d5db', '&:hover': { color: '#fff' }, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {label}
            </Box>
          ))}
        </Box>
        <Box component="a" href="/dashboard" sx={{ ml: 'auto', fontSize: { xs: '0.75rem', sm: '0.875rem' }, color: '#9ca3af', '&:hover': { color: '#fff' }, textDecoration: 'none', whiteSpace: 'nowrap', order: { xs: 2, sm: 3 } }}>
          ← App
        </Box>
      </Box>

      {/* Banner ecf-api */}
      {ecfMe ? (
        <Box sx={{ bgcolor: '#ecfdf5', borderBottom: '1px solid #a7f3d0', px: { xs: 2, sm: 3 }, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Wifi size={14} color="#059669" />
          <Typography sx={{ fontSize: '0.75rem', color: '#065f46' }}>
            <strong>ecf-api</strong> · {ecfMe.empresa.nombre}
            <Box component="span" sx={{ color: '#059669' }}> · key:</Box> {ecfMe.apiKey.nombre}
            <Box component="span" sx={{ color: '#059669' }}> · ambiente:</Box> {ecfMe.software.ambienteDefault}
            {ecfMe.apiKey.esAdmin && (
              <Box component="span" sx={{ ml: 1, px: 0.75, py: 0.25, bgcolor: '#a7f3d0', color: '#064e3b', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700 }}>ADMIN</Box>
            )}
          </Typography>
          <Typography sx={{ ml: 'auto', fontSize: '0.75rem', color: '#059669' }}>
            {ecfMe.software.nombre} v{ecfMe.software.version}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: '#fef2f2', borderBottom: '1px solid #fca5a5', px: 3, py: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WifiOff size={14} color="#dc2626" />
          <Typography sx={{ fontSize: '0.75rem', color: '#991b1b' }}>
            <strong>ecf-api inalcanzable</strong>{' '}
            Verifica <Box component="code" sx={{ bgcolor: '#fee2e2', px: 0.75, borderRadius: '4px' }}>ECF_API_URL</Box>{' '}
            y <Box component="code" sx={{ bgcolor: '#fee2e2', px: 0.75, borderRadius: '4px' }}>ECF_API_KEY</Box> en .env
          </Typography>
        </Box>
      )}

      <Box component="main" sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
    </Box>
  );
}
