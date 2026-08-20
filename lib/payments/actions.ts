'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getSuscripcion } from '@/lib/suscripcion/queries';
import { sincronizarConStripe } from '@/lib/payments/sincronizar';
import {
  createCheckoutSession, createCustomerPortalSession, crearSuscripcionDePrueba,
} from './stripe';
import { withTeam } from '@/lib/auth/middleware';

function addonsDelForm(formData: FormData): string[] {
  // La línea "Zero POS + ERP" es la familia e-CF con el adicional de POS
  // sumado: el precio que se le enseñó ya lo incluye, así que la suscripción
  // tiene que llevar los dos items. Sin esto cobraría el combinado y
  // entregaría el plan pelado.
  return String(formData.get('addons') ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);
}

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;
  await createCheckoutSession({ team, priceId, addons: addonsDelForm(formData) });
});

/**
 * Elegir plan SIN pasar por el checkout: abre la prueba de su familia, sin
 * tarjeta, igual que el onboarding. Es el camino de las empresas que existían
 * antes del billing — tienen datos, tienen historia, pero nunca tuvieron
 * suscripción.
 *
 * Solo funciona desde `sin-plan`. Cualquier otro estado significa que YA hubo
 * una suscripción (viva, pausada o cancelada), y repetir la prueba ahí sería
 * regalar días infinitos a quien cancele y vuelva: a esos los espera el
 * checkout, que cobra.
 */
export const empezarPruebaAction = withTeam(async (formData, team) => {
  const sus = await getSuscripcion(team.id);
  if (sus.estado !== 'sin-plan') redirect('/dashboard/suscripcion');

  const priceId = formData.get('priceId') as string;
  const user = await getUser();

  const { customerId } = await crearSuscripcionDePrueba({
    team,
    email: user?.email ?? '',
    priceId,
    addons: addonsDelForm(formData),
  });

  // El customer primero: `sincronizarConStripe` busca por esa columna, y sin
  // ella la suscripción recién creada quedaría huérfana hasta el webhook.
  if (!team.stripeCustomerId) {
    await db.update(teams)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(teams.id, team.id));
  }
  await sincronizarConStripe(team.id);

  redirect('/dashboard/suscripcion');
});

export const customerPortalAction = withTeam(async (_, team) => {
  const portalSession = await createCustomerPortalSession(team);
  redirect(portalSession.url);
});
