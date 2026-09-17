/**
 * POST /api/compras-captura/[token] — alguien fotografía una factura y la envía.
 *
 * Ruta de escritura SIN sesión: todo lo que decide viene del token (el team se
 * lee del enlace), nunca del cuerpo. Del `FormData` solo se acepta la foto y,
 * opcional, el texto de un QR que el navegador ya decodificó.
 *
 * Lo que NO hace: registrar la compra. Guarda la foto, la interpreta (QR de la
 * DGII primero, si no IA) y deja un BORRADOR «pendiente». Alguien con sesión lo
 * revisa y lo registra desde la pantalla de compras.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { comprasCapturas } from '@/lib/db/schema';
import { resolverLinkPublico, marcarAcceso } from '@/lib/compras/captura-link';
import { validarImagen, procesarImagen, subirFoto } from '@/lib/fotos/storage';
import { parsearQrDgii, extraerConIa, type ResultadoExtraccion } from '@/lib/compras/extraer-ticket';
import { GeminiError } from '@/lib/ia/gemini-vision';

/** Lo que promete la pantalla. La foto de un móvil son varios MB. */
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Tope de capturas pendientes por enlace. Sin esto la ruta es un subidor de
 * archivos anónimo: quien tenga el token puede llenar el bucket. 30 es más que
 * lo que un negocio deja sin revisar en un día y corta el abuso.
 */
const MAX_PENDIENTES = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await resolverLinkPublico(token);
  if (!link) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

  const [{ pendientes }] = await db
    .select({ pendientes: sql<number>`COUNT(*)::int` })
    .from(comprasCapturas)
    .where(and(eq(comprasCapturas.linkId, link.linkId), eq(comprasCapturas.estado, 'pendiente')));
  if (pendientes >= MAX_PENDIENTES) {
    return NextResponse.json(
      { error: 'Hay muchas capturas esperando revisión. Pídele al negocio que las revise antes de enviar más.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'No se recibió la foto' }, { status: 400 });
  }

  const archivo = form.get('foto');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: 'Toma o adjunta una foto de la factura' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: `La foto pesa más de ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  // Valida por la cabecera, no por el Content-Type que escribe quien sube.
  const meta = await validarImagen(buffer);
  if (!meta) return NextResponse.json({ error: 'El archivo no es una imagen válida' }, { status: 415 });

  // QR primero (gratis, determinista). Si el navegador decodificó un QR de e-CF
  // con datos, no se llama a la IA.
  const qrTexto = String(form.get('qr') ?? '').trim() || null;
  let resultado: ResultadoExtraccion | null = parsearQrDgii(qrTexto);
  let origen: 'qr' | 'ia' = 'qr';

  if (!resultado) {
    origen = 'ia';
    try {
      const jpg = await procesarImagen(buffer);
      resultado = await extraerConIa(jpg.toString('base64'), 'image/jpeg');
    } catch (e) {
      if (e instanceof GeminiError) {
        const status = e.codigo === 'limite' ? 429 : e.codigo === 'timeout' ? 504 : 502;
        return NextResponse.json({ error: e.message }, { status });
      }
      console.error('[captura] fallo al interpretar la foto:', e);
      return NextResponse.json({ error: 'No se pudo interpretar la foto' }, { status: 502 });
    }
  }

  // Guardar la foto ANTES de insertar: si el almacenamiento falla, no queda una
  // fila apuntando a una imagen que no existe.
  const fotoRef = await subirFoto(buffer, `compras-captura/team_${link.teamId}/${Date.now()}`);

  const d = resultado.datos;
  const [fila] = await db.insert(comprasCapturas).values({
    teamId: link.teamId,
    linkId: link.linkId,
    fotoRef,
    origen,
    estado: 'pendiente',
    extraido: d,
    proveedorRnc: d.proveedorRnc,
    ncf: d.ncf,
    totalCents: d.totalCents,
  }).returning({ id: comprasCapturas.id });

  await marcarAcceso(link.linkId);

  // ¿Ya hay una captura de esta misma factura? Aviso, no bloqueo (quien revisa
  // decide). Solo con NCF, que es lo que identifica un comprobante.
  let duplicado = false;
  if (d.ncf) {
    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(comprasCapturas)
      .where(and(
        eq(comprasCapturas.teamId, link.teamId),
        eq(comprasCapturas.ncf, d.ncf),
        ne(comprasCapturas.id, fila.id),
        ne(comprasCapturas.estado, 'descartada'),
      ));
    duplicado = n > 0;
  }

  return NextResponse.json({
    ok: true,
    id: fila.id,
    origen,
    datos: d,
    avisos: resultado.avisos,
    duplicado,
  });
}
