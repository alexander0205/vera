/**
 * El corte de escritura: lo que impide que una empresa sin plan siga creando.
 *
 * Va en las rutas que CREAN VALOR — emitir un comprobante, cerrar una venta,
 * matricular a un estudiante, sumar un usuario — y no en las que solo miran o
 * ajustan una preferencia. Alguien en solo-lectura tiene que poder entrar,
 * consultar su cartera, sacar sus reportes y bajarse su información; lo que no
 * puede es seguir facturando sin pagar.
 *
 * Deliberadamente NO va en el proxy: gatear ahí todos los POST significaría
 * una consulta a la base por request para cubrir de paso los cambios de
 * contraseña y los toggles de configuración, que no le cuestan nada a nadie.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { getSuscripcion } from '@/lib/suscripcion/queries';

/** Código que la UI reconoce para abrir el diálogo de plan en vez de un toast. */
export const CODIGO_SIN_PLAN = 'SUSCRIPCION_SOLO_LECTURA';

/**
 * Devuelve una respuesta 402 si la empresa no puede escribir, o null si puede.
 *
 * 402 Payment Required y no 403: el 403 dice "no eres tú", y aquí sí es él —
 * lo que falta es el pago. La diferencia importa para el cliente que ve el
 * error y para nosotros leyendo los logs.
 *
 *   const bloqueo = await bloquearSiSoloLectura(teamId);
 *   if (bloqueo) return bloqueo;
 */
export async function bloquearSiSoloLectura(
  teamId: number,
): Promise<NextResponse | null> {
  const sus = await getSuscripcion(teamId);
  if (sus.puedeEscribir) return null;

  return NextResponse.json(
    {
      error: sus.mensaje ?? 'Tu empresa no tiene un plan activo.',
      code: CODIGO_SIN_PLAN,
      estado: sus.estado,
    },
    { status: 402 },
  );
}

/**
 * Igual, para Server Actions y sitios sin NextResponse: lanza en vez de
 * devolver. El mensaje sale tal cual al usuario, así que se escribe pensando
 * en que lo lea él y no nosotros.
 */
export async function exigirEscritura(teamId: number): Promise<void> {
  const sus = await getSuscripcion(teamId);
  if (sus.puedeEscribir) return;
  throw new Error(sus.mensaje ?? 'Tu empresa no tiene un plan activo.');
}
