import { NextResponse } from 'next/server';
import { SigerdClient } from './client';
import { respuestaError } from './api-errores';
import { borrarSesion, guardarSesion, leerSesion } from './sesion-cookie';
import { conCredenciales, marcarVerificadas, marcarFallo } from './credenciales';
import { SigerdError, type SigerdPerfil } from './types';

/**
 * Un cliente de SIGERD con sesión, venga de donde venga.
 *
 * El colegio guarda su usuario y contraseña cifrados (`sigerd_credenciales`)
 * precisamente para no tener que reconectarse a mano. El orden importa:
 *
 *   1. Cookie viva  → se reutiliza. Es lo más barato: cero viajes de login.
 *   2. Sin cookie   → se entra con lo guardado y se deja la cookie puesta,
 *                     así la siguiente consulta vuelve a caer en el caso 1.
 *   3. Sin nada     → `null`, para que quien llama diga «guarda tus
 *                     credenciales» en vez de un error genérico.
 *
 * Devuelve los datos crudos y LANZA los errores del portal. Existe aparte de
 * `conSesionSigerdAuto` —que envuelve esto en una respuesta HTTP— porque la
 * obtención completa y la prueba de conexión necesitan tratar el resultado y
 * los errores a su manera: la obtención tiene su candado (409) y la prueba
 * anota en la ficha si el portal aceptó las credenciales.
 *
 * Antes solo existía la versión HTTP, y `/api/sigerd/obtener` y
 * `/api/sigerd/sesion` miraban únicamente la cookie del navegador. Resultado: un
 * colegio con las credenciales guardadas veía «Conectar ✓» en el asistente y
 * luego «No hay sesión de SIGERD» al pedir los datos.
 *
 * La contraseña nunca sale de `conCredenciales`: entra al cliente y se
 * descarta. No se registra, no se devuelve, no viaja al navegador.
 */
export async function conClienteSigerd<T>(
  teamId: number,
  fn: (cli: SigerdClient) => Promise<T>,
  opts: {
    /**
     * Ignorar la cookie y entrar con lo guardado. Para PROBAR las credenciales:
     * una cookie abierta a mano no demuestra que la contraseña guardada sirva.
     */
    soloCredenciales?: boolean;
    /**
     * Comprobar la cookie contra el portal antes de usarla (un viaje extra).
     * Para operaciones que se tragan sus propios errores —la obtención completa
     * convierte cualquier fallo del portal en «SIGERD no está disponible»—: sin
     * esto, una cookie caducada nunca llegaría a probar con las credenciales.
     */
    verificarCookie?: boolean;
  } = {},
): Promise<{ datos: T; origen: 'cookie' | 'credenciales'; perfil: SigerdPerfil | null } | null> {
  // 1 · La cookie del usuario, si sigue viva.
  if (!opts.soloCredenciales) {
    const guardada = await leerSesion();
    if (guardada) {
      const cli = SigerdClient.desdeSesion(guardada);
      let viva = true;
      if (opts.verificarCookie) {
        viva = await cli.estaAutenticado();
      }
      if (viva) {
        try {
          const datos = await fn(cli);
          const sesion = cli.exportarSesion();
          await guardarSesion(sesion);
          return { datos, origen: 'cookie', perfil: sesion.perfil };
        } catch (e) {
          // Solo la sesión caducada justifica reintentar con credenciales. Un
          // fallo del portal o de la consulta se propaga: reintentar lo
          // repetiría igual.
          if (!(e instanceof SigerdError && e.codigo === 'sesion-expirada')) throw e;
        }
      }
      await borrarSesion();
    }
  }

  // 2 · Entrar con lo guardado. El resultado va envuelto para distinguir «no hay
  // credenciales» (null) de una operación que devuelve null por sí misma.
  const envuelto = await conCredenciales(teamId, async (usuario, clave) => {
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
    const sesion = cli.exportarSesion();
    await guardarSesion(sesion);
    return { datos, perfil: sesion.perfil };
  });

  // 3 · No hay credenciales guardadas.
  if (envuelto === null) return null;
  return { datos: envuelto.datos, origen: 'credenciales', perfil: envuelto.perfil };
}

/** Respuesta estándar cuando no hay ni cookie ni credenciales. */
export function respuestaSinCredenciales(): NextResponse {
  return NextResponse.json(
    {
      error: 'Este colegio no tiene guardadas sus credenciales de SIGERD. Guárdalas en Configuración → SIGERD.',
      codigo: 'sin-credenciales',
    },
    { status: 401 },
  );
}

/**
 * `conClienteSigerd` como respuesta HTTP: `{ datos, origen }`, o el error del
 * portal traducido por `respuestaError`.
 *
 * Antes, un fallo al entrar con las credenciales guardadas —contraseña
 * cambiada, usuario desactivado— no pasaba por `respuestaError`: se escapaba
 * del handler como excepción y la pantalla recibía un 500 sin cuerpo en vez de
 * «Usuario o contraseña no válidos».
 */
export async function conSesionSigerdAuto<T>(
  teamId: number,
  fn: (cli: SigerdClient) => Promise<T>,
): Promise<NextResponse> {
  try {
    const r = await conClienteSigerd(teamId, fn);
    if (r === null) return respuestaSinCredenciales();
    return NextResponse.json({ datos: r.datos, origen: r.origen });
  } catch (e) {
    return respuestaError(e);
  }
}

/**
 * Prueba las credenciales GUARDADAS contra el portal y deja anotado el
 * resultado en la ficha: `verificado_en` y el centro si entró, `ultimo_error`
 * si no.
 *
 * Es lo que faltaba para que «Conectar» signifique algo. Las credenciales se
 * guardaban y nadie las probaba nunca: en producción las tres empresas que las
 * tenían seguían «sin probar contra el portal». La función que debía anotarlo
 * existía (`conSesionSigerdAnotando`) pero ninguna ruta la llamaba; esta la
 * sustituye, entra SOLO con lo guardado —no con la cookie— y además averigua el
 * centro, que es la pregunta que se hace el colegio: ¿esta cédula es de mi
 * centro?
 *
 * El código del centro sale siempre de la sesión. El NOMBRE solo cuando la
 * cuenta tiene varios perfiles: con uno solo el portal entra directo y no lo
 * dice.
 */
export async function probarCredencialesSigerd(
  teamId: number,
): Promise<{ idCentro: number; nombreCentro: string | null } | null> {
  const { contextoCentroSesion } = await import('./personal');
  try {
    const r = await conClienteSigerd(teamId, (cli) => contextoCentroSesion(cli), { soloCredenciales: true });
    if (r === null) return null;

    const centro = {
      idCentro: r.datos.idCentro,
      nombreCentro: r.perfil?.nombreCentro ?? null,
    };
    await marcarVerificadas(teamId, { idCentro: centro.idCentro, nombre: centro.nombreCentro });
    return centro;
  } catch (e) {
    await marcarFallo(
      teamId,
      e instanceof SigerdError ? e.message : 'No se pudo hablar con el portal.',
    );
    throw e;
  }
}
