import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { guardarSesion, leerPendiente } from '@/lib/sigerd/sesion-cookie';
import { respuestaError } from '@/lib/sigerd/api-errores';

/**
 * Paso 2 del login SIGERD: fija el centro/rol elegido y cierra la sesión.
 *
 * Body: `{ perfilId, password }`
 *
 * El `perfilId` se valida contra la lista que devolvió el propio portal (viaja
 * cifrada en la cookie `sigerd_pendiente`), no contra lo que mande el cliente.
 * La contraseña la reenvía el navegador porque el portal la exige en el submit
 * final del formulario; el servidor la descarta al terminar.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  let body: { perfilId?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const perfilId = typeof body.perfilId === 'string' ? body.perfilId : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!perfilId || !password) {
    return NextResponse.json({ error: 'Perfil y contraseña son obligatorios.' }, { status: 400 });
  }

  const pendiente = await leerPendiente();
  if (!pendiente) {
    return NextResponse.json(
      { error: 'El login caducó. Vuelve a introducir tus credenciales.', codigo: 'sesion-expirada' },
      { status: 401 },
    );
  }

  const perfil = pendiente.perfiles.find((p) => p.id === perfilId);
  if (!perfil) {
    return NextResponse.json(
      { error: 'Ese perfil no pertenece a la sesión en curso.', codigo: 'perfil-invalido' },
      { status: 400 },
    );
  }

  try {
    const cli = SigerdClient.reanudarSeleccion(pendiente.sesion, pendiente.usuario, password);
    await cli.seleccionarPerfil(perfil);
    await guardarSesion(cli.exportarSesion());

    return NextResponse.json({ estado: 'autenticado', perfil });
  } catch (e) {
    return respuestaError(e);
  }
}
