/**
 * GET /api/sigerd/estudiantes/[id]/ficha
 *
 * La ficha completa de un alumno del padrón: identidad, contacto, acta de
 * nacimiento y dirección. El buscador solo devuelve ocho columnas —nombre,
 * apellidos, RNE, fecha— porque es un listado; todo lo demás vive en la página
 * de detalle del portal, que hay que pedir alumno por alumno.
 *
 * Se pide al elegir un alumno en el alta, para no teclear a mano lo que el
 * MINERD ya tiene escrito. Una letra distinta aquí es un alumno que después no
 * cruza con SIGERD.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { traerFichaEstudiante } from '@/lib/sigerd/ficha';
import { conSesionSigerdAuto } from '@/lib/sigerd/sesion-auto';
import { camposDesdeFichaSigerd } from '@/lib/administracion-escolar/estudiante-sigerd-campos';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // `gestionar` y no `ver`, igual que el buscador: esto es el expediente de un
  // menor del padrón nacional, no la ficha de un alumno propio.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const idSigerd = Number(id);
  if (!Number.isInteger(idSigerd) || idSigerd <= 0) {
    return NextResponse.json({ error: 'Id de SIGERD inválido' }, { status: 400 });
  }

  // `conSesionSigerdAuto` envuelve lo que devuelva el callback en
  // `{ datos, origen }` y traduce los errores del portal, igual que el
  // buscador. Por eso la forma se arma aquí dentro y no fuera.
  return conSesionSigerdAuto(auth.teamId, async (cli) => {
    const ficha = await traerFichaEstudiante(cli, idSigerd);

    // Solo lo que el formulario sabe pintar. Lo que el portal traiga y no
    // tengamos dónde poner no se devuelve: es el expediente de un menor.
    return {
      campos: camposDesdeFichaSigerd(ficha as unknown as Record<string, unknown>),
      // Los básicos van aparte porque no son campos «extra»: son columnas
      // propias y el formulario ya tiene su sitio para ellos.
      nombres: [ficha.primerNombre, ficha.segundoNombre].filter(Boolean).join(' ').trim(),
      apellidos: [ficha.primerApellido, ficha.segundoApellido].filter(Boolean).join(' ').trim(),
      fechaNacimiento: ficha.fechaNacimiento ?? '',
      sexo: ficha.sexoNormalizado ?? '',
    };
  });
}
