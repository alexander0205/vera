import { notFound } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { catalogos } from '@/lib/ecf-api/client';
import { PLANS } from '@/lib/config/plans';
import Link from 'next/link';
import { EditarEmpresaForm } from './form';

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
  try { provincias = await catalogos.provincias(); } catch {}

  // Convertir planName (display) → key lowercase para el selector
  const planKey = PLANS.find(
    p => p.name.toLowerCase() === (team.planName ?? '').toLowerCase()
  )?.key ?? '';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/empresas/${teamId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {team.razonSocial ?? team.name}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Editar empresa</h1>
      </div>

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
          dgiiEnvironment:  team.dgiiEnvironment  ?? 'TesteCF',
          provincia:        team.provincia        ?? '',
          municipio:        team.municipio        ?? '',
          planName:         planKey,
        }}
      />
    </div>
  );
}
