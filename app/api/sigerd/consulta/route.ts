import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { guardarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { respuestaError } from '@/lib/sigerd/api-errores';

export const dynamic = 'force-dynamic';

/**
 * Consulta de solo lectura contra el portal, usando la sesión SIGERD del
 * usuario actual.
 *
 * `GET /api/sigerd/consulta?ruta=/Estudiante/Index&formato=html|json`
 *
 * Restricciones deliberadas:
 *  - Solo GET, y solo rutas del propio portal (empiezan por `/`, sin host).
 *  - Se rechaza cualquier ruta que huela a escritura o borrado: esta puerta es
 *    para leer, nunca para modificar datos en SIGERD.
 *
 * Existe para poder mapear el portal y para consultas puntuales. Las consultas
 * estables deben tener su propio endpoint tipado en vez de pasar por aquí.
 */
const RUTAS_PROHIBIDAS =
  /(eliminar|delete|borrar|remove|anular|desactivar|inactivar|guardar|save|crear|create|nuevo|new|editar|edit|update|actualizar|insertar|aprobar|rechazar|logoff|logout|salir|reset)/i;

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const ruta = req.nextUrl.searchParams.get('ruta') ?? '';
  const formato = req.nextUrl.searchParams.get('formato') === 'json' ? 'json' : 'html';

  // Solo rutas relativas del portal: corta redirecciones a hosts ajenos.
  if (!ruta.startsWith('/') || ruta.startsWith('//')) {
    return NextResponse.json({ error: 'La ruta debe empezar por "/" y ser del portal.' }, { status: 400 });
  }
  if (RUTAS_PROHIBIDAS.test(ruta)) {
    return NextResponse.json(
      { error: 'Esta puerta es de solo lectura; la ruta pedida parece de escritura.' },
      { status: 403 },
    );
  }

  const sesion = await leerSesion();
  if (!sesion) {
    return NextResponse.json(
      { error: 'No hay sesión de SIGERD. Inicia sesión en el portal primero.', codigo: 'sesion-expirada' },
      { status: 401 },
    );
  }

  try {
    const cli = SigerdClient.desdeSesion(sesion);
    const datos = formato === 'json' ? await cli.json(ruta) : await cli.html(ruta);

    // El portal rota el antiforgery token: refrescamos la cookie para no perderlo.
    await guardarSesion(cli.exportarSesion());

    return NextResponse.json({ ruta, formato, datos });
  } catch (e) {
    return respuestaError(e);
  }
}
