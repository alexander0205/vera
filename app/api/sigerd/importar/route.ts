import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { traerSeccionParaImportar } from '@/lib/sigerd/importar';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { SigerdError } from '@/lib/sigerd/types';
import {
  aplicarImportacion,
  ImportacionError,
  planificarImportacion,
} from '@/lib/administracion-escolar/importar-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Importa una sección de SIGERD al módulo escolar.
 *
 * Body: `{ idCentro, idSeccion, periodoId, cursoId, aplicar? }`
 *
 * Sin `aplicar: true` devuelve solo el PLAN: qué estudiantes se crearían, cuáles
 * ya existen y cuántas matrículas se abrirían. Nada se escribe. Escribir exige
 * pedirlo explícitamente, porque son expedientes de menores traídos de un
 * sistema del Estado y no debe pasar por descuido.
 *
 * Leer la sección cuesta un request por estudiante contra SIGERD (30 alumnos ≈
 * 30 llamadas), de ahí el `maxDuration` largo.
 */
export async function POST(req: NextRequest) {
  // Ver no basta: importar crea estudiantes y matrículas.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const idCentro = Number(body.idCentro);
  const idSeccion = Number(body.idSeccion);
  const periodoId = Number(body.periodoId);
  const cursoId = Number(body.cursoId);
  const aplicar = body.aplicar === true;
  // Trae el expediente completo (sexo, nacionalidad, acta, dirección). Cuesta
  // lo mismo en peticiones, pero son datos sensibles: hay que pedirlo.
  const conFicha = body.conFicha === true;

  for (const [nombre, valor] of Object.entries({ idCentro, idSeccion, periodoId, cursoId })) {
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json(
        { error: `Parámetro "${nombre}" inválido.`, codigo: 'parametro-invalido' },
        { status: 400 },
      );
    }
  }

  const sesion = await leerSesion();
  if (!sesion) {
    return NextResponse.json(
      { error: 'No hay sesión de SIGERD. Conecta tu cuenta del portal primero.', codigo: 'sesion-expirada' },
      { status: 401 },
    );
  }

  try {
    const cli = SigerdClient.desdeSesion(sesion);
    const seccion = await traerSeccionParaImportar(cli, { idCentro, idSeccion, conFicha });
    await guardarSesion(cli.exportarSesion());

    if (!seccion.estudiantes.length) {
      return NextResponse.json(
        {
          error:
            'La sección no devolvió estudiantes. Verifica el centro: un idCentro que no corresponde ' +
            'devuelve una lista vacía en lugar de un error.',
          codigo: 'seccion-vacia',
          sinDetalle: seccion.sinDetalle,
        },
        { status: 404 },
      );
    }

    const plan = await planificarImportacion({
      teamId,
      periodoId,
      cursoId,
      estudiantes: seccion.estudiantes,
    });

    if (!aplicar) {
      return NextResponse.json({ aplicado: false, plan, sinDetalle: seccion.sinDetalle });
    }

    const resultado = await aplicarImportacion({
      teamId,
      periodoId,
      cursoId,
      estudiantes: seccion.estudiantes,
    });

    return NextResponse.json({ aplicado: true, resultado, plan, sinDetalle: seccion.sinDetalle });
  } catch (e) {
    if (e instanceof ImportacionError) {
      return NextResponse.json({ error: e.message, codigo: 'importacion-invalida' }, { status: 400 });
    }
    if (e instanceof SigerdError && e.codigo === 'sesion-expirada') await borrarSesion();
    return respuestaError(e);
  }
}
