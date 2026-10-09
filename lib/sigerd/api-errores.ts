/**
 * Traducción de `SigerdError` a respuestas HTTP, para no repetir el mapeo en
 * cada route handler. El cliente recibe siempre `{ error, codigo }`, de modo
 * que la UI pueda reaccionar por código y no parseando el mensaje.
 */

import { NextResponse } from 'next/server';
import { SigerdError, type SigerdErrorCodigo } from './types';

const STATUS: Record<SigerdErrorCodigo, number> = {
  'credenciales-invalidas': 401,
  'usuario-desactivado': 403,
  rechazado: 401,
  'sesion-expirada': 401,
  'perfil-invalido': 400,
  'token-no-encontrado': 502,
  'respuesta-inesperada': 502,
  red: 504,
};

export function respuestaError(e: unknown): NextResponse {
  if (e instanceof SigerdError) {
    return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: STATUS[e.codigo] ?? 500 });
  }

  console.error('[sigerd] error no controlado:', e);
  return NextResponse.json(
    { error: 'Error interno al hablar con SIGERD.', codigo: 'desconocido' },
    { status: 500 },
  );
}
