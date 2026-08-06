import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { descargarTodo } from '@/lib/sigerd/descargar';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { SigerdError } from '@/lib/sigerd/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ANIOS_VALIDOS = new Set([23, 24]);
const ANIO_DEFECTO = 24;

/**
 * Descarga completa y de SOLO LECTURA del centro de la sesión SIGERD.
 *
 * `POST /api/sigerd/descargar`  { anoAcademico?, personal? }
 *
 * Devuelve estructura + estudiantes + personal en un JSON. NO escribe en la
 * base. Las fichas de 29 campos por estudiante NO entran aquí (son ~700
 * peticiones); van por el flujo en lotes.
 *
 * El centro sale de la sesión del portal, no del cliente.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  let body: { anoAcademico?: unknown; personal?: unknown; condicionFinal?: unknown; fichaPersonal?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const anoAcademico = Number(body.anoAcademico) || ANIO_DEFECTO;
  const conPersonal = body.personal !== false;
  const conCondicionFinal = body.condicionFinal === true;
  const conFichaPersonal = body.fichaPersonal === true;

  if (!ANIOS_VALIDOS.has(anoAcademico)) {
    return NextResponse.json(
      { error: `Año académico inválido. Válidos: ${[...ANIOS_VALIDOS].join(', ')}.`, codigo: 'parametro-invalido' },
      { status: 400 },
    );
  }

  const sesion = await leerSesion();
  if (!sesion) {
    return NextResponse.json(
      { error: 'No hay sesión de SIGERD. Conecta tu cuenta del portal primero.', codigo: 'sesion-expirada' },
      { status: 401 },
    );
  }

  try {
    const cli = SigerdClient.desdeSesion(sesion);
    const dump = await descargarTodo(cli, { anoAcademico, conPersonal, conCondicionFinal, conFichaPersonal });
    await guardarSesion(cli.exportarSesion());

    return NextResponse.json({ generadoEn: new Date().toISOString(), dump });
  } catch (e) {
    if (e instanceof SigerdError && e.codigo === 'sesion-expirada') await borrarSesion();
    return respuestaError(e);
  }
}
