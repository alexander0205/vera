'use server';

/**
 * Reenviar el enlace de verificación.
 *
 * Con tope propio y aparte del de la ruta de API: esta pantalla es un botón a
 * un clic de distancia, y sin freno alguien impaciente puede mandarse ocho
 * correos en diez segundos. Ocho correos iguales en la bandeja de alguien es
 * lo que hace que el proveedor nos marque como spam.
 */

import { getUser } from '@/lib/db/queries';
import { mandarVerificacion } from '@/lib/auth/verificacion';
import { rateLimit } from '@/lib/rate-limit';
import type { ActionState } from '@/lib/auth/middleware';

export async function reenviarVerificacion(): Promise<ActionState> {
  const user = await getUser();
  if (!user) return { error: 'Tu sesión caducó. Vuelve a entrar.' };

  if (user.emailVerified) {
    return { success: 'Tu correo ya está verificado. Recarga la página.' };
  }

  if (!rateLimit(`reenvio-verif:${user.id}`, 3, 5 * 60_000).allowed) {
    return { error: 'Ya te mandamos varios. Espera unos minutos antes de pedir otro.' };
  }

  const salio = await mandarVerificacion(user);

  return salio
    ? { success: 'Listo, te lo mandamos otra vez.' }
    // Se dice que falló en vez de mentir con un «enviado»: si el correo no
    // sale, quien lo está esperando merece saber que no viene en camino.
    : { error: 'No pudimos enviarlo. Inténtalo en un momento o escríbenos.' };
}
