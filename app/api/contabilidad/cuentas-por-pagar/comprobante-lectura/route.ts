/**
 * POST /api/contabilidad/cuentas-por-pagar/comprobante-lectura
 *   multipart: `archivo` (PDF o imagen del comprobante de la transferencia)
 *
 * La IA lee el comprobante y devuelve una PROPUESTA (fecha, monto, referencia)
 * para rellenar el formulario de pago. No guarda el archivo ni registra nada: el
 * archivo se adjunta después, cuando el pago ya existe.
 *
 * Nunca estorba: sin IA configurada responde `lectura: null` y el pago se
 * registra a mano como siempre.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { detectarTipo, ArchivoInvalidoError } from '@/lib/pagos/adjuntos';
import { MAX_BYTES_DOCUMENTO } from '@/lib/administracion-escolar/documentos-archivo';
import { leerComprobantePagoConIa } from '@/lib/contabilidad/comprobante-pago-ia';
import { proponerDesdeLectura } from '@/lib/contabilidad/comprobante-pago-lectura';

export const dynamic = 'force-dynamic';
/** La IA puede tardar: el principal y el respaldo suman hasta 90 s. */
export const maxDuration = 100;

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  if (archivo.size > MAX_BYTES_DOCUMENTO) {
    return NextResponse.json({ error: `El archivo pesa más de ${Math.round(MAX_BYTES_DOCUMENTO / 1024 / 1024)} MB.` }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  let mime: string;
  try {
    // Por magic bytes, no por el tipo que manda el navegador.
    mime = detectarTipo(buffer).mime;
  } catch (e) {
    if (e instanceof ArchivoInvalidoError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  try {
    const lectura = await leerComprobantePagoConIa({ buffer, mime }, auth.teamId);
    return NextResponse.json({ lectura, propuesta: proponerDesdeLectura(lectura) });
  } catch (e) {
    // Leerlo es una ayuda, no un requisito: el pago sigue a mano.
    console.error('[comprobante-lectura] no se pudo leer', e instanceof Error ? e.message : e);
    return NextResponse.json({ lectura: null, propuesta: proponerDesdeLectura(null), aviso: 'No se pudo leer el comprobante. Escribe los datos a mano.' });
  }
}
