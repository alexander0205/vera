import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, clients, dependientes } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and, asc, ilike, inArray, notExists, or, sql } from 'drizzle-orm';

/**
 * GET — los beneficiarios de Contactos que todavía no son alumnos, con el
 * contacto (el padre) al que cuelgan.
 *
 * Es lo que pinta el diálogo de «Traer de Contactos»: en un colegio el
 * beneficiario de una factura ES el alumno, así que esta lista es el censo que
 * ya existe en Facturación y que al módulo todavía le falta.
 *
 * Sin paginar a propósito: son cientos, no miles, y el diálogo tiene que poder
 * marcar «todos» de una vez. El tope está para que un team con los contactos
 * desbocados no tumbe la pantalla.
 */
const TOPE = 1000;

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const filtros = [
    eq(dependientes.teamId, teamId),
    // «Todavía no es alumno» = nadie lo apunta por `dependiente_id`. Nunca por
    // nombre: dos personas pueden llamarse igual sin ser la misma.
    notExists(db.select({ x: sql`1` }).from(adminEscolarEstudiantes).where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      eq(adminEscolarEstudiantes.dependienteId, dependientes.id),
    ))),
  ];
  if (q) {
    const p = `%${q}%`;
    filtros.push(or(
      ilike(dependientes.nombre, p),
      ilike(dependientes.apellido, p),
      ilike(sql`${dependientes.nombre} || ' ' || ${dependientes.apellido}`, p),
      ilike(clients.razonSocial, p),
    )!);
  }

  const filas = await db
    .select({
      dependienteId: dependientes.id,
      nombre: dependientes.nombre,
      apellido: dependientes.apellido,
      clientId: clients.id,
      contacto: clients.razonSocial,
    })
    .from(dependientes)
    .leftJoin(clients, eq(dependientes.clientId, clients.id))
    .where(and(...filtros))
    .orderBy(asc(sql`upper(${dependientes.apellido})`), asc(sql`upper(${dependientes.nombre})`))
    .limit(TOPE + 1);

  // Se pide uno de más para saber si el tope cortó, y decirlo en pantalla en
  // vez de dejar creer que eso es todo lo que hay.
  const truncado = filas.length > TOPE;
  return NextResponse.json({ beneficiarios: filas.slice(0, TOPE), truncado });
}

/**
 * Da de alta como alumno del módulo a un beneficiario que ya existe en
 * Contactos (al que el colegio ya le factura pero que no tenía ficha escolar).
 *
 * Crea la ficha con `dependiente_id` apuntando al beneficiario —para que el
 * listado deje de ofrecerlo— y con el responsable de pago ya puesto: el
 * contacto del que cuelga ese beneficiario. NO crea matrícula: el período,
 * el curso y el código de estudiante los decide después el usuario desde
 * «Reinscribir» / la pantalla de matriculación, que es donde se genera el
 * código ligado al año de la primera inscripción.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json().catch(() => ({}));

  // Dos formas para el mismo alta: `dependienteId` (el botón de una fila) y
  // `dependienteIds` (el diálogo de traer de Contactos, que manda cientos).
  const enLote = Array.isArray(body?.dependienteIds);
  const ids = enLote
    ? [...new Set((body.dependienteIds as unknown[]).map(Number))]
      .filter((n) => Number.isInteger(n) && n > 0)
    : [Number(body?.dependienteId)].filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'dependienteId requerido' }, { status: 400 });
  }
  if (ids.length > TOPE) {
    return NextResponse.json({ error: `Máximo ${TOPE} beneficiarios por vez` }, { status: 400 });
  }

  // Los beneficiarios tienen que ser de esta empresa: los ids viajan desde el
  // navegador y sin esto se podría colgar un alumno de otro team. Los que no
  // sean suyos simplemente no salen de aquí.
  const deps = await db
    .select({
      id: dependientes.id,
      nombre: dependientes.nombre,
      apellido: dependientes.apellido,
      // El contacto del que cuelga el beneficiario. Es, por definición, quien
      // ya le factura a este alumno.
      clientId: dependientes.clientId,
    })
    .from(dependientes)
    .where(and(inArray(dependientes.id, ids), eq(dependientes.teamId, teamId)));

  if (deps.length === 0) {
    return NextResponse.json({ error: 'Beneficiario no encontrado' }, { status: 404 });
  }

  // Los que ya son alumnos. El enlace es 1:1: un beneficiario, un alumno.
  const yaSon = await db
    .select({
      dependienteId: adminEscolarEstudiantes.dependienteId,
      id: adminEscolarEstudiantes.id,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      inArray(adminEscolarEstudiantes.dependienteId, deps.map((d) => d.id)),
    ));
  const existentes = new Map(yaSon.map((e) => [e.dependienteId, e.id]));

  // En el alta de UNO se corta con 409 y con el id al que ir: el usuario está
  // mirando esa fila y necesita saber a dónde. En lote no —repetir a mitad de
  // camino dejaría media importación hecha—, así que los repetidos se saltan y
  // se cuentan.
  if (!enLote && existentes.has(ids[0])) {
    return NextResponse.json(
      { error: 'Ese beneficiario ya es alumno del módulo.', estudianteId: existentes.get(ids[0]) },
      { status: 409 },
    );
  }

  const nuevos = deps.filter((d) => !existentes.has(d.id));
  const creados = nuevos.length === 0 ? [] : await db.insert(adminEscolarEstudiantes)
    .values(nuevos.map((d) => ({
      teamId,
      dependienteId: d.id,
      // Se importa con lo que haya. Un beneficiario no trae sexo, ni fecha de
      // nacimiento, ni código: eso se completa después en su ficha. Exigirlo
      // aquí dejaría fuera justo a los que hay que traer.
      nombres: d.nombre,
      apellidos: d.apellido,
      // El responsable de pago sale de aquí, no se pregunta: el beneficiario
      // cuelga de un contacto y ese contacto es a quien el colegio YA le
      // factura. Importarlos sin él dejaba a cientos de alumnos «sin
      // responsable» —y por lo tanto sin nadie a quien avisarle ni cobrarle—
      // teniendo el dato delante.
      facturarAClientId: d.clientId,
      estado: 'activo',
    })))
    .returning();

  if (!enLote) return NextResponse.json({ estudiante: creados[0] });

  return NextResponse.json({
    creados: creados.length,
    omitidos: deps.length - nuevos.length,
    // Los ids que mandó el navegador y no son de esta empresa (o no existen).
    noEncontrados: ids.length - deps.length,
  });
}
