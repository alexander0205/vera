import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { recopilarCentro, resumenArbol } from '@/lib/sigerd/sync';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { SigerdError } from '@/lib/sigerd/types';
import { sincronizarArbol } from '@/lib/administracion-escolar/sync-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Años que el listado de SIGERD ofrece hoy. Default: el más reciente. */
const ANIOS_VALIDOS = new Set([23, 24]);
const ANIO_DEFECTO = 24;

/**
 * Sincroniza el centro de la sesión SIGERD con el módulo escolar (Nivel 1).
 *
 * Body: `{ anoAcademico?, aplicar? }`
 *
 * Sin `aplicar: true` → VISTA PREVIA: recopila el árbol y calcula qué se crearía,
 * sin escribir. Con `aplicar: true` → escribe todo en una transacción.
 *
 * "Nivel 1" = estructura + lista de estudiantes (nombre). La ficha completa
 * (sexo, dirección, acta) es otro paso, en lotes. El centro NO se recibe del
 * cliente: sale de la sesión del portal.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  let body: { anoAcademico?: unknown; aplicar?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const anoAcademico = Number(body.anoAcademico) || ANIO_DEFECTO;
  const aplicar = body.aplicar === true;

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

    const arbol = await recopilarCentro(cli, { anoAcademico });
    await guardarSesion(cli.exportarSesion());

    // dryRun = !aplicar → calcula el resumen sin tocar la base.
    const resumen = await sincronizarArbol({ teamId, arbol, dryRun: !aplicar });

    return NextResponse.json({
      aplicado: aplicar,
      centro: arbol.idCentro,
      periodo: resumen.periodo.nombre,
      resumen,
      arbol: resumenArbol(arbol),
    });
  } catch (e) {
    if (e instanceof SigerdError && e.codigo === 'sesion-expirada') await borrarSesion();
    return respuestaError(e);
  }
}
