/**
 * El correo de «te dieron acceso de administrador».
 *
 * Solo sale desde producción, como los demás avisos del sistema
 * (`correosDeVerdad` en lib/administracion-escolar/tareas.ts): una copia de la
 * base trae correos reales y una prueba en local o en un preview no puede
 * escribirle a nadie. Fuera de producción queda en el log y la pantalla lo dice.
 *
 * Nunca lanza: el cambio ya está guardado, y un correo que no sale no lo
 * deshace. Devuelve qué pasó para que la pantalla se lo cuente a quien lo hizo.
 */

import 'server-only';
import { sendAdminAccessEmail } from '@/lib/email';

export type EstadoCorreo = 'enviado' | 'fuera_de_produccion' | 'fallo';

export async function avisarAccesoDeAdministrador(
  destino: { email: string; nombre: string | null },
  opts: { token: string | null; otorgadoPor: string | null },
): Promise<EstadoCorreo> {
  if (process.env.VERCEL_ENV !== 'production') {
    console.info('[equipo-zero] correo sin enviar (fuera de producción)', { conEnlace: !!opts.token });
    return 'fuera_de_produccion';
  }
  try {
    await sendAdminAccessEmail(destino.email, destino.nombre, opts);
    return 'enviado';
  } catch (e) {
    console.error('[equipo-zero] no salió el correo:', e instanceof Error ? e.message : e);
    return 'fallo';
  }
}
