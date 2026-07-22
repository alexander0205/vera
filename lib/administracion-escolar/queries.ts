/**
 * Consultas y helpers del módulo Administración Escolar.
 *
 * Enriquecimiento del estudiante (deuda total, matrícula activa, tutor
 * responsable, último pago) para el listado y la ficha lateral. Toda la lógica
 * de agregación vive aquí para no repetirla entre rutas.
 */
import 'server-only';
import { and, eq, ne, desc, sql, inArray, isNotNull, like, ilike, or, count, exists } from 'drizzle-orm';
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
  ecfDocuments,
  pagosRecibidos,
} from '@/lib/db/schema';

/** Estados de cargo que cuentan como deuda viva. */
export const ESTADOS_DEUDA = ['pendiente', 'parcial', 'vencido'] as const;

export interface EstudianteEnriquecido {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string;
  sexo: string | null;
  fechaNacimiento: string | null;
  // Derivados
  matriculaActivaId: number | null;
  periodoActivo: string | null;
  cursoActual: string | null;
  tutorResponsable: string | null;
  tutorTelefono: string | null;
  tutorEmail: string | null;
  deudaCentavos: number;
  cargosPendientes: number;
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
}

export interface ListarEstudiantesResult {
  estudiantes: EstudianteEnriquecido[];
  total: number;
}

/**
 * Listado paginado de estudiantes del team con datos derivados. El filtrado,
 * la búsqueda y el orden ocurren en SQL sobre la tabla base (con la matrícula
 * activa y el tutor responsable en JOIN); solo se enriquece la PÁGINA devuelta
 * (deuda + último pago por los ids de la página) — así no se traen todos los
 * estudiantes ni se calcula deuda de golpe. Ver `docs/plan-optimizacion-db.md`.
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
      exists(db.select({ x: sql`1` }).from(adminEscolarEstudianteTutores)
        .innerJoin(adminEscolarTutores, and(
          eq(adminEscolarTutores.id, adminEscolarEstudianteTutores.tutorId),
          eq(adminEscolarTutores.teamId, teamId),
        ))
        .where(and(
          eq(adminEscolarEstudianteTutores.estudianteId, adminEscolarEstudiantes.id),
          eq(adminEscolarEstudianteTutores.teamId, teamId),
          eq(adminEscolarEstudianteTutores.responsablePago, true),
          ilike(adminEscolarTutores.nombre, p),
        ))),
    )!);
  }
  const where = and(...filtros);

  // Conteo total del set filtrado (para la paginación).
  const [{ total }] = await db
    .select({ total: count() })
    .from(adminEscolarEstudiantes)
    .where(where);

  if (total === 0) return { estudiantes: [], total: 0 };

  // Página: solo la tabla base (una fila por estudiante).
  const base = await db
    .select()
    .from(adminEscolarEstudiantes)
    .where(where)
    .orderBy(adminEscolarEstudiantes.apellidos, adminEscolarEstudiantes.nombres)
    .limit(limit)
    .offset(offset);

  const ids = base.map((e) => e.id);

  // Matrícula activa + período + curso SOLO de la página. Si un estudiante tiene
  // varias activas (distintos períodos), se muestra la del período más reciente.
  const matriculas = await db
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
    .orderBy(desc(adminEscolarMatriculas.periodoId));
  const matriculaPorEst = new Map<number, (typeof matriculas)[number]>();
  for (const m of matriculas) {
    if (!matriculaPorEst.has(m.estudianteId)) matriculaPorEst.set(m.estudianteId, m);
  }

  // Tutor responsable de pago SOLO de la página.
  const tutores = await db
    .select({
      estudianteId: adminEscolarEstudianteTutores.estudianteId,
      nombre: adminEscolarTutores.nombre,
      telefono: adminEscolarTutores.telefono,
      email: adminEscolarTutores.email,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
      inArray(adminEscolarEstudianteTutores.estudianteId, ids),
    ));
  const tutorPorEst = new Map(tutores.map((t) => [t.estudianteId, t]));

  // Deuda viva (suma de saldo) + conteo de cargos pendientes SOLO de la página.
  const deudas = await db
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
    .groupBy(adminEscolarCargos.estudianteId);
  const deudaPorEst = new Map(deudas.map((d) => [d.estudianteId, d]));

  // Último pago SOLO de la página.
  const pagos = await db
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
    .orderBy(desc(adminEscolarPagos.fechaPago), desc(adminEscolarPagos.createdAt));
  const ultimoPagoPorEst = new Map<number, { fecha: string; monto: number }>();
  for (const p of pagos) {
    if (!ultimoPagoPorEst.has(p.estudianteId)) {
      ultimoPagoPorEst.set(p.estudianteId, { fecha: p.fecha, monto: p.monto });
    }
  }

  const estudiantes = base.map((e) => {
    const m = matriculaPorEst.get(e.id);
    const t = tutorPorEst.get(e.id);
    const d = deudaPorEst.get(e.id);
    const up = ultimoPagoPorEst.get(e.id);
    return {
      id: e.id,
      codigo: e.codigo,
      nombres: e.nombres,
      apellidos: e.apellidos,
      estado: e.estado,
      sexo: e.sexo,
      fechaNacimiento: e.fechaNacimiento,
      matriculaActivaId: m?.id ?? null,
      periodoActivo: m?.periodo ?? null,
      cursoActual: m?.curso ?? null,
      tutorResponsable: t?.nombre ?? null,
      tutorTelefono: t?.telefono ?? null,
      tutorEmail: t?.email ?? null,
      deudaCentavos: d?.deuda ?? 0,
      cargosPendientes: d?.cargos ?? 0,
      ultimoPagoFecha: up?.fecha ?? null,
      ultimoPagoCentavos: up?.monto ?? null,
    };
  });

  return { estudiantes, total };
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

  // 2. TODOS los cargos (cualquier estudiante) atados a esas facturas — se
  //    necesitan completos para repartir bien el cobro. Excluye anulados.
  const cargos = await db
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
    ));

  // 3. Info de cada factura + lo COBRADO = pagos recibidos + notas de crédito.
  const facturas = await db
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
    .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.id, facturaIds)));
  const facturaById = new Map(facturas.map((f) => [f.id, f]));

  const pagos = await db
    .select({
      ecfDocumentId: pagosRecibidos.ecfDocumentId,
      pagado: sql<number>`COALESCE(SUM(${pagosRecibidos.montoCentavos}), 0)::int`,
    })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.teamId, teamId), inArray(pagosRecibidos.ecfDocumentId, facturaIds)))
    .groupBy(pagosRecibidos.ecfDocumentId);
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
  if (updates.length === 0) return;
  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx.update(adminEscolarCargos)
        .set({
          saldoCentavos: u.saldo,
          estado: u.estado,
          ...(u.desvincular ? { ecfDocumentId: null } : {}),
          updatedAt: new Date(),
        })
        .where(and(
          eq(adminEscolarCargos.id, u.id),
          eq(adminEscolarCargos.teamId, teamId),
        ));
    }
  });
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
