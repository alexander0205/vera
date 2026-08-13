import { NextResponse } from 'next/server';
import { SigerdClient } from './client';
import { respuestaError } from './api-errores';
import { borrarSesion, guardarSesion, leerSesion } from './sesion-cookie';
import { conCredenciales, marcarVerificadas, marcarFallo } from './credenciales';
import { SigerdError } from './types';

/**
 * Como `conSesionSigerd`, pero capaz de entrar solo.
 *
 * El colegio guarda su usuario y contraseña cifrados (`sigerd_credenciales`)
 * precisamente para no tener que reconectarse a mano. Hasta ahora nadie los
 * usaba: `conSesionSigerd` solo miraba la cookie del navegador, así que una
 * secretaria que abría el buscador se topaba con "conecta tu cuenta del portal"
 * aunque las credenciales llevaran semanas guardadas.
 *
 * El orden importa:
 *   1. Cookie viva  → se reutiliza. Es lo más barato: cero viajes de login.
 *   2. Sin cookie   → se entra con lo guardado y se deja la cookie puesta,
 *                     así la siguiente consulta vuelve a caer en el caso 1.
 *   3. Sin nada     → 401 con `codigo: 'sin-credenciales'`, para que la
 *                     pantalla sepa mandar al usuario a Configuración → SIGERD
 *                     en vez de enseñar un error genérico.
 *
 * La contraseña nunca sale de `conCredenciales`: entra al cliente y se
 * descarta. No se registra, no se devuelve, no viaja al navegador.
 */
export async function conSesionSigerdAuto<T>(
  teamId: number,
  fn: (cli: SigerdClient) => Promise<T>,
): Promise<NextResponse> {
  // 1 · La cookie del usuario, si sigue viva.
  const guardada = await leerSesion();
  if (guardada) {
    try {
      const cli = SigerdClient.desdeSesion(guardada);
      const datos = await fn(cli);
      await guardarSesion(cli.exportarSesion());
      return NextResponse.json({ datos, origen: 'cookie' });
    } catch (e) {
      // Solo la sesión caducada justifica reintentar con credenciales. Un fallo
      // del portal o de la consulta se propaga: reintentar lo repetiría igual.
      if (!(e instanceof SigerdError && e.codigo === 'sesion-expirada')) {
        return respuestaError(e);
      }
      await borrarSesion();
    }
  }

  // 2 · Entrar con lo guardado.
  const resultado = await conCredenciales(teamId, async (usuario, clave) => {
    const cli = new SigerdClient();
    const login = await cli.iniciarSesion(usuario, clave);

    // El portal puede pedir perfil cuando la cuenta tiene varios roles. Se toma
    // el primero: en una cuenta de centro es el del propio centro. Si algún
    // colegio tuviera varios, habrá que dejar elegir y guardar la elección —
    // adivinar en silencio sería peor que preguntar.
    if (login.estado === 'seleccion-perfil') {
      const elegido = login.perfiles[0];
      if (!elegido) {
        throw new SigerdError('sesion-expirada', 'El portal no ofreció ningún perfil para esta cuenta.');
      }
      await cli.seleccionarPerfil(elegido);
    }

    const datos = await fn(cli);
    await guardarSesion(cli.exportarSesion());
    return datos;
  });

  // 3 · No hay credenciales guardadas.
  if (resultado === null) {
    return NextResponse.json(
      {
        error: 'Este colegio no tiene guardadas sus credenciales de SIGERD. Guárdalas en Configuración → SIGERD.',
        codigo: 'sin-credenciales',
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ datos: resultado, origen: 'credenciales' });
}

/**
 * Envoltura de `conSesionSigerdAuto` que además deja anotado en la ficha de
 * credenciales si el portal las aceptó o por qué las rechazó.
 *
 * Va aparte porque escribe en la base, y no toda consulta quiere pagar eso. Se
 * usa donde el resultado del login es la información útil (probar la conexión),
 * no donde solo se quiere consultar.
 */
export async function conSesionSigerdAnotando<T>(
  teamId: number,
  fn: (cli: SigerdClient) => Promise<T>,
): Promise<NextResponse> {
  const res = await conSesionSigerdAuto(teamId, fn);
  if (res.ok) {
    await marcarVerificadas(teamId);
  } else {
    const cuerpo = await res.clone().json().catch(() => ({}));
    if (cuerpo?.codigo !== 'sin-credenciales') {
      await marcarFallo(teamId, String(cuerpo?.error ?? 'El portal rechazó la conexión.'));
    }
  }
  return res;
}
