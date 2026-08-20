import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosRequeridos,
  adminEscolarFormularios,
  adminEscolarFormularioRespuestas,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { contextoDeMatricula, EXIGENCIAS } from '@/lib/administracion-escolar/documentos';
import { nuevoToken } from '@/lib/administracion-escolar/formularios-publicos';

/**
 * Documentos colgados de UN alumno.
 *
 * El listado del nivel cubre lo que el colegio le pide a todos, pero media
 * secretaría son casos sueltos: la carta del pediatra de este niño, el permiso
 * de viaje de aquel. Meterlos en el listado se los pediría de golpe a los
 * trescientos compañeros.
 *
 * Tres formas de agregar, la misma fila al final:
 *   modo=suelto     → un documento nuevo, escrito a mano.
 *   modo=del-listado→ se COPIA uno de los listados a este alumno. Copiar y no
 *                     apuntar: si mañana el colegio cambia el listado, lo que
 *                     ya se le pidió a esta familia no cambia sola.
 *   modo=formulario → el renglón es un formulario del constructor. Se le abre
 *                     ya su borrador para que el enlace sea suyo y lo que
 *                     escriba se le guarde.
 */

/** El siguiente hueco al final del checklist de esta matrícula. */
async function siguienteOrden(teamId: number, matriculaId: number) {
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${adminEscolarDocumentosRequeridos.orden}), 0)::int` })
    .from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.teamId, teamId),
      eq(adminEscolarDocumentosRequeridos.matriculaId, matriculaId),
    ));
  return max + 1;
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  const matriculaId = Number(body.matriculaId);
  if (!Number.isInteger(matriculaId) || matriculaId <= 0) {
    return NextResponse.json({ error: 'matriculaId inválido' }, { status: 400 });
  }

  // Que la matrícula sea de esta empresa. Sin esto, el id de otra empresa
  // colgaría documentos en el expediente de un alumno ajeno.
  const contexto = await contextoDeMatricula(auth.teamId, matriculaId);
  if (!contexto) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  const modo = String(body.modo ?? 'suelto');
  const orden = await siguienteOrden(auth.teamId, matriculaId);

  const base = {
    teamId: auth.teamId,
    matriculaId,
    listaId: null,
    nivel: contexto.nivel,
    tipoInscripcion: contexto.tipo,
    orden,
  };

  // ── Copiado de un listado ────────────────────────────────────────────────
  if (modo === 'del-listado') {
    const requeridoId = Number(body.requeridoId);
    if (!Number.isInteger(requeridoId) || requeridoId <= 0) {
      return NextResponse.json({ error: 'requeridoId inválido' }, { status: 400 });
    }
    const [origen] = await db.select().from(adminEscolarDocumentosRequeridos)
      .where(and(
        eq(adminEscolarDocumentosRequeridos.id, requeridoId),
        eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
      ))
      .limit(1);
    if (!origen) return NextResponse.json({ error: 'Ese documento no existe' }, { status: 404 });

    const [fila] = await db.insert(adminEscolarDocumentosRequeridos).values({
      ...base,
      nombre: origen.nombre,
      exigencia: origen.exigencia,
      cantidad: origen.cantidad,
    }).returning({ id: adminEscolarDocumentosRequeridos.id });

    return NextResponse.json({ id: fila.id, nombre: origen.nombre });
  }

  // ── Un formulario del constructor ────────────────────────────────────────
  if (modo === 'formulario') {
    const formularioId = Number(body.formularioId);
    if (!Number.isInteger(formularioId) || formularioId <= 0) {
      return NextResponse.json({ error: 'formularioId inválido' }, { status: 400 });
    }
    const [formulario] = await db.select().from(adminEscolarFormularios)
      .where(and(
        eq(adminEscolarFormularios.id, formularioId),
        eq(adminEscolarFormularios.teamId, auth.teamId),
      ))
      .limit(1);
    if (!formulario) return NextResponse.json({ error: 'Ese formulario no existe' }, { status: 404 });

    const [yaEsta] = await db.select({ id: adminEscolarDocumentosRequeridos.id })
      .from(adminEscolarDocumentosRequeridos)
      .where(and(
        eq(adminEscolarDocumentosRequeridos.matriculaId, matriculaId),
        eq(adminEscolarDocumentosRequeridos.formularioId, formularioId),
      ))
      .limit(1);
    if (yaEsta) {
      return NextResponse.json(
        { error: 'Ese formulario ya está en este expediente' },
        { status: 409 },
      );
    }

    const [fila] = await db.insert(adminEscolarDocumentosRequeridos).values({
      ...base,
      nombre: formulario.nombre,
      exigencia: 'requerido',
      cantidad: 1,
      formularioId,
    }).returning({ id: adminEscolarDocumentosRequeridos.id });

    // El borrador se abre AQUÍ, no cuando la familia pulse: así el enlace que
    // se le manda ya es suyo y lo que escriba se le va guardando desde la
    // primera letra. Queda atado a la matrícula, que es lo que después permite
    // dar el renglón por recibido cuando lo envíe.
    const token = nuevoToken();
    await db.insert(adminEscolarFormularioRespuestas).values({
      teamId: auth.teamId,
      formularioId,
      formularioNombre: formulario.nombre,
      estudianteId: contexto.estudianteId,
      matriculaId,
      datos: {},
      estado: 'borrador',
      token,
      pagina: 0,
    });

    return NextResponse.json({
      id: fila.id,
      nombre: formulario.nombre,
      enlace: `/f/${formulario.slug}/r/${token}`,
    });
  }

  // ── Un documento suelto, escrito a mano ──────────────────────────────────
  const nombre = String(body.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (nombre.length > 160) {
    return NextResponse.json({ error: 'El nombre es demasiado largo' }, { status: 400 });
  }

  const exigencia = String(body.exigencia ?? 'requerido');
  if (!EXIGENCIAS.includes(exigencia as never)) {
    return NextResponse.json({ error: 'Exigencia inválida' }, { status: 400 });
  }

  const cantidad = Number(body.cantidad ?? 1);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
  }

  const [fila] = await db.insert(adminEscolarDocumentosRequeridos).values({
    ...base,
    nombre,
    exigencia,
    cantidad,
  }).returning({ id: adminEscolarDocumentosRequeridos.id });

  return NextResponse.json({ id: fila.id, nombre });
}
