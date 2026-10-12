/**
 * Plomería compartida de las rutas `/api/sigerd/*`.
 *
 * Cada consulta necesita lo mismo: recuperar la sesión cifrada del usuario,
 * levantar un cliente, ejecutar, refrescar la cookie (el portal rota el
 * antiforgery token) y traducir los errores. Esto lo centraliza para que cada
 * route handler sea una línea.
 */

import { NextResponse } from 'next/server';
import { SigerdClient } from './client';
import { respuestaError } from './api-errores';
import { borrarSesion, guardarSesion, leerSesion } from './sesion-cookie';
import { SigerdError } from './types';

/**
 * Ejecuta `fn` con la sesión SIGERD del usuario actual.
 *
 * Responde `{ datos }` en éxito. Si la sesión del portal caducó, borra la
 * cookie local para que la UI vuelva a pedir credenciales en vez de reintentar
 * contra una sesión muerta.
 */
export async function conSesionSigerd<T>(fn: (cli: SigerdClient) => Promise<T>): Promise<NextResponse> {
  const sesion = await leerSesion();
  if (!sesion) {
    return NextResponse.json(
      { error: 'No hay sesión de SIGERD. Conecta tu cuenta del portal primero.', codigo: 'sesion-expirada' },
      { status: 401 },
    );
  }

  try {
    const cli = SigerdClient.desdeSesion(sesion);
    const datos = await fn(cli);
    await guardarSesion(cli.exportarSesion());
    return NextResponse.json({ datos });
  } catch (e) {
    if (e instanceof SigerdError && e.codigo === 'sesion-expirada') await borrarSesion();
    return respuestaError(e);
  }
}

/**
 * Lee un parámetro numérico obligatorio. Devuelve `null` si falta o no es un
 * número: el llamador responde 400 con un mensaje que nombra el parámetro.
 */
export function numero(sp: URLSearchParams, nombre: string): number | null {
  const crudo = sp.get(nombre);
  if (crudo === null || crudo.trim() === '') return null;

  const n = Number(crudo);
  return Number.isFinite(n) ? n : null;
}

export function faltaParametro(nombre: string): NextResponse {
  return NextResponse.json(
    { error: `Falta el parámetro numérico "${nombre}".`, codigo: 'parametro-invalido' },
    { status: 400 },
  );
}
