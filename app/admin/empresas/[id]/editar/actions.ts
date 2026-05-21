'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { PLANS } from '@/lib/config/plans';

export async function actualizarEmpresa(formData: FormData) {
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const teamId        = parseInt(formData.get('teamId') as string);
  if (isNaN(teamId)) return;

  const razonSocial     = (formData.get('razonSocial') as string).trim();
  const rnc             = (formData.get('rnc') as string).trim();
  const nombreComercial = (formData.get('nombreComercial') as string | null)?.trim() || null;
  const direccion       = (formData.get('direccion') as string | null)?.trim() || null;
  const telefono        = (formData.get('telefono') as string | null)?.trim() || null;
  const emailFact       = (formData.get('emailFacturacion') as string | null)?.trim() || null;
  const sitioWeb        = (formData.get('sitioWeb') as string | null)?.trim() || null;
  const provincia       = (formData.get('provincia') as string | null)?.trim() || null;
  const municipio       = (formData.get('municipio') as string | null)?.trim() || null;
  const planKey         = (formData.get('planName') as string | null)?.trim() || null;

  if (!razonSocial || !rnc) return;

  const planDef = PLANS.find(p => p.key === planKey);

  await db.update(teams).set({
    name:             razonSocial,
    rnc,
    razonSocial,
    nombreComercial:  nombreComercial ?? undefined,
    direccion:        direccion ?? undefined,
    telefono:         telefono ?? undefined,
    emailFacturacion: emailFact ?? undefined,
    sitioWeb:         sitioWeb ?? undefined,
    provincia:        provincia ?? undefined,
    municipio:        municipio ?? undefined,
    planName:         planDef?.name ?? null,
    subscriptionStatus: planKey ? 'admin' : 'admin', // siempre admin para empresas manuales
    updatedAt:        new Date(),
  }).where(eq(teams.id, teamId));

  redirect(`/admin/empresas/${teamId}?ok=actualizado`);
}
