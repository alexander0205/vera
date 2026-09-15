import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones, sigerdPersonal } from '@/lib/db/schema';
import { SigerdError } from '@/lib/sigerd/types';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { conClienteSigerd, respuestaSinCredenciales } from '@/lib/sigerd/sesion-auto';
import { marcarVerificadas } from '@/lib/sigerd/credenciales';
import { invalidarSigerd } from '@/lib/cache/escolar';
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
 *   401 sin sesión SIGERD ni credenciales guardadas (`codigo: 'sin-credenciales'`)
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

  // Cookie del navegador si sigue viva y, si no, las credenciales guardadas. Antes
  // solo miraba la cookie: un colegio con las credenciales guardadas —el asistente
  // le marcaba «Conectar ✓»— recibía aquí «No hay sesión de SIGERD».
  //
  // `verificarCookie` porque `obtenerInformacion` se traga sus propios errores
  // del portal (los convierte en `estado: 'error'`): sin comprobarla antes, una
  // cookie caducada nunca daría paso a las credenciales.
  try {
    const r = await conClienteSigerd(
      auth.teamId,
      (cli) => obtenerInformacion(cli, { teamId: auth.teamId, anoAcademico }),
      { verificarCookie: true },
    );
    if (r === null) return respuestaSinCredenciales();

    // Si entró con lo guardado y terminó, las credenciales quedan probadas: no
    // tiene sentido que el paso «Conectar» siga diciendo «sin probar».
    if (r.origen === 'credenciales' && r.datos.estado === 'completado') {
      await marcarVerificadas(auth.teamId);
    }
    return NextResponse.json(r.datos);
  } catch (e) {
    if (e instanceof SyncOcupadoError) {
      return NextResponse.json({ error: e.message, codigo: e.motivo }, { status: 409 });
    }
    // Contraseña cambiada, usuario desactivado, portal caído: el mensaje del
    // portal le sirve al colegio; un «No se pudo iniciar la obtención» no.
    if (e instanceof SigerdError) return respuestaError(e);
    console.error('[sigerd/obtener] fallo al iniciar:', e);
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
  // El plan del asistente se sirve de caché por etiqueta: sin esto seguiría
  // enseñando lo que se acaba de borrar.
  invalidarSigerd(auth.teamId);

  return NextResponse.json({ ok: true });
}
