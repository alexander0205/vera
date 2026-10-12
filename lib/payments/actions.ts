'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getPlanByPriceId, planBajoCotizacion } from '@/lib/config/plans';
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

/**
 * Ir al pago seguro de Stripe a contratar un plan.
 *
 * Con una excepción que NO es de maquetación: los planes cuya línea va bajo
 * cotización (`precioBajoCotizacion`) no se auto-contratan. Esconder el precio
 * y dejar abierto el botón que cobra es cobrarle a alguien una cifra que nunca
 * vio, y esconder el botón sin cerrar la acción no esconde nada — esta es una
 * Server Action y un POST a mano llega igual. Por eso el corte está aquí, y la
 * pantalla se limita a ofrecer el camino que sí existe (hablar con nosotros).
 *
 * La PRUEBA sin tarjeta sigue abierta (`empezarPruebaAction`): no cobra nada y
 * Stripe la deja en pausa si al terminar no hay método de pago, así que por ahí
 * nadie acaba pagando sin haber visto el número.
 */
export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;

  if (planBajoCotizacion(getPlanByPriceId(priceId).key)) {
    // De vuelta a la pantalla, que es donde está el botón de contacto con el
    // motivo escrito. Sin mensaje de error propio a propósito: aquí no se
    // llega por la interfaz, solo a mano.
    redirect('/dashboard/suscripcion#planes');
  }

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
