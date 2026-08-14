/**
 * Todo lo que la ficha del estudiante enseña, en una sola función.
 *
 * Antes el perfil pedía cinco endpoints (estudiante, matrículas, cargos, pagos,
 * tutores) y después uno más por el plan de la matrícula elegida. Seis viajes,
 * seis veces la comprobación de sesión/permisos/módulo, y el del estudiante en
 * serie por delante de los demás. Además `sincronizarSaldosDesdeFacturas`
 * —que ESCRIBE— corría dos veces por carga, una en /estudiantes/[id] y otra en
 * /cargos.
 *
 * Aquí se sincroniza una vez y se lee todo a la vez. Cada consulta suelta sigue
 * existiendo como función exportada, y las rutas viejas la usan, para que la
 * ficha y ellas no se separen el día que cambie una columna.
 */

import { and, desc, eq, gt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarAvisosEnviados,
  adminEscolarCargos,
  adminEscolarConceptoCuotas,
  adminEscolarConceptosPago,
  adminEscolarCursos,
  adminEscolarEstudianteTutores,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarTutores,
  clients,
  dependientes,
  ecfDocuments,
  facturasRecurrentes,
  pagosRecibidos,
  teams,
} from '@/lib/db/schema';
import { canalesDelColegio } from '@/lib/administracion-escolar/canales';
import {
  canalesVivosDe, fechasDeAviso, type FilaAviso,
} from '@/lib/administracion-escolar/avisos';
import { CANALES_DEL_AVISO } from '@/lib/administracion-escolar/ciclo-cobro';
import { deudaEstudiante, sincronizarSaldosDesdeFacturas } from '@/lib/administracion-escolar/queries';
import { cargarPlan, type PlanCargado } from '@/lib/administracion-escolar/plan-matricula';

/** Ficha del alumno + deuda + el contacto de Contactos al que está enlazado. */
export async function estudianteConDependiente(teamId: number, estudianteId: number) {
  const [estudiante] = await db.select().from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.id, estudianteId),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .limit(1);
  if (!estudiante) return null;

  const [deudaCentavos, dependiente, responsable] = await Promise.all([
    deudaEstudiante(teamId, estudiante.id),
    estudiante.dependienteId
      ? db
        .select({
          nombre: dependientes.nombre,
          apellido: dependientes.apellido,
          clienteId: clients.id,
          clienteRazonSocial: clients.razonSocial,
        })
        .from(dependientes)
        .innerJoin(clients, eq(dependientes.clientId, clients.id))
        .where(and(
          eq(dependientes.id, estudiante.dependienteId),
          eq(dependientes.teamId, teamId),
        ))
        .limit(1)
        .then((r) => r[0] ?? null)
      : Promise.resolve(null),

    /**
     * El responsable de pago: el CONTACTO al que se le factura.
     *
     * Antes salía del tutor marcado como responsable, y eso obligaba a que la
     * misma persona existiera dos veces —como tutor y como cliente— con sus
     * datos duplicados. Ahora es un contacto de Facturación y punto: el tutor
     * es quien responde por el alumno, que no siempre es quien paga.
     */
    estudiante.facturarAClientId
      ? db
        .select({
          clientId: clients.id,
          razonSocial: clients.razonSocial,
          rnc: clients.rnc,
          email: clients.email,
          telefono: clients.telefono,
          // El celular es el que recibe el SMS; el fijo no. Hacía falta para
          // poder decir en la ficha por qué canales se le puede escribir.
          celular: clients.celular,
          whatsapp: clients.whatsapp,
        })
        .from(clients)
        .where(and(eq(clients.id, estudiante.facturarAClientId), eq(clients.teamId, teamId)))
        .limit(1)
        .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  return { ...estudiante, deudaCentavos, dependiente, responsable };
}

/** Historial de matrículas (más reciente primero). */
export function matriculasDeEstudiante(teamId: number, estudianteId: number) {
  return db
    .select({
      id: adminEscolarMatriculas.id,
      periodoId: adminEscolarMatriculas.periodoId,
      periodo: adminEscolarPeriodos.nombre,
      periodoFechaInicio: adminEscolarPeriodos.fechaInicio,
      periodoFechaFin: adminEscolarPeriodos.fechaFin,
      // El año escolar en curso. La ficha lo pone primero y lo abre por
      // defecto: es donde está lo que el usuario viene a mirar.
      periodoActivo: adminEscolarPeriodos.activo,
      cursoId: adminEscolarMatriculas.cursoId,
      curso: adminEscolarCursos.nombre,
      codigoMatricula: adminEscolarMatriculas.codigoMatricula,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      estado: adminEscolarMatriculas.estado,
      facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId,
      // Para poder decir en la ficha "esta mensualidad se factura sola el día
      // N", en vez de que el usuario tenga que adivinar si hay algo automático
      // detrás de un mes que todavía no tiene factura.
      recurrenteEstado: facturasRecurrentes.estado,
      recurrenteDiaCobro: facturasRecurrentes.diaCobro,
      recurrenteProxima: facturasRecurrentes.proximaEmision,
      notas: adminEscolarMatriculas.notas,
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
    .leftJoin(facturasRecurrentes, and(
      eq(adminEscolarMatriculas.facturaRecurrenteId, facturasRecurrentes.id),
      eq(facturasRecurrentes.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estudianteId, estudianteId),
    ))
    .orderBy(desc(adminEscolarMatriculas.fechaInscripcion), desc(adminEscolarMatriculas.id));
}

/**
 * Cargos del estudiante (más reciente primero).
 *
 * No sincroniza saldos: eso lo hace quien llama, una sola vez por carga.
 */
export function cargosDeEstudiante(teamId: number, estudianteId: number) {
  return db
    .select({
      id: adminEscolarCargos.id,
      conceptoId: adminEscolarCargos.conceptoId,
      concepto: adminEscolarConceptosPago.nombre,
      conceptoTipo: adminEscolarConceptosPago.tipo,
      // De qué cuota del calendario salió. Es la llave con la que la ficha sabe
      // que una cuota del plan ya se devengó y no debe anunciarla como prevista.
      cuotaId: adminEscolarCargos.cuotaId,
      matriculaId: adminEscolarCargos.matriculaId,
      periodoId: adminEscolarCargos.periodoId,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
      facturaClientId: ecfDocuments.clientId,
      facturaEncf: ecfDocuments.encf,
      facturaCodigo: ecfDocuments.codigo,
      facturaEstadoPago: ecfDocuments.estadoPago,
      // Estado ANTE LA DGII, que no es el de cobro: con él la ficha sabe si a
      // esta factura todavía le falta emitirse y puede ofrecerlo en el menú.
      facturaEstado: ecfDocuments.estado,
    })
    .from(adminEscolarCargos)
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .leftJoin(ecfDocuments, eq(adminEscolarCargos.ecfDocumentId, ecfDocuments.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, estudianteId),
    ))
    .orderBy(desc(adminEscolarCargos.anio), desc(adminEscolarCargos.mes), desc(adminEscolarCargos.id));
}

/**
 * Cobros del estudiante (más reciente primero). Fuente de verdad: el ledger
 * `pagos_recibidos` de las facturas vinculadas a sus cargos.
 */
export function pagosDeEstudiante(teamId: number, estudianteId: number) {
  return db
    .select({
      id: pagosRecibidos.id,
      cargoId: adminEscolarCargos.id,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: pagosRecibidos.montoCentavos,
      fechaPago: pagosRecibidos.fechaPago,
      metodo: pagosRecibidos.metodo,
      referencia: pagosRecibidos.referencia,
      notas: pagosRecibidos.notas,
      createdAt: pagosRecibidos.createdAt,
    })
    .from(adminEscolarCargos)
    .innerJoin(ecfDocuments, eq(adminEscolarCargos.ecfDocumentId, ecfDocuments.id))
    .innerJoin(pagosRecibidos, and(
      eq(pagosRecibidos.ecfDocumentId, ecfDocuments.id),
      eq(pagosRecibidos.teamId, teamId),
    ))
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, estudianteId),
    ))
    .orderBy(desc(pagosRecibidos.fechaPago), desc(pagosRecibidos.id));
}

/** Tutores asociados al estudiante. */
export function tutoresDeEstudiante(teamId: number, estudianteId: number) {
  return db
    .select({
      id: adminEscolarEstudianteTutores.id,
      tutorId: adminEscolarTutores.id,
      nombre: adminEscolarTutores.nombre,
      documento: adminEscolarTutores.documento,
      telefono: adminEscolarTutores.telefono,
      email: adminEscolarTutores.email,
      imagen: adminEscolarTutores.imagen,
      clientId: adminEscolarTutores.clientId,
      clienteRazonSocial: clients.razonSocial,
      relacion: adminEscolarEstudianteTutores.relacion,
      responsablePago: adminEscolarEstudianteTutores.responsablePago,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, teamId),
    ))
    .leftJoin(clients, eq(adminEscolarTutores.clientId, clients.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
    ))
    .orderBy(adminEscolarEstudianteTutores.responsablePago);
}

/**
 * Facturas emitidas a este alumno que NO cuelgan de ningún cargo escolar.
 *
 * En Facturación la factura lleva al alumno como beneficiario, así que el
 * colegio que ya cobraba antes de tener el módulo tiene años de facturas suyas
 * —562 en esta base, sobre 427 alumnos— que la ficha no enseñaba: solo salían
 * las que algún cargo apuntaba. El padre venía con una factura en la mano que
 * aquí no existía.
 *
 * Se enseñan aparte y no mezcladas con los cargos a propósito: no son deuda
 * del plan de cobro, no tienen período ni concepto escolar, y sumarlas a los
 * totales del período cuadraría mal.
 */
export interface LineaFactura {
  nombre: string;
  cantidad: number;
  importeCentavos: number;
}

/**
 * Las líneas de la factura que son de ESTE alumno.
 *
 * Cada línea guarda su `dependienteId`, porque el padre con tres hijos recibe
 * UNA factura con la colegiatura de los tres. Enseñarlas todas en la ficha de
 * uno le atribuiría lo de sus hermanos. Si ninguna línea trae dependiente
 * —facturas viejas— se devuelven todas: es lo único que se sabe.
 */
function lineasDelAlumno(crudo: string | null, dependienteId: number): LineaFactura[] {
  if (!crudo) return [];
  let lineas: Record<string, unknown>[];
  try {
    lineas = JSON.parse(crudo);
  } catch {
    return [];   // una factura con el JSON roto no puede tumbar la ficha
  }
  if (!Array.isArray(lineas)) return [];

  const suyas = lineas.filter((l) => Number(l.dependienteId) === dependienteId);
  const cuales = suyas.length > 0 ? suyas : lineas.filter((l) => l.dependienteId == null);

  return cuales.map((l) => {
    const cantidad = Number(l.cantidadItem ?? 1) || 1;
    const precio = Number(l.precioUnitarioItem ?? 0) || 0;
    const descuento = Number(l.descuentoPct ?? 0) || 0;
    return {
      nombre: String(l.nombreItem ?? l.descripcionItem ?? 'Sin concepto'),
      cantidad,
      // El precio va en pesos en el JSON del formulario; la ficha trabaja en
      // centavos como todo lo demás.
      importeCentavos: Math.round(cantidad * precio * (1 - descuento / 100) * 100),
    };
  });
}

export async function facturasSueltasDeEstudiante(teamId: number, dependienteId: number | null) {
  if (!dependienteId) return [];
  const filas = await db
    .select({
      id: ecfDocuments.id,
      codigo: ecfDocuments.codigo,
      encf: ecfDocuments.encf,
      fecha: ecfDocuments.fechaEmision,
      montoTotal: ecfDocuments.montoTotal,
      estado: ecfDocuments.estado,
      estadoPago: ecfDocuments.estadoPago,
      lineasJson: ecfDocuments.lineasJson,
      // Lo abonado sale de los pagos, no del `estado_pago`: ese solo dice
      // PAGADO/PENDIENTE y con un abono parcial diría «pendiente» sobre el
      // total, escondiendo lo que la familia ya entregó.
      // `ecf_documents.id` escrito con su tabla delante y NO como
      // `${'$'}{ecfDocuments.id}`: dentro de una plantilla `sql` cruda drizzle lo
      // emite como «id» pelado, y ahí dentro `pagos_recibidos` también tiene
      // `id` — la comparación era contra el id del PAGO y no encontraba nunca
      // nada. La factura salía «sin abonar» con RD$5,000 ya cobrados.
      pagadoCentavos: sql<number>`COALESCE((
        SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
         WHERE p.ecf_document_id = ecf_documents.id AND p.team_id = ${teamId}
      ), 0)::int`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      eq(ecfDocuments.dependienteId, dependienteId),
      // Las que ya tienen cargo salen en su mes, con su concepto: repetirlas
      // aquí haría creer que se le cobró dos veces.
      sql`NOT EXISTS (SELECT 1 FROM admin_escolar_cargos c WHERE c.ecf_document_id = ecf_documents.id)`,
    ))
    .orderBy(desc(ecfDocuments.fechaEmision), desc(ecfDocuments.id))
    .limit(100);

  return filas.map(({ lineasJson, ...f }) => ({
    ...f,
    lineas: lineasDelAlumno(lineasJson, dependienteId),
  }));
}

/**
 * Los pagos de esas facturas.
 *
 * `pagosDeEstudiante` los busca a través del cargo, así que una factura sin
 * cargo tenía sus pagos invisibles: el padre pagaba y en la ficha del hijo no
 * aparecía nada.
 */
export async function pagosSueltosDeEstudiante(teamId: number, dependienteId: number | null) {
  if (!dependienteId) return [];
  return db
    .select({
      id: pagosRecibidos.id,
      ecfDocumentId: ecfDocuments.id,
      encf: ecfDocuments.encf,
      codigo: ecfDocuments.codigo,
      montoCentavos: pagosRecibidos.montoCentavos,
      fechaPago: pagosRecibidos.fechaPago,
      metodo: pagosRecibidos.metodo,
      referencia: pagosRecibidos.referencia,
    })
    .from(pagosRecibidos)
    .innerJoin(ecfDocuments, eq(pagosRecibidos.ecfDocumentId, ecfDocuments.id))
    .where(and(
      eq(pagosRecibidos.teamId, teamId),
      eq(ecfDocuments.dependienteId, dependienteId),
      sql`NOT EXISTS (SELECT 1 FROM admin_escolar_cargos c WHERE c.ecf_document_id = ecf_documents.id)`,
    ))
    .orderBy(desc(pagosRecibidos.fechaPago), desc(pagosRecibidos.id))
    .limit(200);
}

/**
 * Los recordatorios que se le han mandado a la familia de este alumno.
 *
 * Es la constancia del colegio cuando el padre dice que no le avisaron: el día,
 * la hora, por qué canal y a qué número o correo salió — el destino tal como
 * estaba ese día, no el de hoy, que puede ser otro.
 *
 * Casi todos cuelgan de un CARGO, y por eso dicen de qué cobro hablaban. Pero
 * no todos: al enlace para subir documentos y a los formularios que se le
 * mandan a la familia no hay cuota que atarlos, y cuelgan de la matrícula. Los
 * dos van juntos aquí a propósito — cuando la familia dice «a mí no me
 * mandaron nada», la secretaria abre UNA pantalla, no dos.
 */
export function avisosDeEstudiante(teamId: number, estudianteId: number) {
  return db
    .select({
      id: adminEscolarAvisosEnviados.id,
      enviadoAt: adminEscolarAvisosEnviados.enviadoAt,
      tipo: adminEscolarAvisosEnviados.tipo,
      canal: adminEscolarAvisosEnviados.canal,
      destino: adminEscolarAvisosEnviados.destino,
      detalle: adminEscolarAvisosEnviados.detalle,
      cargoId: adminEscolarCargos.id,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarCargos.montoCentavos,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
    })
    .from(adminEscolarAvisosEnviados)
    // LEFT y no INNER: con INNER, un aviso sin cargo —los del expediente— se
    // caía de la lista sin que nadie lo notara.
    .leftJoin(adminEscolarCargos, eq(adminEscolarAvisosEnviados.cargoId, adminEscolarCargos.id))
    .leftJoin(adminEscolarMatriculas, eq(adminEscolarAvisosEnviados.matriculaId, adminEscolarMatriculas.id))
    .leftJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.teamId, teamId),
    ))
    .where(and(
      eq(adminEscolarAvisosEnviados.teamId, teamId),
      or(
        eq(adminEscolarCargos.estudianteId, estudianteId),
        eq(adminEscolarMatriculas.estudianteId, estudianteId),
      ),
    ))
    .orderBy(desc(adminEscolarAvisosEnviados.enviadoAt))
    .limit(200);
}

/**
 * Los avisos que TODAVÍA no han salido: qué le toca a este alumno y cuándo.
 *
 * Sale de los mismos cargos y las mismas reglas que usa el cron —`fechasDeAviso`
 * es la misma función— para que la ficha no prometa un recordatorio que el
 * motor nunca va a mandar. Solo cargos con deuda viva: lo pagado no se recuerda.
 */
export async function avisosProgramadosDeEstudiante(teamId: number, estudianteId: number) {
  const [filas, canales] = await Promise.all([
    db
      .select({
        cargoId: adminEscolarCargos.id,
        concepto: adminEscolarConceptosPago.nombre,
        saldoCentavos: adminEscolarCargos.saldoCentavos,
        fechaEmision: adminEscolarConceptoCuotas.fechaEmision,
        fechaVencimiento: adminEscolarCargos.fechaVencimiento,
        avisosActivos: adminEscolarConceptosPago.avisosActivos,
        avisoDiaEmision: adminEscolarConceptosPago.avisoDiaEmision,
        avisoDiaVencimiento: adminEscolarConceptosPago.avisoDiaVencimiento,
        avisoAntesMoraDias: adminEscolarConceptosPago.avisoAntesMoraDias,
        moraDiasGracia: adminEscolarConceptosPago.moraDiasGracia,
        avisoCorreo: adminEscolarConceptosPago.avisoCorreo,
        avisoWhatsapp: adminEscolarConceptosPago.avisoWhatsapp,
        avisoSms: adminEscolarConceptosPago.avisoSms,
      })
      .from(adminEscolarCargos)
      .innerJoin(adminEscolarConceptosPago, and(
        eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
        eq(adminEscolarConceptosPago.teamId, teamId),
      ))
      .leftJoin(adminEscolarConceptoCuotas, eq(adminEscolarCargos.cuotaId, adminEscolarConceptoCuotas.id))
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.estudianteId, estudianteId),
        gt(adminEscolarCargos.saldoCentavos, 0),
        ne(adminEscolarCargos.estado, 'anulado'),
      )),
    canalesDelColegio(teamId),
  ]);

  const salida: {
    cargoId: number; concepto: string | null; fecha: string;
    tipo: string; canales: string[]; montoCentavos: number;
  }[] = [];

  for (const f of filas) {
    if (!f.avisosActivos) continue;
    const comoFila = {
      ...f,
      fechaEmision: f.fechaEmision ? String(f.fechaEmision) : null,
      fechaVencimiento: f.fechaVencimiento ? String(f.fechaVencimiento) : null,
    } as unknown as FilaAviso;

    const vivos = canalesVivosDe(comoFila, canales);
    if (vivos.length === 0) continue;

    for (const s of fechasDeAviso(comoFila)) {
      const porDonde = CANALES_DEL_AVISO[s.aviso].filter((c) => vivos.includes(c));
      if (porDonde.length === 0) continue;
      salida.push({
        cargoId: f.cargoId,
        concepto: f.concepto,
        fecha: s.fecha,
        tipo: s.aviso,
        canales: [...porDonde],
        montoCentavos: f.saldoCentavos,
      });
    }
  }

  return salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

export type Ficha = NonNullable<Awaited<ReturnType<typeof fichaEstudiante>>>;

/**
 * La ficha completa. Devuelve `null` si el alumno no es de este team.
 *
 * Los planes vienen indexados por matrícula porque el filtro de período de la
 * pantalla los cambia sin recargar: traerlos todos aquí (son una o dos por
 * alumno) evita una petición cada vez que el usuario cambia de período.
 */
export async function fichaEstudiante(teamId: number, estudianteId: number) {
  // Antes de leer nada: reflejar en los cargos lo cobrado en sus facturas. Una
  // sola vez, aunque de ella dependan la deuda, los cargos y los pagos.
  await sincronizarSaldosDesdeFacturas(teamId, estudianteId);

  const [estudiante, matriculas, cargos, pagos, tutores, cobro] = await Promise.all([
    estudianteConDependiente(teamId, estudianteId),
    matriculasDeEstudiante(teamId, estudianteId),
    cargosDeEstudiante(teamId, estudianteId),
    pagosDeEstudiante(teamId, estudianteId),
    tutoresDeEstudiante(teamId, estudianteId),
    /**
     * Cuánto es el recargo y por qué canales se avisa, para poder explicar en
     * la ficha qué le va a pasar a cada cuota.
     *
     * El recargo es del NEGOCIO (una sola política para toda la empresa) y los
     * canales son del colegio; el concepto solo decide si esta cuota los usa.
     * Sin las dos mitades la pantalla diría «le entra recargo» sin poder decir
     * de cuánto, que es lo único que la familia pregunta.
     */
    reglasDelColegio(teamId),
  ]);

  if (!estudiante) return null;

  const planes: Record<number, { lineas: PlanCargado['lineas']; devenga: boolean }> = {};
  await Promise.all(matriculas.map(async (m) => {
    const p = await cargarPlan(teamId, m.id);
    if (p) planes[m.id] = { lineas: p.lineas, devenga: p.devenga };
  }));

  // Las facturas viejas del alumno, las que no salieron de ningún cargo. Va
  // después porque hace falta el `dependienteId` del estudiante ya leído.
  const [facturasSueltas, pagosSueltos, avisos, avisosProgramados] = await Promise.all([
    facturasSueltasDeEstudiante(teamId, estudiante.dependienteId),
    pagosSueltosDeEstudiante(teamId, estudiante.dependienteId),
    avisosDeEstudiante(teamId, estudianteId),
    avisosProgramadosDeEstudiante(teamId, estudianteId),
  ]);

  /**
   * La deuda de esas facturas, que hasta ahora no la contaba nadie.
   *
   * `deudaCentavos` sale de los CARGOS, y estas facturas no tienen cargo: el
   * alumno traído de Contactos con una factura sin pagar salía «Al día» con
   * RD$5,500 sin cobrar delante. No hay doble conteo posible — las facturas
   * que sí cuelgan de un cargo están excluidas de esta lista.
   */
  const deudaFacturasCentavos = facturasSueltas.reduce(
    (s, f) => s + Math.max(0, f.montoTotal - f.pagadoCentavos), 0,
  );

  return {
    estudiante, matriculas, cargos, pagos, tutores, planes, cobro,
    facturasSueltas, pagosSueltos, deudaFacturasCentavos, avisos, avisosProgramados,
  };
}

/** El recargo por mora del negocio y los canales de aviso del colegio. */
async function reglasDelColegio(teamId: number) {
  const [fila, canales] = await Promise.all([
    db
      .select({
        recargoActivo: teams.recargoMoraActivo,
        recargoModo: teams.recargoMoraModo,
        recargoPorcentajeBps: teams.recargoMoraPorcentaje,
        recargoMontoCentavos: teams.recargoMoraMontoCents,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1)
      .then((r) => r[0] ?? null),
    canalesDelColegio(teamId),
  ]);

  return {
    recargoActivo: fila?.recargoActivo ?? false,
    recargoModo: fila?.recargoModo ?? 'porcentaje',
    recargoPorcentajeBps: fila?.recargoPorcentajeBps ?? 0,
    recargoMontoCentavos: fila?.recargoMontoCentavos ?? 0,
    canales,
  };
}
