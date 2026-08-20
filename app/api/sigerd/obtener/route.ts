import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones, sigerdPersonal } from '@/lib/db/schema';
import { SigerdClient } from '@/lib/sigerd/client';
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { SigerdError } from '@/lib/sigerd/types';
import {
  estadoObtencion,
  obtenerInformacion,
  SyncOcupadoError,
} from '@/lib/administracion-escolar/obtener-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ANIO_DEFECTO = 24;
const ANIOS_VALIDOS = new Set([23, 24]);

/** Estado de la última obtención del colegio (para la UI). */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await estadoObtencion(auth.teamId));
}

/**
 * "Obtener información": trae todo el centro de SIGERD y lo guarda en la DB.
 *
 * Body: `{ anoAcademico? }`
 *
 * Respuestas:
 *   200 `{ estado:'completado', … }`
 *   200 `{ estado:'error', mensaje }`           (SIGERD caído — reintentar luego)
 *   409 `{ codigo:'ya-corriendo' | 'otra-en-curso', error }`  (candado)
 *   401 sin sesión SIGERD
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  let body: { anoAcademico?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const anoAcademico = Number(body.anoAcademico) || ANIO_DEFECTO;
  if (!ANIOS_VALIDOS.has(anoAcademico)) {
    return NextResponse.json({ error: 'Año académico inválido.', codigo: 'parametro-invalido' }, { status: 400 });
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
    const resultado = await obtenerInformacion(cli, { teamId: auth.teamId, anoAcademico });
    // Refresca la cookie de sesión (el portal rota el antiforgery token).
    await guardarSesion(cli.exportarSesion());
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof SyncOcupadoError) {
      return NextResponse.json({ error: e.message, codigo: e.motivo }, { status: 409 });
    }
    if (e instanceof SigerdError && e.codigo === 'sesion-expirada') await borrarSesion();
    return NextResponse.json(
      { error: 'No se pudo iniciar la obtención.', codigo: 'error' },
      { status: 500 },
    );
  }
}

/**
 * Borra los datos que se bajaron de SIGERD para este colegio (el snapshot
 * `sigerd_importaciones` + el mirror `sigerd_personal`). No toca SIGERD ni el
 * módulo escolar; solo limpia lo guardado aquí.
 */
export async function DELETE() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  await db.transaction(async (tx) => {
    await tx.delete(sigerdPersonal).where(eq(sigerdPersonal.teamId, auth.teamId));
    await tx.delete(sigerdImportaciones).where(eq(sigerdImportaciones.teamId, auth.teamId));
  });

  return NextResponse.json({ ok: true });
}
