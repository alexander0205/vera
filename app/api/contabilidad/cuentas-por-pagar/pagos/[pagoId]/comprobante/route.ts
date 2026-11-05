/**
 * GET    /api/contabilidad/cuentas-por-pagar/pagos/[pagoId]/comprobante — sirve el binario
 * POST   …/comprobante — adjunta (o reemplaza) el comprobante del pago
 *          multipart: `archivo`, y opcional `lectura` (JSON de lo que la IA leyó)
 * DELETE …/comprobante — lo quita
 *
 * El binario sale por aquí y solo por aquí (nunca presigned URL de S3), y solo
 * con sesión válida de la empresa dueña del pago.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { ArchivoInvalidoError } from '@/lib/pagos/adjuntos';
import {
  adjuntarComprobantePago, borrarComprobantePago, leerComprobantePago, ComprobantePagoError,
} from '@/lib/contabilidad/comprobante-pago';
import { limpiarLecturaPago } from '@/lib/contabilidad/comprobante-pago-lectura';

export const dynamic = 'force-dynamic';

function idDe(params: { pagoId: string }): number | null {
  const id = Number(params.pagoId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pagoId: string }> }) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const pagoId = idDe(await params);
  if (!pagoId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let arch;
  try {
    arch = await leerComprobantePago(auth.teamId, pagoId);
  } catch (e) {
    console.error(`[GET comprobante de pago ${pagoId}]`, e);
    return NextResponse.json({ error: 'No se pudo leer el comprobante' }, { status: 502 });
  }
  if (!arch) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(arch.buffer), {
    headers: {
      'Content-Type': arch.mime,
      'Content-Disposition': `inline; filename="${arch.nombre.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, max-age=86400, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Cookie',
      'Content-Length': String(arch.buffer.length),
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pagoId: string }> }) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const pagoId = idDe(await params);
  if (!pagoId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });

  // La lectura la manda la pantalla (ya la leyó al elegir el archivo): se vuelve
  // a limpiar porque viene del cliente. Es solo información, no mueve nada.
  let lectura = null;
  const crudo = form?.get('lectura');
  if (typeof crudo === 'string' && crudo.length < 5000) {
    try {
      const j = JSON.parse(crudo) as Record<string, unknown>;
      const pesos = (c: unknown) => (typeof c === 'number' ? c / 100 : null);
      lectura = limpiarLecturaPago({
        esComprobante: j.esComprobante !== false,
        monto: pesos(j.montoCentavos), impuesto: pesos(j.impuestoCentavos),
        fecha: j.fecha, referencia: j.referencia, idTransaccion: j.idTransaccion,
        bancoOrigen: j.bancoOrigen, beneficiario: j.beneficiario, confianza: j.confianza,
      }, typeof j.modelo === 'string' ? j.modelo.slice(0, 80) : 'desconocido');
    } catch { lectura = null; }
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const resumen = await adjuntarComprobantePago({
      teamId: auth.teamId, pagoId, buffer, nombreOriginal: archivo.name, lectura, subidoPor: auth.user.id,
    });
    return NextResponse.json({ comprobante: resumen }, { status: 201 });
  } catch (e) {
    if (e instanceof ArchivoInvalidoError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ComprobantePagoError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[POST comprobante de pago ${pagoId}]`, e);
    return NextResponse.json({ error: 'No se pudo adjuntar el comprobante' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pagoId: string }> }) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const pagoId = idDe(await params);
  if (!pagoId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const borrado = await borrarComprobantePago(auth.teamId, pagoId);
  if (!borrado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
