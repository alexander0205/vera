import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Building2, Users, ShieldCheck, CreditCard, Layers } from 'lucide-react';
import { requirePermissionAny } from '@/lib/auth/page-guard';
import { getTeamProfile, getTeamIdForUser } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administración — Zero' };

const CARDS = [
  { href: '/cuenta/empresa',  title: 'Mi empresa',         desc: 'Datos fiscales, logo, dirección y ajustes del negocio.',        icon: Building2 },
  { href: '/cuenta/usuarios', title: 'Usuarios',           desc: 'Invita a tu equipo y define a qué módulo entra cada quien.',    icon: Users },
  { href: '/cuenta/roles',    title: 'Roles y permisos',   desc: 'Crea roles a medida y controla qué puede hacer cada rol.',      icon: ShieldCheck },
  { href: '/cuenta/plan',     title: 'Plan y facturación', desc: 'Tu plan, límites de uso y método de pago.',                     icon: CreditCard },
  { href: '/cuenta/empresas', title: 'Mis empresas',       desc: 'Cambia de negocio o crea uno nuevo. Cada uno con su plan.',     icon: Layers },
];

export default async function CuentaPage() {
  // El área es de administración del negocio: basta con poder ver la
  // configuración o el equipo para entrar; cada card gatea su propio permiso.
  await requirePermissionAny(['configuracion:ver', 'equipo:ver']);

  const teamId = await getTeamIdForUser();
  const perfil = teamId ? await getTeamProfile(teamId) : null;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Administración</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 3 }}>
        Todo lo de {perfil?.razonSocial ?? 'tu negocio'}: datos de la empresa, tu equipo y tu plan.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
        {CARDS.map(c => (
          <Link key={c.title} href={c.href} style={{ textDecoration: 'none' }}>
            <Box
              sx={{
                display: 'flex', flexDirection: 'column', gap: 1, p: 2.5, borderRadius: '14px',
                border: '1px solid #e5e7eb', bgcolor: '#fff', height: '100%',
                transition: 'all 0.15s', '&:hover': { borderColor: '#2dd4bf', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
              }}
            >
              <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <c.icon style={{ width: 22, height: 22, color: '#0d9488' }} />
              </Box>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', mt: 0.5 }}>{c.title}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{c.desc}</Typography>
            </Box>
          </Link>
        ))}
      </Box>
    </Box>
  );
}
