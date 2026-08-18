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
  /** De qué hijo es. En una factura de hermanos, es cómo se agrupa. */
  estudianteId: number;
  estudianteNombre: string;
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
  /** El alumno del cargo que se pidió. Los demás hermanos van en `estudiantes`. */
  estudiante: { id: number; nombre: string };
  /**
   * Todos los alumnos que caben en esta factura: el del clic y sus hermanos con
   * el MISMO responsable de pago. Uno solo en el caso corriente.
   */
  estudiantes: {
    id: number;
    nombre: string;
    matriculaId: number;
    contexto: { periodo: string | null; servicio: string | null; grado: string | null; curso: string | null };
  }[];
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
  /**
   * Varios hermanos SÍ, alumnos de familias distintas NO.
   *
   * Una factura es de un comprador. Antes eso se hacía cumplir prohibiendo
   * mezclar alumnos, y de paso prohibía el caso normal: un padre con dos hijos
   * paga las dos mensualidades de una vez, no con dos facturas y dos
   * transferencias.
   *
   * La regla de verdad no es «un alumno», es «un pagador»: se permite mezclar
   * mientras todos apunten al MISMO `facturar_a_client_id`. Con esa condición,
   * cobrarle a alguien el hijo de otro deja de ser posible por construcción.
   */
  const estudianteIds = [...new Set(pedidos.map((c) => c.estudianteId).concat(
    baseEstudianteId != null ? [baseEstudianteId] : [],
  ))];

  const pagadores = await db
    .select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      facturarAClientId: adminEscolarEstudiantes.facturarAClientId,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      inArray(adminEscolarEstudiantes.id, estudianteIds),
    ));

  if (pagadores.length !== estudianteIds.length) {
    return { ok: false, status: 404, error: 'Estudiante no encontrado' };
  }

  if (estudianteIds.length > 1) {
    const sinPagador = pagadores.filter((p) => p.facturarAClientId == null);
    if (sinPagador.length > 0) {
      return {
        ok: false, status: 400,
        error: `Para facturar a varios hermanos juntos, todos necesitan responsable de pago. Le falta a ${sinPagador.map((p) => p.nombres).join(', ')}.`,
      };
    }
    const distintos = new Set(pagadores.map((p) => p.facturarAClientId));
    if (distintos.size > 1) {
      return {
        ok: false, status: 400,
        error: 'Esos alumnos le facturan a responsables distintos: no caben en la misma factura.',
      };
    }
  }

  const estudianteId = baseEstudianteId;
  const matriculaId = baseMatriculaId;

  /**
   * Los hermanos, para OFRECERLOS aunque no se hayan pedido.
   *
   * Se entra por un hijo —desde su ficha— y desde ahí hay que poder añadir la
   * mensualidad del otro sin salir. Sin esto, el padre con dos hijos sigue
   * necesitando dos facturas: el modal solo sabría del alumno del clic.
   *
   * Solo se AÑADEN a la lista de opciones, sin marcar. Lo que se cobra sigue
   * siendo lo que el usuario marque.
   */
  const pagadorComun = pagadores.find((p) => p.id === estudianteId)?.facturarAClientId ?? null;
  if (pagadorComun != null) {
    const hermanos = await db
      .select({ id: adminEscolarEstudiantes.id })
      .from(adminEscolarEstudiantes)
      .where(and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        eq(adminEscolarEstudiantes.facturarAClientId, pagadorComun),
      ));
    for (const h of hermanos) {
      if (!estudianteIds.includes(h.id)) estudianteIds.push(h.id);
    }
  }

  const advertencias: string[] = [];

  // ── Cada alumno con su dependiente (el beneficiario de SUS líneas) ─────────
  //
  // Por alumno y no una vez: en una factura de dos hermanos cada línea tiene
  // que decir de quién es. Sin eso, el padre recibe «Mensualidad de octubre»
  // dos veces seguidas y no sabe cuál es de cuál.
  const alumnos = await db
    .select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      dependienteId: adminEscolarEstudiantes.dependienteId,
      facturarAClientId: adminEscolarEstudiantes.facturarAClientId,
      dependienteNombre: dependientes.nombre,
      dependienteApellido: dependientes.apellido,
      // De qué contacto cuelga el beneficiario. No siempre es el que paga.
      dependienteClientId: dependientes.clientId,
    })
    .from(adminEscolarEstudiantes)
    .leftJoin(dependientes, eq(adminEscolarEstudiantes.dependienteId, dependientes.id))
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      inArray(adminEscolarEstudiantes.id, estudianteIds),
    ));

  const est = alumnos.find((a) => a.id === estudianteId);
  if (!est) return { ok: false, status: 404, error: 'Estudiante no encontrado' };

  /** estudianteId → su beneficiario en Contactos, para las líneas. */
  const dependientePorAlumno = new Map<number, { id: number; nombre: string } | null>(
    alumnos.map((a) => [
      a.id,
      a.dependienteId
        ? { id: a.dependienteId, nombre: `${a.dependienteNombre ?? ''} ${a.dependienteApellido ?? ''}`.trim() }
        : null,
    ]),
  );

  const dependiente = dependientePorAlumno.get(estudianteId) ?? null;

  const sinDependiente = alumnos.filter((a) => !dependientePorAlumno.get(a.id));
  if (sinDependiente.length > 0) {
    advertencias.push(
      sinDependiente.length === alumnos.length && alumnos.length === 1
        ? 'El estudiante no está vinculado a un dependiente de Contactos: las líneas quedarán sin beneficiario.'
        : `Sin dependiente en Contactos: ${sinDependiente.map((a) => a.nombres).join(', ')}. Sus líneas quedarán sin beneficiario.`,
    );
  }

  // ── Dónde está matriculado cada uno, para poder distinguir la línea ───────
  //
  // Se piden las matrículas de TODOS los alumnos, no solo la del cargo en que
  // se hizo clic: es de donde salen los demás cargos cobrables que el modal
  // ofrece marcar. Dos hermanos en el mismo colegio generan líneas idénticas si
  // solo dicen «Pago de colegiatura — Octubre».
  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
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
      eq(adminEscolarMatriculas.teamId, teamId),
      inArray(adminEscolarMatriculas.estudianteId, estudianteIds),
    ));

  const ctxDe = (m: (typeof matriculas)[number] | undefined) => ({
    periodo: m?.periodo ?? null,
    servicio: m?.servicio ?? null,
    grado: m?.grado ?? null,
    curso: m?.curso ?? null,
  });

  const contexto = ctxDe(matriculas.find((m) => m.id === matriculaId));

  /**
   * Los alumnos de esta factura, cada uno con dónde está matriculado.
   *
   * Se manda la matrícula ACTIVA de cada uno —la del período del cargo que se
   * pidió— y no todas: un alumno de tercer año tiene tres matrículas y enseñar
   * las tres en el modal es ruido.
   */
  const matriculaDe = new Map<number, number>();
  for (const m of matriculas) {
    if (m.estudianteId === estudianteId) { matriculaDe.set(m.estudianteId, matriculaId); continue; }
    if (!matriculaDe.has(m.estudianteId)) matriculaDe.set(m.estudianteId, m.id);
  }

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

  /**
   * Beneficiarios que cuelgan de OTRO contacto.
   *
   * El motor de emisión rechaza la factura con «uno o más beneficiarios no
   * pertenecen a este cliente», y lo hace bien: un beneficiario es de un
   * contacto. Lo que estaba mal era enterarse al final, después de elegir los
   * cargos, el comprobante y darle a crear.
   *
   * Pasa justo en el caso nuevo: al marcar dos hermanos con el mismo
   * responsable de pago, sus fichas de beneficiario pueden seguir repartidas
   * entre el contacto del padre y el de la madre.
   */
  const ajenos = comprador
    ? alumnos.filter((a) => a.dependienteId != null && a.dependienteClientId !== comprador.clienteId)
    : [];
  if (ajenos.length > 0) {
    advertencias.push(
      `El beneficiario de ${ajenos.map((a) => a.nombres).join(', ')} cuelga de otro contacto, no de ${comprador!.razonSocial}. `
      + 'Muévelo en Contactos o la factura se rechazará al crearla.',
    );
  }

  // ── Todo lo cobrable de esa matrícula, no solo lo que se pidió ─────────────
  const filas = await db
    .select({
      id: adminEscolarCargos.id,
      estudianteId: adminEscolarCargos.estudianteId,
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
      // De todos los hermanos, no solo del alumno del cargo pedido: es lo que
      // deja marcar la mensualidad de los dos en el mismo modal.
      inArray(adminEscolarCargos.estudianteId, estudianteIds),
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

    const suyo = dependientePorAlumno.get(f.estudianteId) ?? null;
    const alumno = alumnos.find((a) => a.id === f.estudianteId);

    return {
      cargoId: f.id,
      estudianteId: f.estudianteId,
      estudianteNombre: `${alumno?.nombres ?? ''} ${alumno?.apellidos ?? ''}`.trim(),
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
        // El beneficiario es el alumno de ESTE cargo, no el del clic.
        dependienteId: suyo?.id ?? null,
        dependienteNombre: suyo?.nombre ?? '',
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
      estudianteId,
      estudianteNombre: `${est.nombres} ${est.apellidos}`.trim(),
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

  // Primero agrupado por hijo —el del clic arriba, que es lo que se vino a
  // hacer— y dentro de cada uno los meses en orden, con lo que no cae en ningún
  // mes al final: leer "Diciembre, Evaluaciones, Inscripción, Febrero" no tiene
  // ningún orden.
  opciones.sort((a, b) => {
    if (a.estudianteId !== b.estudianteId) {
      if (a.estudianteId === estudianteId) return -1;
      if (b.estudianteId === estudianteId) return 1;
      return a.estudianteNombre.localeCompare(b.estudianteNombre, 'es');
    }
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
      estudiantes: alumnos.map((a) => ({
        id: a.id,
        nombre: `${a.nombres} ${a.apellidos}`.trim(),
        matriculaId: matriculaDe.get(a.id) ?? matriculaId,
        contexto: ctxDe(matriculas.find((m) => m.id === matriculaDe.get(a.id))),
      })),
      matriculaId,
      contexto,
      comprador,
      compradores,
      opciones,
      advertencias,
    },
  };
}
