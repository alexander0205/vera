/**
 * POST /api/administracion-escolar/tutores/desde-sigerd  { idEstudianteSigerd }
 *
 * Trae del portal los responsables de un alumno (padre, madre, tutor) y los
 * deja como tutores del colegio, listos para vincular.
 *
 * Va en el servidor y no en el navegador porque son cuatro cosas encadenadas:
 * hablar con SIGERD con la sesión del colegio, decidir cuáles ya existen y
 * crear solo los que faltan. Hacerlo desde el cliente serían tres peticiones
 * al portal más una por tutor, con la lista a medio crear si una falla.
 *
 * NO vincula a nadie con el alumno: el alta todavía no lo ha creado. Devuelve
 * los tutores para que el formulario los enseñe y el usuario marque cuál paga
 * —eso no lo sabe SIGERD, es del lado de Facturación.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTutores } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { traerParientesEstudiante, type ParienteSigerd } from '@/lib/sigerd/parientes';
import { traerParientesDesdePdf } from '@/lib/sigerd/ficha-pdf';
import { conSesionSigerdAuto } from '@/lib/sigerd/sesion-auto';

export const dynamic = 'force-dynamic';

/** El PDF trae el nombre entero en una pieza; la pestaña lo trae partido. */
function nombreDe(p: { nombreCompleto?: string } & Partial<Omit<ParienteSigerd, 'tipo'>>): string {
  if (p.nombreCompleto?.trim()) return p.nombreCompleto.replace(/\s+/g, ' ').trim();
  return [p.primerNombre, p.segundoNombre, p.primerApellido, p.segundoApellido]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  // `gestionar` y no `ver`: consulta datos de familiares de menores en el
  // padrón nacional y da de alta tutores en el colegio.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => ({}));
  const idEstudianteSigerd = Number(body?.idEstudianteSigerd);
  if (!Number.isInteger(idEstudianteSigerd) || idEstudianteSigerd <= 0) {
    return NextResponse.json({ error: 'idEstudianteSigerd requerido' }, { status: 400 });
  }

  return conSesionSigerdAuto(teamId, async (cli) => {
    /**
     * El PDF manda porque es el único que trae los datos.
     *
     * `GetViewDatosPariente` —la pestaña del portal— devuelve el formulario en
     * blanco para todos los alumnos probados, incluido uno cuyo PDF sí lista
     * padre y madre con cédula. Se deja como respaldo por si el reporte falla o
     * el ministerio arregla la pestaña, pero primero va el que funciona.
     */
    let parientes: Array<{
      tipo: string; cedula: string | null; email: string | null;
      telefono: string | null; celular: string | null; direccion: string | null;
      nombreCompleto?: string;
      primerNombre?: string | null; segundoNombre?: string | null;
      primerApellido?: string | null; segundoApellido?: string | null;
    }> = [];

    try {
      parientes = (await traerParientesDesdePdf(cli, idEstudianteSigerd)).map((p) => ({
        tipo: p.tipo,
        nombreCompleto: p.nombre,
        cedula: p.cedula,
        celular: p.celular,
        telefono: p.telefono,
        email: null,
        direccion: null,
      }));
    } catch {
      // Que el reporte falle no tumba el alta: se sigue con la pestaña, y si
      // esa también viene vacía el usuario pone los tutores a mano.
      parientes = [];
    }

    if (parientes.length === 0) {
      parientes = (await traerParientesEstudiante(cli, idEstudianteSigerd)) as typeof parientes;
    }

    const tutores = [];
    for (const p of parientes) {
      const nombre = nombreDe(p);
      // Sin nombre no hay tutor que crear: el hueco del portal estaba a medias.
      if (!nombre) continue;

      const documento = p.cedula?.trim() || null;

      // Reutilizar antes que duplicar. La cédula manda —es la identidad— y solo
      // cuando falta se cae al nombre exacto. Sin esto, traer los parientes de
      // dos hermanos crearía al mismo padre dos veces.
      const [existente] = await db
        .select({ id: adminEscolarTutores.id, clientId: adminEscolarTutores.clientId })
        .from(adminEscolarTutores)
        .where(and(
          eq(adminEscolarTutores.teamId, teamId),
          documento
            ? eq(adminEscolarTutores.documento, documento)
            : eq(adminEscolarTutores.nombre, nombre),
        ))
        .limit(1);

      let tutorId: number;
      let clientId: number | null;
      if (existente) {
        tutorId = existente.id;
        clientId = existente.clientId;
      } else {
        const [creado] = await db.insert(adminEscolarTutores).values({
          teamId,
          nombre,
          documento,
          // El portal guarda los dos; el celular es el que contesta.
          telefono: p.celular?.trim() || p.telefono?.trim() || null,
          email: p.email?.trim() || null,
          direccion: p.direccion?.trim() || null,
        }).returning({ id: adminEscolarTutores.id });
        tutorId = creado.id;
        clientId = null;
      }

      tutores.push({
        tutorId,
        nombre,
        documento,
        telefono: p.celular?.trim() || p.telefono?.trim() || null,
        email: p.email?.trim() || null,
        clientId,
        // `padre` | `madre` | `tutor` son tres de nuestras cinco relaciones, así
        // que el tipo del portal entra tal cual.
        relacion: p.tipo,
        reutilizado: !!existente,
      });
    }

    return { tutores };
  });
}
