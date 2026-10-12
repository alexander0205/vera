import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { traerFichaEstudiante } from '@/lib/sigerd/ficha';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { SigerdError } from '@/lib/sigerd/types';
import {
  aplicarFichas,
  contarPendientesFicha,
  estudiantesPendientesFicha,
} from '@/lib/administracion-escolar/enriquecer-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Estudiantes por lote. Uno ≈ una petición a SIGERD; con la compuerta (350ms,
 * 3 a la vez) 40 tardan ~5s, holgado dentro del límite de la función. */
const TAM_LOTE = 40;

/**
 * Nivel 2 — completa la ficha de UN lote de estudiantes ya importados.
 *
 * `POST /api/sigerd/enriquecer`  → procesa hasta 40 pendientes y devuelve
 * cuántos quedan. El cliente vuelve a llamar hasta `restantes === 0`.
 *
 * "Pendiente" lo decide la base (código `SIGERD-%` sin fecha), no el cliente:
 * así el lote es idempotente y reanudable — si se corta a mitad, la próxima
 * llamada sigue donde quedó.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const pendientes = await estudiantesPendientesFicha(teamId, TAM_LOTE);

  if (!pendientes.length) {
    return NextResponse.json({ done: true, procesados: 0, restantes: 0, actualizados: 0 });
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

    const fichas = [];
    for (const [i, p] of pendientes.entries()) {
      try {
        const ficha = await traerFichaEstudiante(cli, p.idSigerd, { precargar: i === 0 });
        fichas.push({ estudianteId: p.estudianteId, ficha });
      } catch (e) {
        // Sesión caída corta el lote entero; una ficha rota individual se salta.
        if (e instanceof SigerdError && e.codigo === 'sesion-expirada') throw e;
        fichas.push({ estudianteId: p.estudianteId, ficha: null });
      }
    }

    await guardarSesion(cli.exportarSesion());

    const resultado = await aplicarFichas(teamId, fichas);
    const restantes = await contarPendientesFicha(teamId);

    return NextResponse.json({
      done: restantes === 0,
      procesados: pendientes.length,
      restantes,
      ...resultado,
    });
  } catch (e) {
    if (e instanceof SigerdError && e.codigo === 'sesion-expirada') await borrarSesion();
    return respuestaError(e);
  }
}

/** Cuántos faltan por enriquecer (para mostrar el total antes de empezar). */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const restantes = await contarPendientesFicha(auth.teamId);
  return NextResponse.json({ restantes });
}
