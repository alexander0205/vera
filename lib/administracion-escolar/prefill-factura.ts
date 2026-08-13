import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { armarPlanDeCobro } from './plan-cobro';
import { contextoDeSeccion } from './tarifas';
import {
  adminEscolarCargos,
  adminEscolarConceptosPago,
  adminEscolarCursos,
  adminEscolarEstudiantes,
  adminEscolarEstudianteTutores,
  adminEscolarGrados,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarServicios,
  adminEscolarTutores,
  clients,
  dependientes,
  products,
} from '@/lib/db/schema';

/**
 * Todo lo que hace falta para facturar cargos escolares, en una sola consulta.
 *
 * Es el hermano por lotes de `/cargos/[id]/prefill-factura`, y existe porque el
 * modal de facturar no enseña solo el cargo en el que se hizo click: enseña
 * también los demás pendientes del alumno para poder cobrarlos de una vez. Un
 * padre que viene a ponerse al día paga tres meses con UNA factura, no con tres.
 *
 * Lo que NUNCA entra son los cargos que ya tienen factura: ese cargo ya está
 * atado a un documento y meterlo en otro sería cobrarlo dos veces.
 *
 * No crea ni emite nada. Solo lee.
 */

export interface LineaPrefill {
  productoId: number | null;
  nombreItem: string;
  cantidadItem: number;
  /** En PESOS, que es como trabaja el formulario de factura. */
  precioUnitarioItem: number;
  tasaItbis: string;
  indicadorBienoServicio: string;
  dependienteId: number | null;
  dependienteNombre: string;
}

export interface OpcionCargo {
  /** 0 en una cuota que TODAVÍA no es cargo (ver `previstoCuotaId`). */
  cargoId: number;
  /**
   * Cuota del calendario que aún no se ha devengado.
   *
   * Está aquí para poder facturar un mes por adelantado sin haber creado antes
   * la deuda: no puede haber un cargo pendiente de un mes que nadie ha
   * facturado. El cargo se crea al confirmar la factura, no al abrir el modal.
   */
  previstoCuotaId?: number;
  conceptoId?: number;
  /** Venía en la petición: sale marcado en el modal. */
  seleccionado: boolean;
  concepto: string;
  esMensualidad: boolean;
  mes: number | null;
  anio: number;
  fechaVencimiento: string | null;
  saldoCentavos: number;
  linea: LineaPrefill;
}

export interface Comprador {
  clienteId: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  /** 'tutor' = responsable de pago · 'otro' = tutor sin ese marcaje ·
   *  'guardado' = el contacto fijado para este alumno (p.ej. su empresa). */
  origen: 'tutor' | 'otro' | 'guardado';
  /** Cómo se llama en la familia: madre, padre, abuela… Solo para reconocerlo. */
  relacion: string | null;
}

export interface PrefillFactura {
  estudiante: { id: number; nombre: string };
  matriculaId: number;
  /**
   * Dónde está matriculado, para poder distinguir la línea. Dos hermanos en el
   * mismo colegio generan facturas idénticas si solo dicen "Pago de
   * colegiatura — Octubre".
   */
  contexto: { periodo: string | null; servicio: string | null; grado: string | null; curso: string | null };
  /** El que sale elegido: el guardado si lo hay, si no el responsable de pago. */
  comprador: Comprador | null;
  /** Todos a los que se les puede facturar sin buscar nada. */
  compradores: Comprador[];
  opciones: OpcionCargo[];
  advertencias: string[];
}

export type PrefillError =
  | { ok: false; status: number; error: string };

const COBRABLES = ['pendiente', 'parcial', 'vencido'];
const TASAS_VALIDAS = ['0.18', '0.16', '0', 'exento'];

export interface PrevistoPedido {
  matriculaId: number;
  cuotaId: number;
  conceptoId: number;
}

export async function prefillDeCargos(
  teamId: number, cargoIds: number[], previsto?: PrevistoPedido,
): Promise<{ ok: true; datos: PrefillFactura } | PrefillError> {
  if (cargoIds.length === 0 && !previsto) {
    return { ok: false, status: 400, error: 'No se indicó ningún cargo' };
  }

  const pedidos = await db
    .select({
      id: adminEscolarCargos.id,
      estudianteId: adminEscolarCargos.estudianteId,
      matriculaId: adminEscolarCargos.matriculaId,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
    })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.id, cargoIds),
    ));

  if (pedidos.length !== cargoIds.length) {
    return { ok: false, status: 404, error: 'Algún cargo no existe' };
  }

  // Solo previsto: no hay cargo del que colgar nada, así que el alumno y la
  // matrícula salen de la matrícula que se pidió.
  let baseEstudianteId: number | null = pedidos[0]?.estudianteId ?? null;
  let baseMatriculaId: number | null = pedidos[0]?.matriculaId ?? null;
  if (previsto) {
    const [m] = await db
      .select({ id: adminEscolarMatriculas.id, estudianteId: adminEscolarMatriculas.estudianteId })
      .from(adminEscolarMatriculas)
      .where(and(
        eq(adminEscolarMatriculas.id, previsto.matriculaId),
        eq(adminEscolarMatriculas.teamId, teamId),
      ))
      .limit(1);
    if (!m) return { ok: false, status: 404, error: 'Matrícula no encontrada' };
    // Un previsto de otra matrícula no se mezcla con estos cargos.
    if (baseMatriculaId != null && baseMatriculaId !== m.id) {
      return { ok: false, status: 400, error: 'La cuota es de otra matrícula' };
    }
    baseEstudianteId = m.estudianteId;
    baseMatriculaId = m.id;
  }
  if (baseEstudianteId == null || baseMatriculaId == null) {
    return { ok: false, status: 400, error: 'No se pudo resolver la matrícula' };
  }
  if (pedidos.some((c) => c.ecfDocumentId != null)) {
    return { ok: false, status: 409, error: 'Alguno de esos cargos ya tiene factura' };
  }
  if (pedidos.some((c) => !COBRABLES.includes(c.estado))) {
    return { ok: false, status: 409, error: 'Alguno de esos cargos no está pendiente de cobro' };
  }
  // Una factura es de UN comprador. Mezclar alumnos aquí acabaría cobrándole a
  // un tutor la mensualidad del hijo de otro.
  const estudianteId = baseEstudianteId;
  if (pedidos.some((c) => c.estudianteId !== estudianteId)) {
    return { ok: false, status: 400, error: 'Los cargos son de estudiantes distintos' };
  }
  const matriculaId = baseMatriculaId;

  const advertencias: string[] = [];

  // ── El alumno y su dependiente (beneficiario de cada línea) ────────────────
  const [est] = await db
    .select({
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      dependienteId: adminEscolarEstudiantes.dependienteId,
      facturarAClientId: adminEscolarEstudiantes.facturarAClientId,
      dependienteNombre: dependientes.nombre,
      dependienteApellido: dependientes.apellido,
    })
    .from(adminEscolarEstudiantes)
    .leftJoin(dependientes, eq(adminEscolarEstudiantes.dependienteId, dependientes.id))
    .where(and(
      eq(adminEscolarEstudiantes.id, estudianteId),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .limit(1);
  if (!est) return { ok: false, status: 404, error: 'Estudiante no encontrado' };

  const dependiente = est.dependienteId
    ? {
        id: est.dependienteId,
        nombre: `${est.dependienteNombre ?? ''} ${est.dependienteApellido ?? ''}`.trim(),
      }
    : null;
  if (!dependiente) {
    advertencias.push('El estudiante no está vinculado a un dependiente de Contactos: las líneas quedarán sin beneficiario.');
  }

  // ── Dónde está matriculado, para poder distinguir la línea ────────────────
  const [ctx] = await db
    .select({
      periodo: adminEscolarPeriodos.nombre,
      servicio: adminEscolarServicios.nombre,
      grado: adminEscolarGrados.nombre,
      curso: adminEscolarCursos.nombre,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
    .leftJoin(adminEscolarCursos, eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id))
    .leftJoin(adminEscolarGrados, eq(adminEscolarCursos.gradoId, adminEscolarGrados.id))
    .leftJoin(adminEscolarServicios, eq(adminEscolarGrados.servicioId, adminEscolarServicios.id))
    .where(and(
      eq(adminEscolarMatriculas.id, matriculaId),
      eq(adminEscolarMatriculas.teamId, teamId),
    ))
    .limit(1);

  const contexto = {
    periodo: ctx?.periodo ?? null,
    servicio: ctx?.servicio ?? null,
    grado: ctx?.grado ?? null,
    curso: ctx?.curso ?? null,
  };

  // ── A quién se le puede facturar ───────────────────────────────────────────
  //
  // Todos los tutores del alumno que estén vinculados a un contacto, no solo el
  // responsable: en una familia pagan la madre unos meses y el padre otros, y
  // obligar a cambiar el marcaje de "responsable" para emitir una factura sería
  // reescribir la ficha del alumno por un asunto de caja.
  const vinculos = await db
    .select({
      clientId: adminEscolarTutores.clientId,
      relacion: adminEscolarEstudianteTutores.relacion,
      responsable: adminEscolarEstudianteTutores.responsablePago,
      razonSocial: clients.razonSocial,
      rnc: clients.rnc,
      email: clients.email,
      telefono: clients.telefono,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, teamId),
    ))
    .leftJoin(clients, eq(adminEscolarTutores.clientId, clients.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
      eq(adminEscolarEstudianteTutores.teamId, teamId),
    ));

  const compradores: Comprador[] = vinculos
    .filter((v) => v.clientId != null)
    .map((v) => ({
      clienteId: v.clientId!,
      razonSocial: v.razonSocial ?? '',
      rnc: v.rnc ?? null,
      email: v.email ?? null,
      telefono: v.telefono ?? null,
      origen: v.responsable ? 'tutor' as const : 'otro' as const,
      relacion: v.relacion ?? null,
    }));

  // El contacto fijado para este alumno (la empresa del padre, normalmente).
  // Puede no ser tutor de nadie, así que se busca aparte y se añade a la lista.
  if (est.facturarAClientId && !compradores.some((c) => c.clienteId === est.facturarAClientId)) {
    const [fijo] = await db
      .select({
        id: clients.id, razonSocial: clients.razonSocial,
        rnc: clients.rnc, email: clients.email, telefono: clients.telefono,
      })
      .from(clients)
      .where(and(eq(clients.id, est.facturarAClientId), eq(clients.teamId, teamId)))
      .limit(1);
    if (fijo) {
      compradores.unshift({
        clienteId: fijo.id,
        razonSocial: fijo.razonSocial ?? '',
        rnc: fijo.rnc ?? null,
        email: fijo.email ?? null,
        telefono: fijo.telefono ?? null,
        origen: 'guardado',
        relacion: null,
      });
    }
  }

  // Sale elegido el guardado si lo hay; si no, el responsable de pago.
  const comprador =
    compradores.find((c) => c.clienteId === est.facturarAClientId)
    ?? compradores.find((c) => c.origen === 'tutor')
    ?? null;

  if (!comprador) {
    advertencias.push('Ningún tutor del alumno está vinculado a un contacto: no se puede emitir la factura hasta arreglarlo.');
  }

  // ── Todo lo cobrable de esa matrícula, no solo lo que se pidió ─────────────
  const filas = await db
    .select({
      id: adminEscolarCargos.id,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      conceptoNombre: adminEscolarConceptosPago.nombre,
      conceptoTipo: adminEscolarConceptosPago.tipo,
      productId: adminEscolarConceptosPago.productId,
      productNombre: products.nombre,
      productTasa: products.tasaItbis,
      productTipo: products.tipo,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .leftJoin(products, eq(adminEscolarConceptosPago.productId, products.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.matriculaId, matriculaId),
      inArray(adminEscolarCargos.estado, COBRABLES),
      isNull(adminEscolarCargos.ecfDocumentId),
    ))
    .orderBy(asc(adminEscolarCargos.anio), asc(adminEscolarCargos.mes), asc(adminEscolarCargos.id));

  const pedidosSet = new Set(cargoIds);
  let faltaProducto = false;

  const opciones: OpcionCargo[] = filas.map((f) => {
    // El ITBIS y el tipo salen del producto; el PRECIO sale siempre del cargo
    // (su saldo), nunca de la lista de precios: lo que se cobra es la deuda.
    const tasaItbis = f.productId && f.productTasa && TASAS_VALIDAS.includes(f.productTasa)
      ? f.productTasa
      : 'exento';
    if (!f.productId) faltaProducto = true;

    return {
      cargoId: f.id,
      seleccionado: pedidosSet.has(f.id),
      concepto: f.conceptoNombre ?? 'Cargo escolar',
      esMensualidad: f.conceptoTipo === 'mensualidad',
      mes: f.mes,
      anio: f.anio,
      fechaVencimiento: f.fechaVencimiento,
      saldoCentavos: f.saldoCentavos,
      linea: {
        productoId: f.productId ?? null,
        nombreItem: f.productNombre ?? f.conceptoNombre ?? 'Cargo escolar',
        cantidadItem: 1,
        precioUnitarioItem: f.saldoCentavos / 100,
        tasaItbis,
        indicadorBienoServicio: f.productTipo === 'bien' ? '1' : '2',
        dependienteId: dependiente?.id ?? null,
        dependienteNombre: dependiente?.nombre ?? '',
      },
    };
  });

  // La cuota que todavía no es cargo. El importe y las fechas NO vienen del
  // navegador: se recalculan del plan, que es lo que va a devengar el sistema.
  if (previsto) {
    const [mat] = await db
      .select({
        cursoId: adminEscolarMatriculas.cursoId,
        periodoId: adminEscolarMatriculas.periodoId,
        fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
        becaTipo: adminEscolarMatriculas.becaTipo,
        becaValor: adminEscolarMatriculas.becaValor,
      })
      .from(adminEscolarMatriculas)
      .where(eq(adminEscolarMatriculas.id, matriculaId))
      .limit(1);

    const ctxTarifa = mat
      ? await contextoDeSeccion(teamId, mat.periodoId, mat.cursoId,
          { tipo: mat.becaTipo, valor: mat.becaValor })
      : null;

    if (!ctxTarifa || !mat) {
      return { ok: false, status: 404, error: 'No se pudo calcular la cuota' };
    }

    const desde = String(mat.fechaInscripcion ?? new Date().toISOString().slice(0, 10));
    const plan = await armarPlanDeCobro(teamId, ctxTarifa, desde);
    const linea = plan.find((l) => l.conceptoId === previsto.conceptoId);
    const cuota = linea?.cuotas.find((c) => c.cuotaId === previsto.cuotaId && !c.omitida);
    if (!linea || !cuota) {
      return { ok: false, status: 404, error: 'Esa cuota no está en el plan de esta matrícula' };
    }

    const [concepto] = await db
      .select({
        productId: adminEscolarConceptosPago.productId,
        productNombre: products.nombre,
        productTasa: products.tasaItbis,
        productTipo: products.tipo,
      })
      .from(adminEscolarConceptosPago)
      .leftJoin(products, eq(adminEscolarConceptosPago.productId, products.id))
      .where(and(
        eq(adminEscolarConceptosPago.id, previsto.conceptoId),
        eq(adminEscolarConceptosPago.teamId, teamId),
      ))
      .limit(1);

    const tasaPrevisto = concepto?.productId && concepto.productTasa
      && TASAS_VALIDAS.includes(concepto.productTasa) ? concepto.productTasa : 'exento';
    if (!concepto?.productId) faltaProducto = true;

    opciones.unshift({
      cargoId: 0,
      previstoCuotaId: cuota.cuotaId,
      conceptoId: linea.conceptoId,
      seleccionado: true,
      concepto: linea.nombre,
      esMensualidad: linea.tipo === 'mensualidad',
      mes: cuota.mes,
      anio: Number(cuota.fechaEmision.slice(0, 4)),
      fechaVencimiento: cuota.fechaVencimiento,
      saldoCentavos: cuota.montoCentavos,
      linea: {
        productoId: concepto?.productId ?? null,
        nombreItem: concepto?.productNombre ?? linea.nombre,
        cantidadItem: 1,
        precioUnitarioItem: cuota.montoCentavos / 100,
        tasaItbis: tasaPrevisto,
        indicadorBienoServicio: concepto?.productTipo === 'bien' ? '1' : '2',
        dependienteId: dependiente?.id ?? null,
        dependienteNombre: dependiente?.nombre ?? '',
      },
    });
  }

  // Primero los meses en orden y al final lo que no cae en ningún mes: leer
  // "Diciembre, Evaluaciones, Inscripción, Febrero" no tiene ningún orden.
  opciones.sort((a, b) => {
    if ((a.mes == null) !== (b.mes == null)) return a.mes == null ? 1 : -1;
    if (a.anio !== b.anio) return a.anio - b.anio;
    return (a.mes ?? 0) - (b.mes ?? 0);
  });

  if (faltaProducto) {
    advertencias.push('Algún concepto no tiene producto vinculado: esa línea sale con ITBIS exento.');
  }

  return {
    ok: true,
    datos: {
      estudiante: { id: estudianteId, nombre: `${est.nombres} ${est.apellidos}`.trim() },
      matriculaId,
      contexto,
      comprador,
      compradores,
      opciones,
      advertencias,
    },
  };
}
