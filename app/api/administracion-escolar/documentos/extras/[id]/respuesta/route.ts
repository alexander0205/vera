import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosRequeridos,
  adminEscolarFormularios,
  adminEscolarFormularioRespuestas,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import type { ICampo } from '@/lib/administracion-escolar/formularios';

/**
 * Lo que contestó la familia, para poder LEERLO antes de aprobarlo.
 *
 * Sin esto, aprobar un formulario era firmar a ciegas: el renglón decía «por
 * aprobar» y las respuestas estaban en un JSON que nadie podía abrir desde la
 * pantalla. Aprobar sin ver es exactamente lo que el módulo entero intenta
 * evitar al separar «recibido» de «aprobado».
 *
 * Se devuelve el formulario RECORRIDO en su orden, no el JSON crudo: la familia
 * contestó una ficha con secciones y etiquetas, y una lista de `text_42: "x"`
 * no es legible para quien la revisa.
 */

interface Ctx { params: Promise<{ id: string }> }

/** Los tipos que no son una pregunta: no tienen respuesta que enseñar. */
const SIN_RESPUESTA = ['divider', 'imagen', 'salto_pagina'];

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const [renglon] = await db.select().from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.id, id),
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
    ))
    .limit(1);

  if (!renglon?.formularioId || !renglon.matriculaId) {
    return NextResponse.json({ error: 'Ese renglón no es un formulario' }, { status: 404 });
  }

  const [formulario] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.id, renglon.formularioId),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .limit(1);
  if (!formulario) return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });

  const [respuesta] = await db.select().from(adminEscolarFormularioRespuestas)
    .where(and(
      eq(adminEscolarFormularioRespuestas.formularioId, formulario.id),
      eq(adminEscolarFormularioRespuestas.matriculaId, renglon.matriculaId),
    ))
    .limit(1);

  if (!respuesta) {
    return NextResponse.json({ error: 'Todavía no hay respuesta' }, { status: 404 });
  }

  const datos = (respuesta.datos ?? {}) as Record<string, unknown>;
  const campos = (formulario.campos ?? []) as ICampo[];

  const secciones = campos
    .filter((c) => !SIN_RESPUESTA.includes(c.tipo))
    .map((c) => ({
      id: c.id,
      tipo: c.tipo,
      label: c.label,
      requerido: !!c.requerido,
      valor: datos[c.id] ?? null,
    }));

  return NextResponse.json({
    formulario: formulario.nombre,
    // 'borrador' = la familia lo abrió pero no lo ha mandado. Se enseña igual:
    // ver lo que lleva escrito es justo lo que responde «¿ya lo llenó?».
    enviado: respuesta.estado !== 'borrador',
    enviadoEn: respuesta.enviadoEn?.toISOString() ?? null,
    actualizadoEn: respuesta.updatedAt?.toISOString() ?? null,
    campos: secciones,
  });
}
