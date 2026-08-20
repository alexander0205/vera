import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  clients,
  dependientes,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { validarTutoresDeAlta, vincularTutor } from '@/lib/administracion-escolar/tutores';
import {
  listarEstudiantesEnriquecidos,
  estadisticasEstudiantes,
  generarCodigoEstudiante,
} from '@/lib/administracion-escolar/queries';
import { SEXOS_VALIDOS } from '@/lib/administracion-escolar/estudiante-utils';
import { limpiarCamposSigerd } from '@/lib/administracion-escolar/estudiante-sigerd-campos';
import { eq, and } from 'drizzle-orm';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

/**
 * Listado paginado. Params: `q` (búsqueda), `estado`, `cursoId`, `limit`,
 * `offset`. Devuelve `{ estudiantes, total, sinMatricular, stats }` — `stats` es
 * global del team (no depende de la página ni de los filtros) y `sinMatricular`
 * cuenta los beneficiarios de Contactos que todavía no son alumnos, los filtre
 * la pantalla o no.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const sp = req.nextUrl.searchParams;
  const cursoId = Number(sp.get('cursoId')) || null;
  const limit = Number(sp.get('limit')) || 25;
  const offset = Number(sp.get('offset')) || 0;
  // Las dos a la vez: `stats` es del team entero y no depende del listado, así
  // que esperarla en fila añadía su tiempo al de la página sin motivo.
  const [{ estudiantes, total, sinMatricular }, stats] = await Promise.all([
    listarEstudiantesEnriquecidos(teamId, {
      q: sp.get('q') ?? undefined,
      estado: sp.get('estado') ?? undefined,
      cursoId,
      limit,
      offset,
    }),
    estadisticasEstudiantes(teamId),
  ]);
  return NextResponse.json({ estudiantes, total, sinMatricular, stats });
}

/**
 * Alta de estudiante. El `codigo` NO se recibe: se genera automáticamente
 * (`AAAA-####`) ligado al año de la PRIMERA inscripción. Por eso el alta crea
 * también la primera matrícula (periodo + curso) en un mismo flujo. Si no viene
 * `matricula`, el estudiante se crea sin código (se le asignará al inscribirlo).
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const body = await req.json();
  const { nombres, apellidos, sexo, fechaNacimiento, estado, matricula, sigerdId } = body;
  if (!nombres?.trim()) return NextResponse.json({ error: 'Nombres requeridos' }, { status: 400 });
  if (!apellidos?.trim()) return NextResponse.json({ error: 'Apellidos requeridos' }, { status: 400 });

  // Id del alumno en el padrón del MINERD, cuando el alta vino del buscador de
  // SIGERD. Es lo que permite reconocerlo en una sincronización futura en vez
  // de crear una segunda ficha del mismo niño.
  const sigerdIdOk = Number.isInteger(sigerdId) && sigerdId > 0 ? Number(sigerdId) : null;
  if (sigerdIdOk) {
    const [ya] = await db.select({ id: adminEscolarEstudiantes.id })
      .from(adminEscolarEstudiantes)
      .where(and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        eq(adminEscolarEstudiantes.sigerdId, sigerdIdOk),
      ))
      .limit(1);
    // Se corta aquí y no con un índice único: el mensaje tiene que decir a qué
    // ficha ir, no solo que hubo choque.
    if (ya) {
      return NextResponse.json(
        { error: 'Ese alumno de SIGERD ya está registrado en este colegio.', estudianteId: ya.id },
        { status: 409 },
      );
    }
  }
  // Campos extra de la ficha (todos opcionales).
  const extra = limpiarCamposSigerd(body);

  // Validar la matrícula (opcional) antes de tocar nada.
  let periodoId: number | null = null;
  let cursoId: number | null = null;
  let fechaInscripcion: string | null = null;
  if (matricula) {
    periodoId = Number(matricula.periodoId) || null;
    cursoId = Number(matricula.cursoId) || null;
    if (!periodoId || !cursoId) {
      return NextResponse.json({ error: 'Periodo y curso son requeridos para la matrícula' }, { status: 400 });
    }
    const [per] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
    if (!per) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 });
    const [cur] = await db.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
      .where(and(eq(adminEscolarCursos.id, cursoId), eq(adminEscolarCursos.teamId, teamId))).limit(1);
    if (!cur) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    fechaInscripcion = matricula.fechaInscripcion || new Date().toISOString().slice(0, 10);
  }

  // Un alumno sin tutor no se puede cobrar ni avisar: el alta lo exige. La
  // validación va aquí, antes de escribir nada, para que el error salga sin
  // haber creado media ficha.
  const tutoresVal = validarTutoresDeAlta(body.tutores);
  if (!tutoresVal.ok) return NextResponse.json({ error: tutoresVal.error }, { status: 400 });
  const tutoresOk = tutoresVal.tutores;

  // El responsable de pago: el CONTACTO al que se le factura. Obligatorio, y
  // tiene que ser de esta empresa — el id viaja desde el navegador.
  const facturarAClientId = Number(body.facturarAClientId);
  if (!Number.isInteger(facturarAClientId) || facturarAClientId <= 0) {
    return NextResponse.json(
      { error: 'Falta el responsable de pago: es a quien se le emiten las facturas.' },
      { status: 400 },
    );
  }
  const [contacto] = await db.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.id, facturarAClientId), eq(clients.teamId, teamId))).limit(1);
  if (!contacto) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });

  // Código auto ligado al año de la primera inscripción (o el año en curso si
  // aún no se inscribe).
  const anioCodigo = fechaInscripcion ? parseInt(fechaInscripcion.slice(0, 4), 10) : new Date().getFullYear();
  const codigo = matricula ? await generarCodigoEstudiante(teamId, anioCodigo) : null;

  // Alumno, matrícula y tutores van en UNA transacción. Si el vínculo del
  // responsable de pago falla —el caso normal: se eligió un tutor sin contacto
  // fiscal— no puede quedar un alumno a medias que el usuario no pidió.
  let fallo: { error: string; status: number } | null = null;
  const row = await db.transaction(async (tx) => {
    const [creado] = await tx.insert(adminEscolarEstudiantes).values({
      teamId,
      codigo,
      nombres: nombres.trim(),
      apellidos: apellidos.trim(),
      sexo: SEXOS_VALIDOS.includes(sexo) ? sexo : null,
      fechaNacimiento: fechaNacimiento || null,
      estado: ESTADOS.includes(estado) ? estado : 'activo',
      sigerdId: sigerdIdOk,
      facturarAClientId,
      ...extra,
    }).returning();

    /**
     * El alumno pasa a ser beneficiario del contacto que paga.
     *
     * Sin esto la factura sale sin decir de quién es la mensualidad, y con
     * varios hijos del mismo padre no hay forma de saber a cuál corresponde.
     * Se reutiliza el que ya exista con ese nombre bajo ese contacto —el padre
     * que ya tenía al hijo dado de alta en Contactos— en vez de duplicarlo.
     */
    const nombreEst = nombres.trim();
    const apellidoEst = apellidos.trim();
    const [depExistente] = await tx.select({ id: dependientes.id }).from(dependientes)
      .where(and(
        eq(dependientes.teamId, teamId),
        eq(dependientes.clientId, facturarAClientId),
        eq(dependientes.nombre, nombreEst),
        eq(dependientes.apellido, apellidoEst),
      )).limit(1);
    const dependienteId = depExistente?.id ?? (await tx.insert(dependientes).values({
      teamId, clientId: facturarAClientId, nombre: nombreEst, apellido: apellidoEst,
    }).returning({ id: dependientes.id }))[0].id;

    await tx.update(adminEscolarEstudiantes)
      .set({ dependienteId, updatedAt: new Date() })
      .where(eq(adminEscolarEstudiantes.id, creado.id));

    if (matricula && periodoId && cursoId) {
      await tx.insert(adminEscolarMatriculas).values({
        teamId,
        estudianteId: creado.id,
        periodoId,
        cursoId,
        fechaInscripcion,
        // Cuando el alta vino de SIGERD, aquí llega el RNE: es el número con el
        // que el MINERD identifica al alumno y el que el colegio maneja en papel.
        codigoMatricula: matricula.codigoMatricula?.trim() || null,
        estado: 'activa',
      });
    }

    for (const t of tutoresOk) {
      const res = await vincularTutor(tx, { teamId, estudianteId: creado.id, ...t });
      if (!res.ok) {
        fallo = { error: res.error, status: res.status };
        tx.rollback();
      }
    }

    return creado;
  }).catch((e) => {
    // `tx.rollback()` sale lanzando; con `fallo` puesto ya sabemos por qué.
    if (fallo) return null;
    throw e;
  });

  if (!row) {
    const f = fallo as { error: string; status: number } | null;
    return NextResponse.json({ error: f?.error ?? 'No se pudo crear' }, { status: f?.status ?? 400 });
  }

  return NextResponse.json({ estudiante: row });
}
