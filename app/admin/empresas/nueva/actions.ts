'use server';

import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db/drizzle';
import { teams, invitations, users, teamMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { sendInvitationEmail } from '@/lib/email';
import { seedSystemRoles } from '@/lib/auth/permissions';
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
  const provincia       = (formData.get('provincia') as string | null)?.trim() || null;
  const municipio       = (formData.get('municipio') as string | null)?.trim() || null;
  const planKey         = (formData.get('planName') as string | null)?.trim() || null;
  const inviteEmail     = (formData.get('inviteEmail') as string | null)?.trim().toLowerCase() || null;

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
    provincia:          provincia ?? undefined,
    municipio:          municipio ?? undefined,
    // Plan asignado manualmente por el admin (sin Stripe)
    // 'admin' = acceso completo sin límite, Stripe no requerido
    planName:           planKey || null,
    subscriptionStatus: 'admin',
  }).returning();

  // Sembrar roles de sistema (owner/admin/vendedor/auditor) + permisos default
  await seedSystemRoles(team.id);

  // NO se siembran secuencias e-NCF. Hasta el 2026-08-06 aquí se insertaban 10
  // rangos fijos (31: 1-1000, 32: 1-5000, 33/34/41: 1-500, 43: 1-200,
  // 44/45/46/47: 1000-2000, todos venciendo el 2027-12-31). Eran inventados: la
  // DGII nunca los autorizó. Una empresa recién creada quedaba lista para
  // emitir e-NCF fuera de cualquier rango autorizado, y en producción varias
  // se quedaron con esos defaults sin tocar.
  //
  // Las secuencias son un dato fiscal que solo existe cuando la DGII aprueba la
  // solicitud del contribuyente. El dueño las carga a mano desde Configuración
  // → Secuencias (POST /api/secuencias) con el rango y el vencimiento reales
  // del comprobante de autorización. Sin secuencia, la empresa puede facturar
  // sin comprobante fiscal (sin-ncf) pero no emitir e-CF, que es lo correcto.

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
