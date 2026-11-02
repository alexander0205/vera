/**
 * Un archivo de la conversación de una tarea.
 *
 *   PUT ?n=<trozo>[&fin=1]  cuerpo: los bytes del trozo
 *        Los trozos llegan en orden, de uno en uno (ver lib/storage/tareas.ts).
 *        Con `fin=1` se cierra: se comprueba que en S3 quedó lo que se dijo,
 *        sale en la conversación y se avisa (correo y Slack).
 *   GET  → redirige a una URL de S3 de 5 minutos para verlo o bajarlo
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  avisarDeTarea, cerrarAdjunto, guardarSubida, leerAdjunto,
} from '@/lib/administracion-escolar/tareas';
import { autorTarea, claseDeMime } from '@/lib/administracion-escolar/tareas-reglas';
import { borrarArchivoTarea, recibirTrozo, tamanoEnS3, TAMANO_TROZO, urlParaVer } from '@/lib/storage/tareas';
import { logAudit } from '@/lib/audit';

// Un trozo puede esperar a bajar su pareja de S3 y subir 8 MB.
export const maxDuration = 60;

const idDe = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; adjuntoId: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const p = await params;
  const tareaId = idDe(p.id);
  const adjuntoId = idDe(p.adjuntoId);
  const a = tareaId && adjuntoId ? await leerAdjunto(auth.teamId, tareaId, adjuntoId) : null;
  // Solo quien la abrió sigue subiéndola.
  if (!a || a.userId !== auth.user.id) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (a.subido) return NextResponse.json({ error: 'Este archivo ya se subió.' }, { status: 409 });

  const n = Number(req.nextUrl.searchParams.get('n'));
  const fin = req.nextUrl.searchParams.get('fin') === '1';
  if (n !== a.trozos) return NextResponse.json({ error: 'Los trozos llegaron fuera de orden.' }, { status: 409 });
  const trozo = Buffer.from(await req.arrayBuffer());
  const total = Math.ceil(a.bytes / TAMANO_TROZO);
  const esperado = n < total - 1 ? TAMANO_TROZO : a.bytes - TAMANO_TROZO * (total - 1);
  if (n >= total || trozo.length !== esperado || fin !== (n === total - 1)) {
    return NextResponse.json({ error: 'El archivo no llegó completo. Vuelve a subirlo.' }, { status: 400 });
  }

  let estado;
  try {
    estado = await recibirTrozo(
      { key: a.s3Key, mime: a.mime, uploadId: a.uploadId, partes: a.partes, pendiente: a.pendiente }, trozo, fin);
  } catch (err) {
    console.error('[tareas] no subió el trozo', adjuntoId, n, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudo subir el archivo. Vuelve a intentarlo.' }, { status: 502 });
  }
  if (!(await guardarSubida(a.id, n, estado))) {
    return NextResponse.json({ error: 'Los trozos llegaron fuera de orden.' }, { status: 409 });
  }
  if (!fin) return NextResponse.json({ ok: true, siguiente: n + 1 });

  // Lo que quedó en S3 tiene que pesar lo que se dijo al abrir la subida.
  const pesa = await tamanoEnS3(a.s3Key);
  if (pesa !== a.bytes) {
    await borrarArchivoTarea(a.s3Key).catch(() => {});
    return NextResponse.json({ error: 'El archivo no llegó completo. Vuelve a subirlo.' }, { status: 400 });
  }
  const autor = autorTarea(auth.user);
  if (!(await cerrarAdjunto(auth.teamId, a.tareaId, a.id, autor, a.nombre))) {
    return NextResponse.json({ error: 'Este archivo ya se subió.' }, { status: 409 });
  }
  after(() => avisarDeTarea(auth.teamId, a.tareaId, 'adjunto', autor, a.nombre));
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
    action: 'ESCOLAR_TAREA_ADJUNTO', resource: `tarea:${a.tareaId}`, meta: { adjuntoId: a.id, bytes: a.bytes, mime: a.mime },
  });
  return NextResponse.json({ ok: true, listo: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; adjuntoId: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const p = await params;
  const tareaId = idDe(p.id);
  const adjuntoId = idDe(p.adjuntoId);
  const a = tareaId && adjuntoId ? await leerAdjunto(auth.teamId, tareaId, adjuntoId) : null;
  if (!a || !a.subido) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const enLinea = req.nextUrl.searchParams.get('descargar') !== '1'
    && (claseDeMime(a.mime) !== 'documento' || a.mime === 'application/pdf');
  const url = await urlParaVer(a.s3Key, a.nombre, a.mime, enLinea);
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, no-store' } });
}
