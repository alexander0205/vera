import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { guardarPendiente, guardarSesion } from '@/lib/sigerd/sesion-cookie';
import { respuestaError } from '@/lib/sigerd/api-errores';

/**
 * Paso 1 del login SIGERD: valida las credenciales que el usuario tecleó.
 *
 * Body: `{ usuario, password }`
 *
 * Respuestas:
 *   `{ estado: 'autenticado' }`                   → perfil único, sesión abierta
 *   `{ estado: 'seleccion-perfil', perfiles }`    → hay que llamar a /api/sigerd/perfil
 *
 * La contraseña se usa y se descarta: no se guarda en cookie ni en base de datos.
 * Solo sobreviven, cifradas, las cookies que emitió el portal.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  let body: { usuario?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const usuario = typeof body.usuario === 'string' ? body.usuario.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!usuario || !password) {
    return NextResponse.json(
      { error: 'Usuario y contraseña son obligatorios.', codigo: 'credenciales-invalidas' },
      { status: 400 },
    );
  }

  try {
    const cli = new SigerdClient();
    const r = await cli.iniciarSesion(usuario, password);

    if (r.estado === 'autenticado') {
      await guardarSesion(cli.exportarSesion());
      return NextResponse.json({ estado: 'autenticado', perfil: cli.perfilActivo });
    }

    // Login a medias: guardamos jar + perfiles 5 minutos. El navegador reenvía
    // la contraseña al elegir perfil; el servidor no la retiene.
    await guardarPendiente({ usuario, sesion: cli.exportarSesion(), perfiles: r.perfiles });
    return NextResponse.json({ estado: 'seleccion-perfil', perfiles: r.perfiles });
  } catch (e) {
    return respuestaError(e);
  }
}
