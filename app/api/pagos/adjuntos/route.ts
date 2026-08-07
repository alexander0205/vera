/**
 * GET  /api/pagos/adjuntos?docId=123 — metadata de los comprobantes de una factura.
 * POST /api/pagos/adjuntos           — sube un comprobante (multipart/form-data).
 *
 * La subida pasa SIEMPRE por aquí, nunca con un presigned PUT contra S3: es el
 * único punto donde se valida sesión, empresa, permiso, tamaño y tipo real.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { guardarAdjunto, listarAdjuntos, ArchivoInvalidoError, MAX_BYTES } from '@/lib/pagos/adjuntos';
import { rateLimitDb } from '@/lib/rate-limit';
import { logAudit, getIp } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;

  const docId = Number(req.nextUrl.searchParams.get('docId'));
  if (!Number.isInteger(docId) || docId <= 0) {
    return NextResponse.json({ error: 'docId inválido' }, { status: 400 });
  }

  return NextResponse.json({ adjuntos: await listarAdjuntos(auth.teamId, docId) });
}

export async function POST(req: NextRequest) {
  // Mismo gate que registrar el pago: quien puede cobrar puede respaldar el cobro.
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;

  // Techo por usuario. Subir archivos cuesta CPU (miniatura) y espacio en S3;
  // 30/minuto deja trabajar a una secretaria cargando comprobantes en tanda y
  // corta un script que quiera llenar el bucket. Por usuario, no por empresa,
  // para que un usuario no le corte el trabajo al resto.
  const VENTANA_SEG = 60;
  const rl = await rateLimitDb(`comprobante:${auth.user.id}`, 30, VENTANA_SEG * 1000);
  if (!rl.allowed) {
    // `resetAt` sale de SQL crudo como `timestamp` sin zona; interpretarlo como
    // hora local da diferencias de horas. Se acota a la ventana, que es el
    // máximo que puede faltar por definición.
    const crudo  = Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000);
    const faltan = Number.isFinite(crudo) ? Math.min(VENTANA_SEG, Math.max(1, crudo)) : VENTANA_SEG;
    return NextResponse.json(
      { error: 'Demasiadas subidas seguidas. Espera un momento e intenta de nuevo.' },
      { status: 429, headers: { 'Retry-After': String(faltan) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Se esperaba multipart/form-data' }, { status: 400 });
  }

  const docId = Number(form.get('docId'));
  if (!Number.isInteger(docId) || docId <= 0) {
    return NextResponse.json({ error: 'docId inválido' }, { status: 400 });
  }

  const pagoIdRaw = form.get('pagoRecibidoId');
  const pagoRecibidoId = pagoIdRaw ? Number(pagoIdRaw) : null;

  const archivo = form.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB. El máximo es 3 MB.` },
      { status: 413 },
    );
  }

  // La factura tiene que ser de esta empresa. Sin esto, cualquiera con sesión
  // podría colgarle comprobantes a documentos de otro tenant.
  const [doc] = await db
    .select({ id: ecfDocuments.id })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, auth.teamId)))
    .limit(1);
  if (!doc) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

  try {
    const meta = await guardarAdjunto({
      teamId:        auth.teamId,
      ecfDocumentId: docId,
      pagoRecibidoId,
      nombre:        archivo.name,
      buffer:        Buffer.from(await archivo.arrayBuffer()),
      subidoPor:     auth.user.id,
    });

    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
      action: 'COMPROBANTE_SUBIDO', resource: `doc:${docId}`, ip: getIp(req),
      meta: { adjuntoId: meta.id, nombre: meta.nombre, bytes: meta.tamanoBytes },
    });

    return NextResponse.json({ ok: true, adjunto: meta }, { status: 201 });
  } catch (e) {
    if (e instanceof ArchivoInvalidoError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    console.error('[POST /api/pagos/adjuntos]', e);
    return NextResponse.json({ error: 'No se pudo guardar el comprobante' }, { status: 500 });
  }
}
