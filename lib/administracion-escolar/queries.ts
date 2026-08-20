/**
 * Consultas y helpers del módulo Administración Escolar.
 *
 * Enriquecimiento del estudiante (deuda total, matrícula activa, tutor
 * responsable, último pago) para el listado y la ficha lateral. Toda la lógica
 * de agregación vive aquí para no repetirla entre rutas.
 */
import 'server-only';
import { and, eq, ne, desc, sql, inArray, isNotNull, like, ilike, or, count, exists, notExists } from 'drizzle-orm';
import { repartirCobro, type SaldoCalculado } from '@/lib/administracion-escolar/reparto';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
  adminEscolarTutores,
  adminEscolarEstudianteTutores,
  adminEscolarCargos,
  adminEscolarPagos,
  clients,
  dependientes,
  ecfDocuments,
  pagosRecibidos,
} from '@/lib/db/schema';

/** Estados de cargo que cuentan como deuda viva. */
export const ESTADOS_DEUDA = ['pendiente', 'parcial', 'vencido'] as const;

/**
 * De dónde salió la fila del listado. `dependiente` = beneficiario de Contactos
 * al que ya se le factura pero que todavía no tiene ficha en el módulo escolar;
 * en esas filas `id` es el id del DEPENDIENTE, no el de un estudiante, así que
 * no sirve para pedir cargos, tutores ni el perfil.
 */
export type OrigenFilaEstudiante = 'estudiante' | 'dependiente';

export interface EstudianteEnriquecido {
  origen: OrigenFilaEstudiante;
  id: number;
  dependienteId: number | null;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  /** null en los beneficiarios: el estado escolar es del alumno, no del beneficiario. */
  estado: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  // Derivados
  matriculaActivaId: number | null;
  periodoActivo: string | null;
  cursoActual: string | null;
  /** Razón social del contacto (padre) al que se le factura. */
  contacto: string | null;
  tutorResponsable: string | null;
  tutorTelefono: string | null;
  tutorEmail: string | null;
  /** null (no cero) en los beneficiarios: sin ficha escolar no hay cargos que sumar. */
  deudaCentavos: number | null;
  cargosPendientes: number | null;
  ultimoPagoFecha: string | null;
  ultimoPagoCentavos: number | null;
}

export interface ListarEstudiantesOpts {
  /** Búsqueda por nombre, apellido, código o tutor responsable. */
  q?: string;
  /** Filtro por estado del estudiante ('' o 'todos' = sin filtro). */
  estado?: string;
  /** Filtro por curso de la matrícula activa (id). */
  cursoId?: number | null;
  /** Tamaño de página (default 25). */
  limit?: number;
  /** Desplazamiento (default 0). */
  offset?: number;
  /**
   * Mezclar también los beneficiarios de Contactos que aún no son alumnos.
   * Apagado por defecto: el listado es de alumnos del módulo.
   */
  incluirDeContactos?: boolean;
}

export interface ListarEstudiantesResult {
  estudiantes: EstudianteEnriquecido[];
  total: number;
  /**
   * Beneficiarios que todavía no son alumnos (honra `q`, ignora curso/estado).
   * La pantalla lo usa para avisar de los que sus filtros están escondiendo:
   * el filtro de estado viene en 'activo' por defecto y sin este aviso nadie
   * llegaría nunca a ellos.
   */
  sinMatricular: number;
}

/**
 * Listado paginado de estudiantes del team con datos derivados. El filtrado,
 * la búsqueda y el orden ocurren en SQL sobre la tabla base (con la matrícula
 * activa y el tutor responsable en JOIN); solo se enriquece la PÁGINA devuelta
 * (deuda + último pago por los ids de la página) — así no se traen todos los
 * estudiantes ni se calcula deuda de golpe. Ver `docs/plan-optimizacion-db.md`.
 *
 * El listado mezcla DOS orígenes: los alumnos del módulo y los beneficiarios de
 * Contactos que aún no lo son (al colegio ya se les factura, pero eran
 * invisibles aquí). La unión se pagina en SQL —`UNION ALL` + un `total` que es
 * la suma de los dos conteos— y no en memoria: son cientos de alumnos contra
 * miles de beneficiarios, y cortar en JS obligaba a traérselos todos.
 */
export async function listarEstudiantesEnriquecidos(
  teamId: number,
  opts: ListarEstudiantesOpts = {},
): Promise<ListarEstudiantesResult> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  // Refleja el cobro de las facturas vinculadas (todo el team) antes de sumar la
  // deuda, para que el listado no quede rezagado respecto al perfil.
  await sincronizarSaldosDesdeFacturas(teamId);

  // Filtros sobre la tabla base (una fila por estudiante). Curso y tutor se
  // filtran con EXISTS para NO multiplicar filas: un estudiante puede tener
  // matrícula activa en varios períodos y varios tutores.
  const filtros = [eq(adminEscolarEstudiantes.teamId, teamId)];
  const estadoF = opts.estado?.trim();
  if (estadoF && estadoF !== 'todos') filtros.push(eq(adminEscolarEstudiantes.estado, estadoF));
  if (opts.cursoId) {
    filtros.push(exists(db.select({ x: sql`1` }).from(adminEscolarMatriculas).where(and(
      eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      eq(adminEscolarMatriculas.cursoId, opts.cursoId),
    ))));
  }
  const q = opts.q?.trim();
  if (q) {
    const p = `%${q}%`;
    filtros.push(or(
      ilike(adminEscolarEstudiantes.nombres, p),
      ilike(adminEscolarEstudiantes.apellidos, p),
      ilike(sql`${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos}`, p),
      ilike(adminEscolarEstudiantes.codigo, p),
      // Buscar por el nombre de CUALQUIER tutor del alumno, no solo del que
      // tuviera marcada la casilla `responsable_pago` —que ya nadie marca, así
      // que buscar «Scarlet» no encontraba a su hijo—. Y también por el
      // responsable de pago, que es un contacto y puede no ser tutor.
      exists(db.select({ x: sql`1` }).from(adminEscolarEstudianteTutores)
        .innerJoin(adminEscolarTutores, and(
          eq(adminEscolarTutores.id, adminEscolarEstudianteTutores.tutorId),
          eq(adminEscolarTutores.teamId, teamId),
        ))
        .where(and(
          eq(adminEscolarEstudianteTutores.estudianteId, adminEscolarEstudiantes.id),
          eq(adminEscolarEstudianteTutores.teamId, teamId),
          ilike(adminEscolarTutores.nombre, p),
        ))),
      exists(db.select({ x: sql`1` }).from(clients)
        .where(and(
          eq(clients.id, adminEscolarEstudiantes.facturarAClientId),
          eq(clients.teamId, teamId),
          ilike(clients.razonSocial, p),
        ))),
    )!);
  }
  const where = and(...filtros);

  /**
   * Los beneficiarios de Contactos NO salen en el listado salvo que se pidan.
   *
   * Salían siempre, y con eso el directorio de alumnos dejaba de ser el
   * directorio de alumnos: un colegio con 367 beneficiarios facturados veía 367
   * filas de gente que no está matriculada, mezcladas con las de verdad.
   * Traerlos es una acción aparte —Exportar → Desde Contactos—, que además deja
   * marcar cuáles.
   *
   * Y aunque se pidan, un beneficiario no tiene curso ni estado escolar: en
   * cuanto se filtra por uno de los dos deja de poder aparecer, o filtrar por
   * "3ro A" devolvería gente sin matrícula.
   */
  const incluirDependientes = opts.incluirDeContactos === true
    && (!estadoF || estadoF === 'todos') && !opts.cursoId;

  // Beneficiario que "todavía no es alumno" = ningún estudiante del team lo
  // apunta por `dependiente_id`. El criterio es SOLO ese: dos personas pueden
  // llamarse igual sin ser la misma, y cruzarlas por nombre escondería alumnos.
  const filtrosDep = [
    eq(dependientes.teamId, teamId),
    notExists(db.select({ x: sql`1` }).from(adminEscolarEstudiantes).where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      eq(adminEscolarEstudiantes.dependienteId, dependientes.id),
    ))),
  ];
  if (q) {
    const p = `%${q}%`;
    filtrosDep.push(or(
      ilike(dependientes.nombre, p),
      ilike(dependientes.apellido, p),
      ilike(sql`${dependientes.nombre} || ' ' || ${dependientes.apellido}`, p),
      // El equivalente a buscar por tutor en los alumnos: el contacto al que se
      // le factura.
      ilike(clients.razonSocial, p),
    )!);
  }
  const whereDep = and(...filtrosDep);

  // Conteos del set filtrado (para la paginación). El de beneficiarios se pide
  // siempre, aunque los filtros los dejen fuera, porque la pantalla avisa de
  // cuántos está escondiendo.
  const [[{ total: totalEstudiantes }], [{ total: sinMatricular }]] = await Promise.all([
    db.select({ total: count() }).from(adminEscolarEstudiantes).where(where),
    db.select({ total: count() }).from(dependientes)
      .innerJoin(clients, eq(dependientes.clientId, clients.id))
      .where(whereDep),
  ]);

  const total = totalEstudiantes + (incluirDependientes ? sinMatricular : 0);
  if (total === 0) return { estudiantes: [], total: 0, sinMatricular };

  // Página: la unión de los dos orígenes, ordenada y cortada en la base. Las
  // columnas que el beneficiario no tiene van NULL (no cero) para que la
  // pantalla pueda pintarlas como «—» en vez de inventar datos.
  //
  // El orden va por `upper(...)`: la base es C.UTF-8 (ordena por byte) y los
  // alumnos importados de SIGERD están en MAYÚSCULAS mientras que los
  // beneficiarios se escribieron a mano en Contactos. Ordenando en crudo, TODAS
  // las mayúsculas iban primero y los beneficiarios quedaban amontonados en las
  // últimas páginas en vez de intercalados por apellido.
  const ramaDependientes = incluirDependientes ? sql`
      UNION ALL
      SELECT 'dependiente',
             dependientes.id,
             dependientes.id,
             NULL,
             dependientes.nombre,
             dependientes.apellido,
             NULL,
             NULL,
             NULL,
             clients.razon_social
      FROM dependientes
      JOIN clients ON clients.id = dependientes.client_id
      WHERE ${whereDep}` : sql``;

  const filas = await db.execute(sql`
    SELECT * FROM (
      SELECT 'estudiante' AS origen,
             admin_escolar_estudiantes.id               AS id,
             admin_escolar_estudiantes.dependiente_id   AS dependiente_id,
             admin_escolar_estudiantes.codigo           AS codigo,
             admin_escolar_estudiantes.nombres          AS nombres,
             admin_escolar_estudiantes.apellidos        AS apellidos,
             admin_escolar_estudiantes.estado           AS estado,
             admin_escolar_estudiantes.sexo             AS sexo,
             -- ::text a propósito: esto es SQL crudo, así que drizzle no mapea
             -- la columna de tipo date y el driver la devolvería como Date de
             -- JS (con hora y zona), que es justo lo que el listado no quiere.
             admin_escolar_estudiantes.fecha_nacimiento::text AS fecha_nacimiento,
             NULL::varchar                              AS contacto
      FROM admin_escolar_estudiantes
      WHERE ${where}${ramaDependientes}
    ) u
    ORDER BY upper(u.apellidos), upper(u.nombres), u.origen, u.id
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as FilaListado[];

  const ids = filas.filter((f) => f.origen === 'estudiante').map((f) => Number(f.id));

  // Los enriquecimientos dependen solo de los ids de la página, así que se
  // piden juntos: en serie eran varios viajes seguidos a la base para pintar
  // una sola pantalla. Si la página trae solo beneficiarios no hay nada que
  // enriquecer y no se pide nada.
  const { matriculas, tutores, deudas, pagos, contactos } = await enriquecerPagina(teamId, ids);

  const matriculaPorEst = new Map<number, (typeof matriculas)[number]>();
  for (const m of matriculas) {
    if (!matriculaPorEst.has(m.estudianteId)) matriculaPorEst.set(m.estudianteId, m);
  }
  const tutorPorEst = new Map(tutores.map((t) => [t.estudianteId, t]));
  const deudaPorEst = new Map(deudas.map((d) => [d.estudianteId, d]));
  const contactoPorEst = new Map(contactos.map((c) => [c.id, c.contacto]));
  const ultimoPagoPorEst = new Map<number, { fecha: string; monto: number }>();
  for (const p of pagos) {
    if (!ultimoPagoPorEst.has(p.estudianteId)) {
      ultimoPagoPorEst.set(p.estudianteId, { fecha: p.fecha, monto: p.monto });
    }
  }

  const estudiantes: EstudianteEnriquecido[] = filas.map((f) => {
    const id = Number(f.id);
    const esDependiente = f.origen === 'dependiente';
    const m = esDependiente ? undefined : matriculaPorEst.get(id);
    const t = esDependiente ? undefined : tutorPorEst.get(id);
    const d = esDependiente ? undefined : deudaPorEst.get(id);
    const up = esDependiente ? undefined : ultimoPagoPorEst.get(id);
    return {
      origen: esDependiente ? 'dependiente' : 'estudiante',
      id,
      dependienteId: f.dependiente_id == null ? null : Number(f.dependiente_id),
      codigo: f.codigo,
      nombres: f.nombres,
      apellidos: f.apellidos,
      estado: f.estado,
      sexo: f.sexo,
      fechaNacimiento: f.fecha_nacimiento,
      matriculaActivaId: m?.id ?? null,
      periodoActivo: m?.periodo ?? null,
      cursoActual: m?.curso ?? null,
      contacto: esDependiente ? f.contacto : (contactoPorEst.get(id) ?? null),
      tutorResponsable: t?.nombre ?? null,
      tutorTelefono: t?.telefono ?? null,
      tutorEmail: t?.email ?? null,
      deudaCentavos: esDependiente ? null : (d?.deuda ?? 0),
      cargosPendientes: esDependiente ? null : (d?.cargos ?? 0),
      ultimoPagoFecha: up?.fecha ?? null,
      ultimoPagoCentavos: up?.monto ?? null,
    };
  });

  return { estudiantes, total, sinMatricular };
}

/** Una fila cruda de la unión alumnos + beneficiarios. */
interface FilaListado {
  origen: string;
  id: number | string;
  dependiente_id: number | string | null;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string | null;
  sexo: string | null;
  fecha_nacimiento: string | null;
  contacto: string | null;
}

/** Datos derivados de los alumnos de la página (matrícula, tutor, deuda, pagos, contacto). */
async function enriquecerPagina(teamId: number, ids: number[]) {
  if (ids.length === 0) {
    return { matriculas: [], tutores: [], deudas: [], pagos: [], contactos: [] };
  }

  const [matriculas, tutores, deudas, pagos, contactos] = await Promise.all([
  // Matrícula activa + período + curso. Si un estudiante tiene varias activas
  // (distintos períodos), se muestra la del período más reciente.
  db
    .select({
      id: adminEscolarMatriculas.id,
      periodoId: adminEscolarMatriculas.periodoId,
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodo: adminEscolarPeriodos.nombre,
      curso: adminEscolarCursos.nombre,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarPeriodos, and(
      eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id),
      eq(adminEscolarPeriodos.teamId, teamId),
    ))
    .leftJoin(adminEscolarCursos, and(
      eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id),
      eq(adminEscolarCursos.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      inArray(adminEscolarMatriculas.estudianteId, ids),
    ))
    .orderBy(desc(adminEscolarMatriculas.periodoId)),

  // El responsable de pago: el CONTACTO al que se le factura. Antes salía del
  // tutor con la casilla `responsable_pago`, que ya nadie marca — el listado
  // enseñaba a todo el mundo sin responsable ni teléfono.
  db
    .select({
      estudianteId: adminEscolarEstudiantes.id,
      nombre: clients.razonSocial,
      telefono: sql<string | null>`COALESCE(NULLIF(${clients.celular}, ''), ${clients.telefono})`,
      email: clients.email,
    })
    .from(adminEscolarEstudiantes)
    .innerJoin(clients, and(
      eq(clients.id, adminEscolarEstudiantes.facturarAClientId),
      eq(clients.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      inArray(adminEscolarEstudiantes.id, ids),
    )),

  // Deuda viva (suma de saldo) + conteo de cargos pendientes.
  db
    .select({
      estudianteId: adminEscolarCargos.estudianteId,
      deuda: sql<number>`COALESCE(SUM(${adminEscolarCargos.saldoCentavos}), 0)::int`,
      cargos: sql<number>`COUNT(*)::int`,
    })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.estado, [...ESTADOS_DEUDA]),
      inArray(adminEscolarCargos.estudianteId, ids),
    ))
    .groupBy(adminEscolarCargos.estudianteId),

  // Último pago.
  db
    .select({
      estudianteId: adminEscolarPagos.estudianteId,
      fecha: adminEscolarPagos.fechaPago,
      monto: adminEscolarPagos.montoCentavos,
      createdAt: adminEscolarPagos.createdAt,
    })
    .from(adminEscolarPagos)
    .where(and(
      eq(adminEscolarPagos.teamId, teamId),
      inArray(adminEscolarPagos.estudianteId, ids),
    ))
    .orderBy(desc(adminEscolarPagos.fechaPago), desc(adminEscolarPagos.createdAt)),

  // El contacto (padre) al que se le factura. Primero por el beneficiario
  // enlazado, y si el alumno no tiene enlace, por el contacto del tutor
  // responsable de pago. Van como subconsultas escalares y no como JOIN porque
  // nada impide que un alumno tenga dos tutores marcados como responsables, y
  // con JOIN esa fila salía dos veces en el listado.
  db
    .select({
      id: adminEscolarEstudiantes.id,
      // Las columnas del alumno van escritas con su tabla delante y NO como
      // `${adminEscolarEstudiantes.id}`: dentro de una plantilla `sql` cruda
      // drizzle las emite sin prefijo —«id» pelado— y ahí dentro hay tres
      // tablas con esa columna (et, t, c), así que Postgres no sabía de cuál
      // hablaba y la consulta entera moría con «column reference "id" is
      // ambiguous». La primera subconsulta se salvaba de milagro: ninguna de
      // sus tablas tiene `dependiente_id`.
      // Primero el responsable de pago del alumno, que es a quien se le
      // factura; el beneficiario de Contactos queda de respaldo para los que
      // se importaron antes de que existiera ese campo.
      //
      // La segunda rama era el tutor con `responsable_pago = true`: esa casilla
      // dejó de marcarse al separarse tutor y responsable, así que nunca
      // acertaba y la columna salía vacía para todo el que no viniera de
      // Contactos.
      contacto: sql<string | null>`COALESCE(
        (SELECT c.razon_social FROM clients c
          WHERE c.id = admin_escolar_estudiantes.facturar_a_client_id AND c.team_id = ${teamId}),
        (SELECT c.razon_social
           FROM dependientes d
           JOIN clients c ON c.id = d.client_id
          WHERE d.id = admin_escolar_estudiantes.dependiente_id AND d.team_id = ${teamId})
      )`,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      inArray(adminEscolarEstudiantes.id, ids),
    )),
  ]);

  return { matriculas, tutores, deudas, pagos, contactos };
}

export interface EstadisticasEstudiantes {
  activos: number;
  balancePendienteCentavos: number;
  morosos: number;
}

/**
 * Estadísticas globales del team para las tarjetas del listado (independientes
 * de la página y de los filtros). Asume que `sincronizarSaldosDesdeFacturas` ya
 * corrió en la misma petición (lo hace el listado antes de llamar aquí).
 */
export async function estadisticasEstudiantes(teamId: number): Promise<EstadisticasEstudiantes> {
  const [act] = await db
    .select({ n: count() })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.teamId, teamId), eq(adminEscolarEstudiantes.estado, 'activo')));

  const [bal] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${adminEscolarCargos.saldoCentavos}), 0)::int`,
      morosos: sql<number>`COUNT(DISTINCT ${adminEscolarCargos.estudianteId})::int`,
    })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.estado, [...ESTADOS_DEUDA]),
    ));

  return {
    activos: act?.n ?? 0,
    balancePendienteCentavos: bal?.total ?? 0,
    morosos: bal?.morosos ?? 0,
  };
}

/**
 * Sincroniza saldo/estado de los cargos CON factura vinculada, derivándolos del
 * ledger de cobro de la factura (`ecf_documents.estado_pago` + suma de
 * `pagos_recibidos`). Unidireccional: lee la factura, escribe solo sus cargos.
 *
 * Regla del negocio (Alex): todo pago va atado a la factura; el módulo no crea
 * un sistema de cobro paralelo. Ver [[no-contaminar-entidades-genericas]].
 *
 * N:1 — una factura puede cubrir VARIOS cargos (incluso de distintos estudiantes,
 * p. ej. la factura de un tutor con varios hijos). Lo que se REPARTE es lo
 * COBRADO, en cascada por vencimiento (los más viejos primero), y el tope de
 * cada cargo es su propio `montoCentavos`:
 *
 *     saldo del cargo = montoCentavos − lo que le tocó del cobro
 *
 * Se reparte el cobro y no el total de la factura a propósito: la factura suele
 * valer MÁS que la suma de sus cargos (lleva ITBIS, y puede traer líneas que no
 * son del colegio). Repartiendo el total, un cargo de 1,000 dentro de una
 * factura de 1,180 arrastraba una deuda de 180 que no existe.
 *
 * Lo cobrado = pagos recibidos + notas de crédito aplicadas. Sin las NC, una
 * nota que ya redujo la factura dejaba el cargo mostrando deuda fantasma.
 *
 * Anular la FACTURA no perdona la deuda: el documento se anula, pero el colegio
 * sigue teniendo su acreencia. El cargo vuelve a estar sin facturar
 * (ecfDocumentId = null, saldo completo) para poder re-facturarlo. El estado
 * `anulado` queda solo para la anulación escolar manual, que esta función no
 * toca.
 */
export async function sincronizarSaldosDesdeFacturas(
  teamId: number,
  estudianteId?: number,
): Promise<void> {
  // 1. Facturas relevantes = las vinculadas a (los cargos de) el estudiante.
  const scope = [
    eq(adminEscolarCargos.teamId, teamId),
    isNotNull(adminEscolarCargos.ecfDocumentId),
  ];
  if (estudianteId != null) scope.push(eq(adminEscolarCargos.estudianteId, estudianteId));
  const relevantes = await db
    .selectDistinct({ ecfDocumentId: adminEscolarCargos.ecfDocumentId })
    .from(adminEscolarCargos)
    .where(and(...scope));
  const facturaIds = relevantes
    .map((r) => r.ecfDocumentId)
    .filter((x): x is number => x != null);
  if (facturaIds.length === 0) return;

  // 2-3. Cargos, facturas y pagos dependen los tres solo de `facturaIds`, así
  //       que se piden a la vez: en serie eran tres viajes a la base por cada
  //       carga del listado.
  const [cargos, facturas, pagos] = await Promise.all([
    db
    .select({
      id: adminEscolarCargos.id,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      estado: adminEscolarCargos.estado,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
    })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.ecfDocumentId, facturaIds),
      ne(adminEscolarCargos.estado, 'anulado'),
    )),

  // Info de cada factura + lo COBRADO = pagos recibidos + notas de crédito.
  db
    .select({
      id: ecfDocuments.id,
      montoTotal: ecfDocuments.montoTotal,
      estadoPago: ecfDocuments.estadoPago,
      // Crédito aplicado por NC (tipo 34) atadas a esta factura. Mismas reglas
      // que getCuentasPorCobrar: solo las del modelo viejo (las nuevas generan
      // saldo a favor del cliente), sin anuladas/rechazadas, y el código 2
      // (corrige texto) no mueve dinero.
      ncAplicado: sql<number>`COALESCE((
        SELECT SUM(nc.monto_total) FROM ecf_documents nc
        WHERE nc.team_id = ecf_documents.team_id
          AND nc.tipo_ecf = '34'
          AND nc.credito_generado_cents IS NULL
          AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
          AND nc.codigo_modificacion IS DISTINCT FROM 2
          AND (
            nc.origen_documento_id = ecf_documents.id
            OR (ecf_documents.encf LIKE 'E%' AND nc.ncf_modificado = ecf_documents.encf)
          )
      ), 0)::int`,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.id, facturaIds))),

  db
    .select({
      ecfDocumentId: pagosRecibidos.ecfDocumentId,
      pagado: sql<number>`COALESCE(SUM(${pagosRecibidos.montoCentavos}), 0)::int`,
    })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.teamId, teamId), inArray(pagosRecibidos.ecfDocumentId, facturaIds)))
    .groupBy(pagosRecibidos.ecfDocumentId),
  ]);

  const facturaById = new Map(facturas.map((f) => [f.id, f]));
  const pagadoById = new Map(pagos.map((p) => [p.ecfDocumentId, Number(p.pagado)]));

  const hoy = new Date().toISOString().slice(0, 10);

  // 4. Agrupar cargos por factura y repartir lo cobrado en cascada.
  const porFactura = new Map<number, typeof cargos>();
  for (const c of cargos) {
    if (c.ecfDocumentId == null) continue;
    const arr = porFactura.get(c.ecfDocumentId) ?? [];
    arr.push(c);
    porFactura.set(c.ecfDocumentId, arr);
  }

  const updates: SaldoCalculado[] = [];

  const porId = new Map(cargos.map(c => [c.id, c]));

  for (const [fid, grupo] of porFactura) {
    const f = facturaById.get(fid);
    if (!f) continue;

    const anulada = f.estadoPago === 'ANULADA';
    // Factura sin importe: no dice nada sobre el cobro, así que no se toca
    // nada (si no, marcaría todos sus cargos como pagados).
    if (!anulada && f.montoTotal <= 0) continue;

    // Lo cobrado incluye las NC: ya redujeron lo que la familia debe.
    const cobrado = (pagadoById.get(fid) ?? 0) + Number(f.ncAplicado ?? 0);

    const calculados = repartirCobro(grupo, cobrado, hoy, {
      facturaAnulada: anulada,
      facturaSaldada: f.estadoPago === 'PAGADA' || f.estadoPago === 'GRATUITA',
    });

    for (const r of calculados) {
      const actual = porId.get(r.id);
      if (!actual) continue;
      const cambia = r.saldo !== actual.saldoCentavos
        || r.estado !== actual.estado
        || (r.desvincular && actual.ecfDocumentId != null);
      if (cambia) updates.push(r);
    }
  }

  // 5. Persistir solo los cambios, todo o nada: a medias quedarían saldos que
  //    no cuadran con la factura.
  //
  //    Va en UNA sentencia y no en un UPDATE por cargo dentro de una
  //    transacción. Esto corre al abrir el listado de estudiantes, y un colegio
  //    con 465 alumnos genera unos 5.100 cargos al año: un ida y vuelta por
  //    cargo convertía una simple lectura en cientos de escrituras en serie,
  //    con la tabla bloqueada mientras tanto.
  if (updates.length === 0) return;

  const valores = sql.join(
    updates.map((u) => sql`(${u.id}::int, ${u.saldo}::int, ${u.estado}::varchar, ${u.desvincular}::boolean)`),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE ${adminEscolarCargos} AS c
    SET saldo_centavos = v.saldo,
        estado         = v.estado,
        ecf_document_id = CASE WHEN v.desvincular THEN NULL ELSE c.ecf_document_id END,
        updated_at     = now()
    FROM (VALUES ${valores}) AS v(id, saldo, estado, desvincular)
    WHERE c.id = v.id AND c.team_id = ${teamId}
  `);
}

/**
 * Genera el código de estudiante `AAAA-####` ligado al AÑO de su primera
 * inscripción (inscrito, nunca reinscripción). Secuencia por (team, año): toma
 * el mayor sufijo existente con ese prefijo y suma 1. Inmutable: se asigna una
 * sola vez al crear el estudiante con su primera matrícula.
 *
 * Nota: sin constraint de unicidad (los códigos legacy podían ser manuales o
 * nulos). Colisión sólo posible con dos altas simultáneas del mismo año —
 * aceptable para el volumen actual.
 */
export async function generarCodigoEstudiante(teamId: number, anio: number): Promise<string> {
  const prefijo = `${anio}-`;
  const rows = await db
    .select({ codigo: adminEscolarEstudiantes.codigo })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      like(adminEscolarEstudiantes.codigo, `${prefijo}%`),
    ));
  let max = 0;
  for (const r of rows) {
    const n = parseInt((r.codigo ?? '').slice(prefijo.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefijo}${String(max + 1).padStart(4, '0')}`;
}

/** Deuda viva total (centavos) de un estudiante. */
export async function deudaEstudiante(teamId: number, estudianteId: number): Promise<number> {
  const [row] = await db
    .select({ deuda: sql<number>`COALESCE(SUM(${adminEscolarCargos.saldoCentavos}), 0)::int` })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, estudianteId),
      inArray(adminEscolarCargos.estado, [...ESTADOS_DEUDA]),
    ));
  return row?.deuda ?? 0;
}
