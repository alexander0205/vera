/**
 * GET /bienvenida/elegir?linea=<erp|pos-erp>&tamano=<n> — el plan elegido desde
 * la página pública de precios, traído de vuelta al onboarding.
 *
 * `/precios` sirve a un usuario logueado a medio registrarse; al tocar un plan,
 * en vez de mandarlo a `/sign-up` (que parecía deslogueo) o a la suscripción
 * (que se salta el onboarding), guarda su elección y lo devuelve a su paso-plan
 * con ESE plan puesto. No hay estado nuevo: cada tier corresponde a un tramo de
 * tamaño —los mismos que ofrece el paso-tamaño— así que basta con guardar
 * `linea` + `tamano` y la deducción del onboarding reproduce el plan.
 *
 * Escribe en un GET a propósito (es un deep-link idempotente y guardado); por
 * eso el botón que apunta aquí va con `prefetch={false}`, para que el prefetch
 * de Next no guarde la elección con solo pasar el cursor.
 *
 * NO toca `onboarding_paso`: quien viene del paso-plan ya está en el paso 4 y
 * vuelve ahí con el plan elegido; a quien llegue antes de tiempo no se le saltan
 * los pasos de empresa/tamaño.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';

// Solo las líneas de facturación se traen por autoservicio. El colegio no: sus
// tarjetas de /precios van a contacto, no aquí.
const LINEAS_ELEGIBLES = ['erp', 'pos-erp'] as const;

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL('/sign-in', req.url));

  const sp = req.nextUrl.searchParams;
  const linea = sp.get('linea');
  const tamano = Number(sp.get('tamano'));
  const lineaOk = !!linea && (LINEAS_ELEGIBLES as readonly string[]).includes(linea);
  // Elección inválida: no se escribe nada, se vuelve al onboarding tal cual.
  if (!lineaOk || !Number.isInteger(tamano) || tamano <= 0) {
    return NextResponse.redirect(new URL('/bienvenida', req.url));
  }

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.redirect(new URL('/sign-in', req.url));

  const [equipo] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!equipo) return NextResponse.redirect(new URL('/sign-in', req.url));
  // Onboarding ya cerrado: no se reabre; a cambiar de plan se va desde la suscripción.
  if (equipo.onboardingCompletadoEn) {
    return NextResponse.redirect(new URL('/dashboard/suscripcion', req.url));
  }

  const prev = (equipo.onboardingDatos as Record<string, unknown> | null) ?? {};
  await db.update(teams).set({
    onboardingDatos: { ...prev, linea, tamano },
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));

  return NextResponse.redirect(new URL('/bienvenida', req.url));
}
