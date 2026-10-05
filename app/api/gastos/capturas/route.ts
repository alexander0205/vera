import { NextRequest, NextResponse, after } from 'next/server';
import { autorizarCapturas } from '@/lib/compras/captura/autorizar';
import {
  crearCaptura, capturaConArchivo, borrarCapturaFallida, listarCapturas, type EstadoCaptura,
} from '@/lib/compras/captura/consultas';
import { guardarArchivo, sha256, ArchivoInvalidoError, MAX_ARCHIVOS } from '@/lib/compras/captura/archivos';
import { procesarCaptura } from '@/lib/compras/captura/procesar';

export const dynamic = 'force-dynamic';
// Leer la factura va después de responder, pero el PDF entero viaja en la
// petición: el margen es el de la subida, no el de la lectura.
export const maxDuration = 120;

const GRUPOS: Record<string, EstadoCaptura[]> = {
  pendientes: ['procesando', 'por_revisar'],
  registradas: ['registrada'],
  descartadas: ['descartada'],
};

/** GET /api/gastos/capturas?estado=pendientes|registradas|descartadas */
export async function GET(req: NextRequest) {
  const auth = await autorizarCapturas(false);
  if (!auth.ok) return auth.response;
  const estados = GRUPOS[req.nextUrl.searchParams.get('estado') ?? 'pendientes'] ?? GRUPOS.pendientes;
  return NextResponse.json({ capturas: await listarCapturas(auth.teamId, estados) });
}

/**
 * POST /api/gastos/capturas — el comprobante que ya está en el ordenador.
 *
 * El enlace del móvil cubre a quien compra en la calle; esto cubre lo que llega
 * por correo: el PDF de la factura de internet, el recibo escaneado. Mismo
 * destino —«por revisar», leído por QR o por IA— para que haya un solo sitio
 * donde se registran las facturas de proveedor, venga la imagen de donde venga.
 *
 * Aquí sí hay sesión, así que no se limita por frecuencia: quien tiene permiso
 * para registrar gastos ya puede crearlos de uno en uno.
 */
export async function POST(req: NextRequest) {
  const auth = await autorizarCapturas(true);
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 });
  const archivos = form.getAll('archivos').filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return NextResponse.json({ error: 'Elige el PDF o la imagen del comprobante.' }, { status: 400 });
  if (archivos.length > MAX_ARCHIVOS) {
    return NextResponse.json({ error: `Una factura admite hasta ${MAX_ARCHIVOS} archivos.` }, { status: 400 });
  }
  const nota = String(form.get('nota') ?? '').trim().slice(0, 500) || null;

  const buffers = await Promise.all(archivos.map(async (f) => Buffer.from(await f.arrayBuffer())));
  // El mismo PDF subido dos veces es el mismo comprobante, no dos.
  const repetida = await capturaConArchivo(auth.teamId, sha256(buffers[0]));
  if (repetida) return NextResponse.json({ ok: true, id: repetida, repetida: true });

  const subidoPor = auth.user.name?.trim() || auth.user.email || null;
  const capturaId = await crearCaptura({ teamId: auth.teamId, enlaceId: null, subidoPor, nota });
  try {
    for (const [i, buffer] of buffers.entries()) {
      await guardarArchivo({ teamId: auth.teamId, capturaId, buffer, orden: i });
    }
  } catch (e) {
    await borrarCapturaFallida(auth.teamId, capturaId).catch(() => {});
    if (e instanceof ArchivoInvalidoError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[capturas] subir', e);
    return NextResponse.json({ error: 'No se pudo guardar el archivo. Intenta otra vez.' }, { status: 500 });
  }

  after(() => procesarCaptura(auth.teamId, capturaId));
  return NextResponse.json({ ok: true, id: capturaId }, { status: 201 });
}
