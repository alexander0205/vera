import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { completarDatosDesdeSigerd } from '@/lib/administracion-escolar/completar-datos-sigerd';

/**
 * «Completar datos desde SIGERD»: llena el RNE, el sexo y la fecha de
 * nacimiento de los estudiantes que ya están en Zero con lo que la descarga
 * trajo en sus fichas.
 *
 * No llama al portal: todo sale de la última descarga guardada, así que
 * responde dentro del tiempo de una función normal y repetirlo no cuesta nada.
 * Solo llena campos vacíos —lo escrito a mano no se pisa— y es idempotente.
 *
 * Escribe datos de los alumnos, de ahí el gate de escritura (suscripción viva).
 */
export async function POST() {
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:configurar', { escritura: true },
  );
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await completarDatosDesdeSigerd(auth.teamId));
  } catch (e) {
    // El detalle va al log del servidor; a la pantalla, algo que se pueda leer.
    console.error('[sigerd/completar-datos]', e);
    return NextResponse.json(
      { error: 'No se pudieron completar los datos. Lo que ya se llenó se queda; vuelve a intentarlo.' },
      { status: 500 },
    );
  }
}
