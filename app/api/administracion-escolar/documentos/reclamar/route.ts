import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { seguimientoDeDocumentos } from '@/lib/administracion-escolar/documentos-seguimiento';
import { crearEnlace, DIAS_VIGENCIA_ENLACE } from '@/lib/administracion-escolar/documentos-enlace';
import { enviarEnlaceDocumentosEmail } from '@/lib/email/escolar-avisos';
import { registrarAvisoExpediente } from '@/lib/administracion-escolar/avisos-expediente';
import { origenPublico } from '@/lib/http/origen-publico';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Reclamarle los documentos a varias familias de una vez.
 *
 * Es lo que convierte el seguimiento en algo usable: ver que a 128 familias les
 * falta algo no sirve de nada si hay que entrar en 128 fichas para pedírselo.
 *
 * SIN `confirmar` devuelve una PREVISUALIZACIÓN —a quién se le mandaría, qué se
 * le pide y quién queda fuera por no tener correo— y no envía nada. Mandar
 * ciento y pico de correos es irreversible, así que primero se enseña.
 *
 * Cada familia recibe SU enlace, con su propio token: uno compartido dejaría a
 * cualquiera de ellas ver el expediente de las demás.
 */

/** Tope por tanda. Más que esto no es una reclamación, es un envío masivo que
 *  conviene partir —y que Resend además empezaría a frenar. */
const MAX_POR_TANDA = 150;

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.matriculaIds)
    ? body.matriculaIds.map(Number).filter(Number.isInteger)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No hay a quién reclamarle' }, { status: 400 });
  }
  if (ids.length > MAX_POR_TANDA) {
    return NextResponse.json(
      { error: `Son demasiadas de una vez (${ids.length}). Manda como mucho ${MAX_POR_TANDA} por tanda.` },
      { status: 400 },
    );
  }

  // Se relee el seguimiento en vez de fiarse de lo que manda la pantalla: entre
  // que se cargó la lista y se pulsó el botón, una familia puede haber subido
  // lo que faltaba, y no se le reclama algo que ya entregó.
  const { filas } = await seguimientoDeDocumentos(auth.teamId);
  const porId = new Map(filas.map((f) => [f.matriculaId, f]));

  const elegidas = ids.map((id) => porId.get(id)).filter((f) => f != null);
  const conPendientes = elegidas.filter((f) => !f.completa);
  const conCorreo = conPendientes.filter((f) => f.email);
  const sinCorreo = conPendientes.filter((f) => !f.email);
  const yaCompletas = elegidas.filter((f) => f.completa);

  if (body?.confirmar !== true) {
    return NextResponse.json({
      previsualizacion: true,
      seEnviaran: conCorreo.map((f) => ({
        matriculaId: f.matriculaId, estudiante: f.estudiante,
        email: f.email, pendientes: f.pendientes,
      })),
      sinCorreo: sinCorreo.map((f) => ({ matriculaId: f.matriculaId, estudiante: f.estudiante })),
      yaCompletas: yaCompletas.map((f) => ({ matriculaId: f.matriculaId, estudiante: f.estudiante })),
    });
  }

  const [equipo] = await db.select({ nombre: teams.name }).from(teams)
    .where(eq(teams.id, auth.teamId)).limit(1);
  const base = origenPublico(req);

  let enviados = 0;
  const fallos: { estudiante: string; motivo: string }[] = [];

  for (const f of conCorreo) {
    try {
      // Uno a uno y en serie: son correos con un token distinto cada uno, y si
      // el proveedor empieza a rechazar, se sabe exactamente dónde se cortó.
      const { token } = await crearEnlace({
        teamId: auth.teamId,
        matriculaId: f.matriculaId,
        requeridoId: null,
        creadoPor: auth.user.id,
      });

      await enviarEnlaceDocumentosEmail({
        email: f.email!,
        colegio: equipo?.nombre ?? 'El colegio',
        tutor: null,
        estudiante: f.estudiante,
        documentos: f.pendientes,
        url: `${base}/d/${token}`,
        dias: DIAS_VIGENCIA_ENLACE,
      });

      await registrarAvisoExpediente({
        teamId: auth.teamId,
        matriculaId: f.matriculaId,
        tipo: 'documentos',
        canal: 'correo',
        destino: f.email!,
        detalle: f.pendientes.slice(0, 3).join(', ') || 'Expediente',
      });

      enviados++;
    } catch (err) {
      fallos.push({
        estudiante: f.estudiante,
        motivo: err instanceof Error ? err.message : 'No se pudo enviar',
      });
    }
  }

  return NextResponse.json({
    enviados,
    sinCorreo: sinCorreo.length,
    yaCompletas: yaCompletas.length,
    fallos,
  });
}
