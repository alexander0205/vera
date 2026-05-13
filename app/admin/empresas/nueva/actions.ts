'use server';

import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db/drizzle';
import { teams, sequences, invitations, users, teamMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { sendInvitationEmail } from '@/lib/email';
import { eq, and } from 'drizzle-orm';

export async function crearEmpresa(formData: FormData) {
  const admin = await getUser();
  if (!admin || admin.platformRole !== 'admin') redirect('/dashboard');

  const razonSocial     = (formData.get('razonSocial') as string).trim();
  const rnc             = (formData.get('rnc') as string).trim();
  const nombreComercial = (formData.get('nombreComercial') as string | null)?.trim() || null;
  const direccion       = (formData.get('direccion') as string | null)?.trim() || null;
  const telefono        = (formData.get('telefono') as string | null)?.trim() || null;
  const emailFact       = (formData.get('emailFacturacion') as string | null)?.trim() || null;
  const ambiente        = (formData.get('dgiiEnvironment') as string) || 'TesteCF';
  const provincia       = (formData.get('provincia') as string | null)?.trim() || null;
  const municipio       = (formData.get('municipio') as string | null)?.trim() || null;
  const planKey         = (formData.get('planName') as string | null)?.trim() || null;
  const inviteEmail     = (formData.get('inviteEmail') as string | null)?.trim() || null;

  if (!razonSocial || !rnc) return;

  // Crear team
  const [team] = await db.insert(teams).values({
    name:             razonSocial,
    rnc,
    razonSocial,
    nombreComercial:  nombreComercial ?? undefined,
    direccion:        direccion ?? undefined,
    telefono:         telefono ?? undefined,
    emailFacturacion: emailFact ?? undefined,
    dgiiEnvironment:    ambiente,
    provincia:          provincia ?? undefined,
    municipio:          municipio ?? undefined,
    // Plan asignado manualmente por el admin (sin Stripe)
    // 'admin' = acceso completo sin límite, Stripe no requerido
    planName:           planKey || null,
    subscriptionStatus: 'admin',
  }).returning();

  // Crear 10 secuencias e-NCF
  const venc = new Date('2027-12-31');
  await db.insert(sequences).values([
    { teamId: team.id, tipoEcf: '31', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(1000), fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '32', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(5000), fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '33', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(500),  fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '34', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(500),  fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '41', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(500),  fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '43', secuenciaActual: BigInt(1),    secuenciaHasta: BigInt(200),  fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '44', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '45', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '46', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: venc },
    { teamId: team.id, tipoEcf: '47', secuenciaActual: BigInt(1000), secuenciaHasta: BigInt(2000), fechaVencimiento: venc },
  ]);

  // Invitar primer usuario si se indicó email
  if (inviteEmail) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(teamMembers, and(eq(teamMembers.userId, users.id), eq(teamMembers.teamId, team.id)))
      .where(eq(users.email, inviteEmail))
      .limit(1);

    if (!existing.length) {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [inv] = await db.insert(invitations).values({
        teamId:    team.id,
        email:     inviteEmail,
        role:      'owner',
        invitedBy: admin.id,
        status:    'pending',
        token,
        expiresAt,
      }).returning();

      try {
        await sendInvitationEmail(inviteEmail, admin.name, razonSocial, inv.token);
      } catch (e) {
        console.error('[crearEmpresa] Error sending invite email:', e);
      }
    }
  }

  redirect(`/admin/empresas/${team.id}`);
}
