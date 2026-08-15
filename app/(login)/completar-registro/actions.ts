'use server';

/**
 * Cierra el alta que empezó en Google.
 *
 * Todo lo que identifica a la persona sale del token firmado, NUNCA del
 * formulario: del POST solo se lee el checkbox. Si se leyera el correo de un
 * campo oculto, cualquiera podría abrir esta pantalla y darse de alta con el
 * correo de otro.
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';
import { redirect } from 'next/navigation';
import { hashPassword, setSession } from '@/lib/auth/session';
import { leerPendiente } from '@/lib/auth/google';
import { darDeAlta } from '@/lib/auth/alta';
import { validatedAction } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';
import { BILLING_ENABLED } from '@/lib/config/billing';

const esquema = z.object({
  t: z.string().min(1),
  terms: z.string().optional().refine(
    (v) => v === 'on',
    { message: 'Debes aceptar los Términos y Condiciones y el Tratamiento de tus datos personales.' },
  ),
});

export const completarRegistro = validatedAction(esquema, async (data) => {
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown';
  if (!rateLimit(`google-alta:${ip}`, 5, 60_000).allowed) {
    return { error: 'Demasiados intentos. Intenta en 1 minuto.' };
  }

  let pendiente;
  try {
    pendiente = await leerPendiente(data.t);
  } catch {
    // Caducó (10 minutos) o viene manipulado. En los dos casos se vuelve a
    // empezar, que cuesta un clic.
    return { error: 'La sesión con Google caducó. Vuelve a intentarlo.' };
  }

  // Quien entra por Google no elige contraseña, pero la columna es NOT NULL y
  // el resto del sistema cuenta con que ahí hay un hash. Se guarda uno de algo
  // aleatorio que nadie conoce —ni nosotros—: la cuenta queda sin contraseña
  // utilizable, y si algún día la quiere, la pone por «olvidé mi contraseña».
  const passwordHash = await hashPassword(randomBytes(32).toString('hex'));

  const alta = await darDeAlta({
    name: pendiente.nombre || pendiente.email.split('@')[0],
    email: pendiente.email,
    passwordHash,
    googleId: pendiente.googleId,
    inviteId: pendiente.inviteId,
    inviteToken: pendiente.inviteToken,
  });

  if (!alta.ok) return { error: alta.error };

  await setSession(alta.usuario);

  // Google y contraseña desembocan en el mismo sitio: el onboarding. Que dos
  // formas de registrarse acaben en pantallas distintas es como se cuelan las
  // empresas a medio configurar.
  redirect('/bienvenida');
});
