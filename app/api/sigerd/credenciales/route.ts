import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  guardarCredenciales, leerCredenciales, olvidarCredenciales,
} from '@/lib/sigerd/credenciales';

/**
 * Credenciales de SIGERD del colegio.
 *
 * De escritura, no de consulta: se pueden poner y borrar, y se puede preguntar
 * SI hay, pero la contraseña no vuelve nunca. Es la misma forma en que Vercel
 * trata sus variables cifradas, y por la misma razón: un endpoint que devuelve
 * el secreto convierte cualquier fallo de permisos en una fuga.
 *
 * Solo quien puede configurar el módulo escolar las toca. No basta con ver.
 */

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const c = await leerCredenciales(auth.teamId);
  return NextResponse.json({
    configurado: c != null,
    // `usuario` sí sale: es una cédula que el portal enseña en su propia
    // pantalla, y sin ella el colegio no sabe con qué cuenta quedó conectado.
    usuario: c?.usuario ?? null,
    centroNombre: c?.centroNombre ?? null,
    verificadoEn: c?.verificadoEn ?? null,
    ultimoError: c?.ultimoError ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const { usuario, clave } = await req.json().catch(() => ({}));
  if (typeof usuario !== 'string' || !usuario.trim()) {
    return NextResponse.json({ error: 'Falta el usuario (cédula).' }, { status: 400 });
  }
  if (typeof clave !== 'string' || !clave) {
    return NextResponse.json({ error: 'Falta la contraseña.' }, { status: 400 });
  }

  try {
    await guardarCredenciales(auth.teamId, usuario, clave);
  } catch {
    // El mensaje real puede nombrar la variable de entorno que falta; eso va al
    // log del servidor, no a la pantalla del colegio.
    return NextResponse.json(
      { error: 'No se pudieron guardar. Falta configurar el cifrado en el servidor.' },
      { status: 500 },
    );
  }

  // Sin `verificadoEn`: todavía no las ha probado nadie contra el portal.
  return NextResponse.json({ ok: true, configurado: true, verificado: false });
}

export async function DELETE() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  const habia = await olvidarCredenciales(auth.teamId);
  // Lo ya importado se queda: esto solo quita el poder reconectar solo.
  return NextResponse.json({ ok: true, habia });
}
