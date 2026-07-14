/**
 * Consultas y helpers del módulo Administración Escolar.
 *
 * Enriquecimiento del estudiante (deuda total, matrícula activa, tutor
 * responsable, último pago) para el listado y la ficha lateral. Toda la lógica
 * de agregación vive aquí para no repetirla entre rutas.
 */
import 'server-only';
import { and, eq, ne, desc, sql, inArray, isNotNull, like } from 'drizzle-orm';
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

/**
 * Listado de estudiantes del team con datos derivados. Un solo viaje por tabla
 * agregada (matrícula activa, tutor responsable, deuda, último pago) y merge en
 * memoria — evita N+1.
 */
export async function listarEstudiantesEnriquecidos(
  teamId: number,
): Promise<EstudianteEnriquecido[]> {
  const estudiantes = await db
    .select()
    .from(adminEscolarEstudiantes)
    .where(eq(adminEscolarEstudiantes.teamId, teamId))
    .orderBy(adminEscolarEstudiantes.apellidos, adminEscolarEstudiantes.nombres);

  if (estudiantes.length === 0) return [];
  const ids = estudiantes.map((e) => e.id);

  // Refleja el cobro de las facturas vinculadas (todo el team) antes de sumar la
  // deuda, para que el listado no quede rezagado respecto al perfil.
  await sincronizarSaldosDesdeFacturas(teamId);

  // Matrícula activa + período + curso por estudiante.
  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodo: adminEscolarPeriodos.nombre,
      curso: adminEscolarCursos.nombre,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
    .leftJoin(adminEscolarCursos, eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      inArray(adminEscolarMatriculas.estudianteId, ids),
    ));
  const matriculaPorEst = new Map(matriculas.map((m) => [m.estudianteId, m]));

  // Tutor responsable de pago por estudiante.
  const tutores = await db
    .select({
      estudianteId: adminEscolarEstudianteTutores.estudianteId,
      nombre: adminEscolarTutores.nombre,
      telefono: adminEscolarTutores.telefono,
      email: adminEscolarTutores.email,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
      inArray(adminEscolarEstudianteTutores.estudianteId, ids),
    ));
  const tutorPorEst = new Map(tutores.map((t) => [t.estudianteId, t]));

  // Deuda viva (suma de saldo) + conteo de cargos pendientes por estudiante.
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

  // Último pago por estudiante.
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

  return estudiantes.map((e) => {
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
 * p. ej. la factura de un tutor con varios hijos). El cobro se REPARTE entre sus
 * cargos: a cada uno le toca una porción proporcional del total de la factura
 * (según su monto; las porciones suman el total → sin doble conteo) y el pagado
 * se aplica en CASCADA por vencimiento (los más viejos primero → estados limpios).
 * Generaliza el 1:1 (un cargo → su porción = total de la factura).
 *
 * Cargos ya `anulado` (anulación escolar manual) no se tocan.
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

  // 3. Info de cada factura + total cobrado (ledger pagos_recibidos).
  const facturas = await db
    .select({ id: ecfDocuments.id, montoTotal: ecfDocuments.montoTotal, estadoPago: ecfDocuments.estadoPago })
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

  // 4. Agrupar cargos por factura y repartir cobro (proporcional + cascada).
  const porFactura = new Map<number, typeof cargos>();
  for (const c of cargos) {
    if (c.ecfDocumentId == null) continue;
    const arr = porFactura.get(c.ecfDocumentId) ?? [];
    arr.push(c);
    porFactura.set(c.ecfDocumentId, arr);
  }

  const updates: { id: number; saldo: number; estado: string }[] = [];

  for (const [fid, grupo] of porFactura) {
    const f = facturaById.get(fid);
    if (!f) continue;
    // Cascada: vencimiento más viejo primero, luego id (sin venc va al final).
    grupo.sort((a, b) => {
      const va = a.fechaVencimiento ?? '9999-12-31';
      const vb = b.fechaVencimiento ?? '9999-12-31';
      if (va !== vb) return va < vb ? -1 : 1;
      return a.id - b.id;
    });

    const sumMonto = grupo.reduce((s, c) => s + c.montoCentavos, 0);
    // Porción de cada cargo sobre el total de la factura. El último absorbe el
    // redondeo para que las porciones sumen exactamente montoTotal.
    const shares: number[] = [];
    let acc = 0;
    grupo.forEach((c, i) => {
      if (i === grupo.length - 1) {
        shares.push(f.montoTotal - acc);
      } else {
        const s = sumMonto > 0 ? Math.round((f.montoTotal * c.montoCentavos) / sumMonto) : 0;
        shares.push(s);
        acc += s;
      }
    });

    const anulada = f.estadoPago === 'ANULADA';
    const pagadaTotal = f.estadoPago === 'PAGADA' || f.estadoPago === 'GRATUITA';
    let restante = pagadoById.get(fid) ?? 0;

    grupo.forEach((c, i) => {
      const share = shares[i];
      const aplicado = Math.min(restante, share);
      restante -= aplicado;
      let saldo = Math.max(0, share - aplicado);
      let estado: string;
      if (anulada) { estado = 'anulado'; }
      else if (pagadaTotal) { estado = 'pagado'; saldo = 0; }
      else if (saldo === 0) { estado = 'pagado'; }
      else if (aplicado > 0) { estado = 'parcial'; }
      else if (c.fechaVencimiento && c.fechaVencimiento < hoy) { estado = 'vencido'; }
      else { estado = 'pendiente'; }
      if (saldo !== c.saldoCentavos || estado !== c.estado) {
        updates.push({ id: c.id, saldo, estado });
      }
    });
  }

  // 5. Persistir solo los cambios.
  for (const u of updates) {
    await db.update(adminEscolarCargos)
      .set({ saldoCentavos: u.saldo, estado: u.estado, updatedAt: new Date() })
      .where(eq(adminEscolarCargos.id, u.id));
  }
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
