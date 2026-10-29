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
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { traerTutoresDeSigerd } from '@/lib/sigerd/tutores-desde-sigerd';
import { conSesionSigerdAuto } from '@/lib/sigerd/sesion-auto';

export const dynamic = 'force-dynamic';

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

  return conSesionSigerdAuto(teamId, async (cli) => ({
    tutores: await traerTutoresDeSigerd(teamId, cli, idEstudianteSigerd),
  }));
}

