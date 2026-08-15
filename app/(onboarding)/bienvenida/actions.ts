'use server';

/**
 * Los tres saltos del onboarding.
 *
 * El paso vive en la base (`teams.onboarding_paso`) y NO en la URL. Es lo que
 * hace que no se pueda saltar: da igual lo que alguien escriba en la barra de
 * direcciones, la pantalla que se pinta es la que dice la fila. Y es lo que
 * hace que se pueda retomar: quien cierra el navegador en el paso 3 vuelve al
 * paso 3, no al principio.
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams, users } from '@/lib/db/schema';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { validatedAction } from '@/lib/auth/middleware';
import { planSugerido, type LineaKey } from '@/lib/onboarding/deducir';
import { PRUEBA } from '@/lib/config/suscripcion';

const LINEAS = ['erp', 'pos-erp', 'erp-colegio'] as const;

/** Lo que se lleva guardado del formulario, dentro de `onboarding_datos`. */
type Datos = { linea?: LineaKey; tamano?: number; rncManual?: boolean };

async function equipoActual() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');
  const [equipo] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!equipo) redirect('/sign-in');
  return equipo;
}

// ─── Paso 2 → 3 · Quién eres ────────────────────────────────────────────────

const esquemaEmpresa = z.object({
  rnc: z.string().trim().regex(/^\d{9}$|^\d{11}$/, 'El RNC debe tener 9 u 11 dígitos'),
  razonSocial: z.string().trim().min(2, 'Escribe la razón social').max(255),
  nombreComercial: z.string().trim().max(255).optional(),
  linea: z.enum(LINEAS),
  // Verdadero cuando el RNC no estaba en el padrón y lo tecleó la persona. Se
  // guarda porque cambia cuánto nos podemos fiar de esos datos más adelante.
  manual: z.string().optional(),
});

export const guardarEmpresa = validatedAction(esquemaEmpresa, async (data) => {
  const equipo = await equipoActual();
  if (equipo.onboardingCompletadoEn) redirect('/dashboard');

  const datos: Datos = {
    ...((equipo.onboardingDatos as Datos) ?? {}),
    linea: data.linea,
    rncManual: data.manual === 'on',
  };

  await db.update(teams).set({
    rnc: data.rnc,
    razonSocial: data.razonSocial,
    nombreComercial: data.nombreComercial || null,
    // El nombre visible deja de ser «correo@ejemplo.com's Team». Es lo primero
    // que ve en el conmutador de empresas y en cada factura que imprima.
    name: (data.nombreComercial || data.razonSocial).slice(0, 100),
    onboardingPaso: 3,
    onboardingDatos: datos,
    updatedAt: new Date(),
  }).where(eq(teams.id, equipo.id));

  redirect('/bienvenida');
});

// ─── Paso 3 → 4 · De qué tamaño ─────────────────────────────────────────────

const esquemaTamano = z.object({
  tamano: z.coerce.number().int().positive('Elige una opción'),
});

export const guardarTamano = validatedAction(esquemaTamano, async (data) => {
  const equipo = await equipoActual();
  if (equipo.onboardingCompletadoEn) redirect('/dashboard');

  const previos = (equipo.onboardingDatos as Datos) ?? {};
  if (!previos.linea) redirect('/bienvenida');   // llegó sin haber pasado por el 2

  await db.update(teams).set({
    onboardingPaso: 4,
    onboardingDatos: { ...previos, tamano: data.tamano },
    updatedAt: new Date(),
  }).where(eq(teams.id, equipo.id));

  redirect('/bienvenida');
});

// ─── Paso 4 · Se cierra ─────────────────────────────────────────────────────

const esquemaFinal = z.object({
  // Obligatorio por decisión de producto. Se pide AQUÍ y no al principio: para
  // cuando llega esta pantalla ya se le enseñó su empresa y su plan, así que
  // el dato se cobra después de haber dado algo.
  telefono: z.string().trim()
    .regex(/^[\d\s()+-]{10,20}$/, 'Escribe un número de WhatsApp válido'),
});

export const terminar = validatedAction(esquemaFinal, async (data) => {
  const equipo = await equipoActual();
  if (equipo.onboardingCompletadoEn) redirect('/dashboard');

  const datos = (equipo.onboardingDatos as Datos) ?? {};
  if (!datos.linea || !datos.tamano) redirect('/bienvenida');

  const plan = planSugerido(datos.linea, datos.tamano);
  if (!plan) return { error: 'No pudimos determinar tu plan. Vuelve atrás e inténtalo de nuevo.' };

  const usuario = await getUser();
  if (usuario) {
    await db.update(users)
      .set({ telefono: data.telefono, updatedAt: new Date() })
      .where(eq(users.id, usuario.id));
  }

  const ahora = new Date();
  const finPrueba = new Date(ahora.getTime() + PRUEBA.dias * 86_400_000);

  await db.update(teams).set({
    // La CLAVE del plan, no su nombre: `getPlan()` resuelve por clave, y
    // guardar el nombre es lo que en su día dejó a cinco de ocho planes
    // cayendo a Gratis después de pagar.
    planName: plan.key,
    subscriptionStatus: 'trialing',
    trialEnd: finPrueba,
    periodoFin: finPrueba,
    onboardingPaso: 4,
    onboardingCompletadoEn: ahora,
    updatedAt: new Date(),
  }).where(eq(teams.id, equipo.id));

  redirect('/dashboard');
});
