import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { conClienteSigerd, respuestaSinCredenciales } from '@/lib/sigerd/sesion-auto';
import { aniosAcademicos, serviciosPorCentro } from '@/lib/sigerd/consultas';
import { contextoCentroSesion } from '@/lib/sigerd/personal';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sigerd/anios — los años académicos que ofrece EL PORTAL para este
 * centro, con el nombre que les da SIGERD.
 *
 * Existe porque la lista estaba escrita a mano en la pantalla:
 *
 *     { value: '24', label: '2025-2026' }
 *     { value: '23', label: '2024-2025' }
 *
 * Esas etiquetas son una suposición nuestra sobre qué significa cada id de
 * SIGERD. Si el portal llama «2024-2025» al id 24, el colegio elige un año y se
 * baja otro — y no hay forma de que se dé cuenta, porque la pantalla le enseña
 * nuestra etiqueta, no la suya. Aquí se devuelve lo que el portal dice.
 *
 * El catálogo cuelga de un servicio del centro (`jsonAnios?IdServicioCentro=`),
 * así que se resuelve la cadena centro → servicios → años. Se toma el primer
 * servicio: los años académicos son del centro, no de un servicio concreto.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  try {
    const r = await conClienteSigerd(auth.teamId, async (cli) => {
      const ctx = await contextoCentroSesion(cli);
      const servicios = await serviciosPorCentro(cli, { idCentro: ctx.idCentro });
      if (servicios.length === 0) return { idCentro: ctx.idCentro, anios: [] };
      const anios = await aniosAcademicos(cli, servicios[0].Id);
      return { idCentro: ctx.idCentro, anios };
    }, { verificarCookie: true });

    if (r === null) return respuestaSinCredenciales();

    return NextResponse.json({
      idCentro: r.datos.idCentro,
      // Tal como los nombra SIGERD, en su orden. El más reciente es el primero
      // en el portal, y así se enseña.
      anios: r.datos.anios.map((a) => ({ id: a.Id, nombre: a.Nombre })),
    });
  } catch (e) {
    return respuestaError(e);
  }
}
