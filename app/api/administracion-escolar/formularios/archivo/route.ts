/**
 * GET /api/administracion-escolar/formularios/archivo?key=...
 *
 * Sirve la foto o el acta que subió el padre en la ficha pública. Lo pide el
 * colegio desde la pantalla de la respuesta.
 *
 * NUNCA se emite una presigned URL: el navegador no habla con S3, esta ruta
 * valida quién pregunta y recién entonces lee. Misma regla que los comprobantes
 * de pago —ver `lib/storage/comprobantes.ts`.
 *
 * CÓMO SE EVITA QUE UN COLEGIO LEA LOS ARCHIVOS DE OTRO: la llave lleva el
 * equipo dentro (`.../team_35/pago/<uuid>.jpg`), así que se compara ese
 * segmento con el equipo de quien pregunta. Sin esa comprobación, cualquiera
 * con sesión podría pedir la llave de otro colegio — las llaves no se adivinan
 * porque llevan un UUID, pero «no se adivina» no es un control de acceso.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerComprobante, s3Disponible } from '@/lib/storage/comprobantes';

export const dynamic = 'force-dynamic';

const TIPO_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf',
};

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const key = req.nextUrl.searchParams.get('key') ?? '';

  // Forma exacta y nada más: sin `..`, sin rutas absolutas, sin comodines.
  const m = /^[a-z0-9_-]+\/team_(\d+)\/pago\/[0-9a-f-]{36}\.([a-z0-9]{2,5})$/i.exec(key);
  if (!m) {
    return NextResponse.json({ error: 'Llave inválida' }, { status: 400 });
  }
  if (Number(m[1]) !== auth.teamId) {
    // 404 y no 403: confirmar que el archivo existe pero es de otro ya sería
    // decir de más.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }
  if (!s3Disponible()) {
    return NextResponse.json({ error: 'Almacenamiento no configurado' }, { status: 503 });
  }

  try {
    const cuerpo = await leerComprobante(key);
    return new NextResponse(new Uint8Array(cuerpo), {
      headers: {
        'Content-Type': TIPO_POR_EXT[m[2].toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': String(cuerpo.length),
        // Privado: es un documento de un menor. Que no quede en cachés
        // compartidas ni en la del proxy de nadie.
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline',
      },
    });
  } catch (e) {
    console.error('[formularios/archivo] no se pudo leer:', e);
    return NextResponse.json({ error: 'No se pudo leer el archivo' }, { status: 404 });
  }
}
