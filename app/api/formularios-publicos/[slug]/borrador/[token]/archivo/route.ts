/**
 * POST /api/formularios-publicos/[slug]/borrador/[token]/archivo
 *
 * El padre sube la foto 2×2 o el acta desde el formulario público. No hay
 * sesión: **el token del enlace es la única credencial**, igual que en el resto
 * de `formularios-publicos`. Se busca por token y se comprueba que el borrador
 * sea de ESTE formulario — un token de otro colegio no sube aquí.
 *
 * POR QUÉ NO HAY PRESIGNED URL. El renderer venía del CRM pidiendo una
 * `uploadUrl` para hacer un PUT contra S3 desde el navegador. Aquí eso no se
 * hace, por lo mismo que está escrito en `lib/storage/comprobantes.ts`: un PUT
 * firmado entrega capacidad de escritura saltándose la validación de tipo y de
 * tamaño. El archivo pasa por aquí, se mira, y recién entonces se guarda.
 *
 * EL TOPE ES 4 MB Y NO 15, y no es un capricho: el cuerpo de una petición a una
 * función de Vercel se corta en 4.5 MB. Prometer 15 MB era prometer un fallo.
 * Las imágenes se encogen en el navegador antes de llegar (ver
 * `FormularioRenderer`), así que una foto de teléfono entra de sobra; lo que
 * puede toparse es un PDF escaneado, y para eso el mensaje lo dice claro.
 *
 * Lo que se devuelve es la LLAVE, nunca una URL: el archivo se sirve después
 * por una ruta que valida quién lo pide.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularioRespuestas, adminEscolarFormularios } from '@/lib/db/schema';
import { construirKey, s3Disponible, subirComprobante } from '@/lib/storage/comprobantes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** El techo real de Vercel es 4.5 MB; se deja margen para el sobre multipart. */
const MAX_BYTES = 4 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'application/pdf': 'pdf',
};

interface Ctx { params: Promise<{ slug: string; token: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug, token } = await params;

  const [borrador] = await db
    .select({
      id: adminEscolarFormularioRespuestas.id,
      teamId: adminEscolarFormularioRespuestas.teamId,
      estado: adminEscolarFormularioRespuestas.estado,
    })
    .from(adminEscolarFormularioRespuestas)
    .innerJoin(
      adminEscolarFormularios,
      eq(adminEscolarFormularios.id, adminEscolarFormularioRespuestas.formularioId),
    )
    .where(and(
      eq(adminEscolarFormularioRespuestas.token, token),
      eq(adminEscolarFormularios.slug, slug),
    ))
    .limit(1);

  if (!borrador) {
    return NextResponse.json({ error: 'Este enlace ya no es válido.' }, { status: 404 });
  }
  // Una ficha ya enviada no admite archivos nuevos: si no, se le podría cambiar
  // el acta a una inscripción que el colegio ya revisó.
  if (borrador.estado && borrador.estado !== 'borrador') {
    return NextResponse.json({ error: 'Esta ficha ya fue enviada.' }, { status: 409 });
  }

  if (!s3Disponible()) {
    return NextResponse.json(
      { error: 'El colegio todavía no tiene el almacenamiento configurado. Avísele para poder adjuntar archivos.' },
      { status: 503 },
    );
  }

  let archivo: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('archivo');
    if (f instanceof File) archivo = f;
  } catch {
    // Cuerpo demasiado grande o malformado. Es el caso más probable de fallo
    // real, así que el mensaje habla de tamaño y no de «formato inválido».
    return NextResponse.json(
      { error: `El archivo es muy grande. El máximo son ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  if (!archivo) {
    return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  const ext = TIPOS[archivo.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF.' },
      { status: 415 },
    );
  }

  try {
    const key = construirKey(borrador.teamId, ext);
    await subirComprobante(key, Buffer.from(await archivo.arrayBuffer()), archivo.type);
    return NextResponse.json({
      key,
      nombre: archivo.name,
      tipo: archivo.type,
      size: archivo.size,
    });
  } catch (e) {
    console.error('[formulario/archivo] no se pudo guardar:', e);
    return NextResponse.json(
      { error: 'No se pudo guardar el archivo. Inténtelo otra vez.' },
      { status: 500 },
    );
  }
}
