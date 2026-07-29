import { notFound } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getProvincias } from '@/lib/dgii/catalogos';
import { PLANS } from '@/lib/config/plans';
import Link from 'next/link';
import { EditarEmpresaForm } from './form';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default async function EditarEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = parseInt(id);

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) notFound();

  let provincias: { codigo: string; nombre: string }[] = [];
  try { provincias = await getProvincias(); } catch {}

  // Convertir planName (display) → key lowercase para el selector
  const planKey = PLANS.find(
    p => p.name.toLowerCase() === (team.planName ?? '').toLowerCase()
  )?.key ?? '';

  return (
    <Box sx={{ maxWidth: '672px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Link href={`/admin/empresas/${teamId}`} style={{ textDecoration: 'none' }}>
          <Typography variant="body2" sx={{ color: '#6b7280', '&:hover': { color: '#374151' } }}>
            ← {team.razonSocial ?? team.name}
          </Typography>
        </Link>
        <Typography variant="body2" sx={{ color: '#d1d5db' }}>/</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', fontSize: '1.1rem' }}>
          Editar empresa
        </Typography>
      </Box>

      <EditarEmpresaForm
        provincias={provincias}
        initial={{
          teamId,
          rnc:              team.rnc             ?? '',
          razonSocial:      team.razonSocial      ?? '',
          nombreComercial:  team.nombreComercial  ?? '',
          direccion:        team.direccion        ?? '',
          telefono:         team.telefono         ?? '',
          emailFacturacion: team.emailFacturacion ?? '',
          sitioWeb:         team.sitioWeb         ?? '',
          provincia:        team.provincia        ?? '',
          municipio:        team.municipio        ?? '',
          planName:         planKey,
        }}
      />
    </Box>
  );
}
