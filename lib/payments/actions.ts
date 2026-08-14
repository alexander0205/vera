'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession, createCustomerPortalSession } from './stripe';
import { withTeam } from '@/lib/auth/middleware';

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;
  // La línea "Zero POS + ERP" es la familia e-CF con el adicional de POS
  // sumado: el precio que se le enseñó ya lo incluye, así que el checkout
  // tiene que llevar los dos items. Sin esto cobraría el combinado y
  // entregaría el plan pelado.
  const addons = String(formData.get('addons') ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);
  await createCheckoutSession({ team, priceId, addons });
});

export const customerPortalAction = withTeam(async (_, team) => {
  const portalSession = await createCustomerPortalSession(team);
  redirect(portalSession.url);
});
