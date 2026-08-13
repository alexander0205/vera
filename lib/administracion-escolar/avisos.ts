import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarAvisosEnviados, adminEscolarCargos, adminEscolarConceptoCuotas,
  adminEscolarConceptosPago, adminEscolarEstudiantes, clients,
} from '@/lib/db/schema';
import { aGsm7 } from '@/lib/sms/mensaje';
import { sumarDias } from './calendario';
import { CANALES_TODOS_ACTIVOS, type CanalesActivos } from './canales';
import { CANALES_DEL_AVISO, type Aviso, type Canal } from './ciclo-cobro';

/**
 * A quién hay que escribirle hoy, y por dónde.
 *
 * El colegio configura los avisos en el concepto; esto los aterriza sobre los
 * cargos reales y decide qué sale HOY. Corre a diario: un aviso que se pierde
 * porque el cron falló un día no se recupera al siguiente —su fecha ya pasó—,
 * así que la idempotencia importa más que el reintento.
 *
 * Esa idempotencia es de base de datos, no de código: el índice único
 * `(cargo, tipo, offset, canal)` de `admin_escolar_avisos_enviados` es lo que
 * impide que al padre le llegue el mismo recordatorio dos veces. Se anota
 * ANTES de mandar, y si el envío falla se borra la anotación — al revés, un
 * fallo a mitad de tanda dejaría mensajes enviados sin registrar y el padre
 * recibiría todo otra vez mañana.
 */

/** Una fila candidata: el cargo con lo que su concepto dice sobre avisos. */
export interface FilaAviso {
  cargoId: number;
  teamId: number;
  /** Para llevar al alumno desde el panel, cuando algo hay que arreglarle. */
  estudianteId: number;
  /** El contacto que paga. Nulo = el alumno no tiene responsable asignado. */
  clientId: number | null;
  estudiante: string;
  concepto: string;
  saldoCentavos: number;
  /** Del calendario. Nulo en cargos hechos a mano, que no tienen cuota. */
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  cobraMora: boolean;
  avisoDiaEmision: boolean;
  avisoDiaVencimiento: boolean;
  avisoAntesMoraDias: number | null;
  /** Días entre vencer y que entre el recargo. 0 = el mismo día. */
  moraDiasGracia: number;
  avisoCorreo: boolean;
  avisoWhatsapp: boolean;
  avisoSms: boolean;
  /**
   * A quién se le escribe: el RESPONSABLE DE PAGO del alumno.
   *
   * Antes era «el tutor marcado como responsable de pago», una casilla en la
   * tabla de tutores. Esa casilla ya no existe —el responsable pasó a ser un
   * contacto de Facturación (`facturar_a_client_id`)— y con ella dejó de
   * haber destinatario: la consulta seguía corriendo, no daba error, y no
   * encontraba a nadie. Cero avisos y ni una queja en el log.
   *
   * Se le escribe solo a él y no también a los tutores: es quien paga, y en
   * la mayoría de los casos es la misma persona escrita dos veces — al padre
   * le llegaría todo duplicado.
   */
  destinatario: string | null;
  /** Los cuatro son distintos y no siempre coinciden. Uno por canal. */
  email: string | null;
  whatsapp: string | null;
  celular: string | null;
  telefono: string | null;
}

/**
 * El número o correo de cada canal, con las alternativas que valen.
 *
 * El fijo de la casa no recibe ni WhatsApp ni SMS, así que va de último: si el
 * contacto tiene celular, se usa ese. Mandar un SMS a un fijo es un mensaje
 * cobrado que no llega a nadie.
 */
export function destinoDelCanal(fila: FilaAviso, canal: Canal): string | null {
  if (canal === 'correo') return fila.email?.trim() || null;
  if (canal === 'whatsapp') return fila.whatsapp?.trim() || fila.celular?.trim() || null;
  return fila.celular?.trim() || fila.whatsapp?.trim() || null;
}

/** Lo que se le dice al usuario cuando falta el dato de contacto. */
const FALTA: Record<Canal, string> = {
  correo: 'El responsable de pago no tiene correo',
  whatsapp: 'El responsable de pago no tiene WhatsApp ni celular',
  sms: 'El responsable de pago no tiene celular',
};

export interface AvisoPendiente {
  fila: FilaAviso;
  aviso: Aviso;
  /** Días de antelación configurados. Va al índice único. */
  offsetDias: number;
  canales: Canal[];
}

/**
 * Qué avisos de esta fila caen hoy.
 *
 * Puro y sin base de datos para poder probarlo: el error caro aquí no es
 * mandar de menos sino mandar de más, y eso solo se ve con fechas concretas.
 *
 * Los tres cuelgan de fechas que ya existen cuando el cargo existe: el día de
 * la emisión, unos días antes del vencimiento, y el propio vencimiento. Antes
 * había un cuarto, «antes de emitir», que avisaba de una factura futura y por
 * eso podía caer en un día en que el cargo todavía no estaba creado — no salía
 * nunca y parecía un fallo del cron. Ya no existe.
 */
/**
 * En qué FECHA cae cada aviso de esta fila, salga hoy o dentro de tres meses.
 *
 * Está separado de `avisosDeHoy` porque la misma pregunta se hace en dos
 * sitios: el cron quiere «qué sale hoy» y la ficha del alumno quiere «qué se le
 * va a mandar este mes». Con la cuenta escrita dos veces, un cambio en los días
 * de gracia habría movido una y no la otra, y la ficha prometería un aviso que
 * el cron nunca manda.
 */
export function fechasDeAviso(fila: FilaAviso): { aviso: Aviso; fecha: string; offsetDias: number }[] {
  const salen: { aviso: Aviso; fecha: string; offsetDias: number }[] = [];

  if (fila.fechaEmision && fila.avisoDiaEmision) {
    salen.push({ aviso: 'al-emitir', fecha: fila.fechaEmision, offsetDias: 0 });
  }
  if (fila.fechaVencimiento) {
    if (fila.avisoDiaVencimiento) {
      salen.push({ aviso: 'al-vencer', fecha: fila.fechaVencimiento, offsetDias: 0 });
    }
    // El aviso del recargo cuelga de la fecha del RECARGO: vencimiento más los
    // días de gracia.
    //
    // Sin gracia no sale, aunque el concepto tenga días guardados. Con gracia 0
    // el recargo entra el mismo día del vencimiento, así que este aviso caería
    // ANTES de vencer y diría "paga para evitar el recargo" cuando lo que toca
    // decir es "todavía tienes plazo" — y encima la pantalla lo enseña como no
    // disponible, así que estaría mandando algo que el colegio ve apagado. Un
    // valor viejo se queda dormido hasta que se le den días de margen.
    const gracia = Math.max(0, fila.moraDiasGracia);
    const n = fila.avisoAntesMoraDias;
    if (gracia > 0 && n != null && n > 0) {
      const fechaMora = sumarDias(fila.fechaVencimiento, gracia);
      salen.push({ aviso: 'antes-mora', fecha: sumarDias(fechaMora, -n), offsetDias: n });
    }
  }
  return salen;
}

/** Los canales que de verdad salen: los del concepto ∩ los del colegio. */
export function canalesVivosDe(
  fila: FilaAviso,
  canalesDelColegio: CanalesActivos = CANALES_TODOS_ACTIVOS,
): Canal[] {
  const vivos: Canal[] = [];
  if (fila.avisoCorreo && canalesDelColegio.correo) vivos.push('correo');
  if (fila.avisoWhatsapp && canalesDelColegio.whatsapp) vivos.push('whatsapp');
  if (fila.avisoSms && canalesDelColegio.sms) vivos.push('sms');
  return vivos;
}

export function avisosDeHoy(
  fila: FilaAviso,
  hoy: string,
  // El interruptor maestro del colegio (Configuración → Avisos). Va aparte de
  // lo que dice el concepto porque son dos preguntas distintas: el concepto
  // dice si ESTE cobro avisa por correo, y esto si el colegio manda correos.
  // Por defecto los tres encendidos, que es lo que significa no tener fila.
  canalesDelColegio: CanalesActivos = CANALES_TODOS_ACTIVOS,
): AvisoPendiente[] {
  const canalesVivos = canalesVivosDe(fila, canalesDelColegio);
  if (canalesVivos.length === 0) return [];

  return fechasDeAviso(fila)
    .filter((s) => s.fecha === hoy)
    .map((s) => ({
      fila,
      aviso: s.aviso,
      offsetDias: s.offsetDias,
      // El ruteo es fijo; lo que el colegio enciende es el canal. La
      // intersección es lo que de verdad sale.
      canales: CANALES_DEL_AVISO[s.aviso].filter((c) => canalesVivos.includes(c)),
    }))
    .filter((p) => p.canales.length > 0);
}

/**
 * Cargos con deuda viva cuyo concepto tiene los avisos encendidos.
 *
 * Se traen todos los del colegio y se filtra por fecha en memoria en vez de
 * calcular las tres fechas en SQL: son cientos de filas por colegio, no
 * millones, y la aritmética de fechas repartida entre Postgres y JS es donde
 * se cuelan los errores de un día.
 */
export async function candidatos(teamId: number): Promise<FilaAviso[]> {
  const filas = await db
    .select({
      cargoId: adminEscolarCargos.id,
      teamId: adminEscolarCargos.teamId,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      concepto: adminEscolarConceptosPago.nombre,
      saldoCentavos: adminEscolarCargos.saldoCentavos,
      fechaEmision: adminEscolarConceptoCuotas.fechaEmision,
      fechaVencimiento: adminEscolarCargos.fechaVencimiento,
      cobraMora: adminEscolarConceptosPago.cobraMora,
      avisoDiaEmision: adminEscolarConceptosPago.avisoDiaEmision,
      avisoAntesMoraDias: adminEscolarConceptosPago.avisoAntesMoraDias,
      moraDiasGracia: adminEscolarConceptosPago.moraDiasGracia,
      avisoDiaVencimiento: adminEscolarConceptosPago.avisoDiaVencimiento,
      avisoCorreo: adminEscolarConceptosPago.avisoCorreo,
      avisoWhatsapp: adminEscolarConceptosPago.avisoWhatsapp,
      avisoSms: adminEscolarConceptosPago.avisoSms,
      estudianteId: adminEscolarCargos.estudianteId,
      clientId: clients.id,
      destinatario: clients.razonSocial,
      email: clients.email,
      whatsapp: clients.whatsapp,
      celular: clients.celular,
      telefono: clients.telefono,
    })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, and(
      eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id),
      eq(adminEscolarConceptosPago.avisosActivos, true),
    ))
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id))
    .leftJoin(adminEscolarConceptoCuotas, eq(adminEscolarCargos.cuotaId, adminEscolarConceptoCuotas.id))
    // El responsable de pago del alumno, que es un contacto de Facturación.
    // Un alumno puede tener cuatro tutores y no se le escribe a los cuatro por
    // una cuota: se le escribe a quien paga.
    .leftJoin(clients, and(
      eq(clients.id, adminEscolarEstudiantes.facturarAClientId),
      eq(clients.teamId, adminEscolarCargos.teamId),
    ))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      // Lo pagado y lo anulado no se recuerda.
      gt(adminEscolarCargos.saldoCentavos, 0),
      ne(adminEscolarCargos.estado, 'anulado'),
      ne(adminEscolarCargos.estado, 'pagado'),
    ));

  return filas.map((f) => ({
    ...f,
    estudiante: `${f.nombres} ${f.apellidos ?? ''}`.trim(),
    fechaEmision: f.fechaEmision ? String(f.fechaEmision) : null,
    fechaVencimiento: f.fechaVencimiento ? String(f.fechaVencimiento) : null,
  }));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function enLetra(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

const pesos = (c: number) => `RD$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/**
 * El texto de cada aviso.
 *
 * `corto` es para SMS: 160 caracteres cuentan, y llega desde un número que el
 * tutor no tiene agendado, así que tiene que decir de qué colegio es o no se
 * entiende quién escribe. `largo` va por correo y WhatsApp, que no cobran por
 * carácter.
 */
export function redactar(p: AvisoPendiente, colegio: string): { largo: string; corto: string } {
  const { fila } = p;
  const alumno = fila.estudiante;
  const monto = pesos(fila.saldoCentavos);

  if (p.aviso === 'al-emitir') {
    const vence = fila.fechaVencimiento ? ` Tienes hasta el ${enLetra(fila.fechaVencimiento)} para pagarla.` : '';
    return {
      largo: `Ya está lista la factura de ${fila.concepto} de ${alumno}: ${monto}.${vence}`,
      corto: `${colegio}: factura de ${alumno} lista, ${monto}.${vence}`,
    };
  }
  const cuando = fila.fechaVencimiento ? enLetra(fila.fechaVencimiento) : 'pronto';

  // al-vencer: se escribe en pasado. Decir "está por vencer" el día en que ya
  // venció hace creer al padre que todavía llega a tiempo.
  if (p.aviso === 'al-vencer') {
    const cola = fila.cobraMora
      ? (fila.moraDiasGracia > 0
          ? ` Tienes ${fila.moraDiasGracia} día(s) antes de que se le aplique el recargo.`
          : ' Ya se le aplicó el recargo por mora.')
      : ' Págala para ponerte al día.';
    return {
      largo: `Hoy venció la factura de ${fila.concepto} de ${alumno}: ${monto}.${cola}`,
      corto: `${colegio}: hoy venció la factura de ${alumno}, ${monto}.${cola}`,
    };
  }

  // antes-mora: el que le ahorra dinero al padre, y por eso sale por SMS. La
  // fecha que se le da es la del RECARGO, no la del vencimiento: decirle que
  // pague "antes del 3" cuando el recargo entra el 8 le quita días que tiene.
  const fechaMora = fila.fechaVencimiento
    ? enLetra(sumarDias(fila.fechaVencimiento, Math.max(0, fila.moraDiasGracia)))
    : cuando;
  return {
    largo: `La factura de ${fila.concepto} de ${alumno} está vencida. Paga ${monto} antes del ${fechaMora} y evita el recargo por mora.`,
    corto: `${colegio}: paga ${monto} de ${alumno} antes del ${fechaMora} y evita el recargo.`,
  };
}

export interface EnvioHecho {
  cargoId: number; aviso: Aviso; canal: Canal; destino: string | null;
  ok: boolean; error?: string;
}

/**
 * Reserva el envío en la tabla de idempotencia.
 *
 * Devuelve `false` si ya estaba: el índice único rebota el insert y eso es la
 * señal de que este aviso ya salió. Preguntar antes con un SELECT dejaría una
 * carrera abierta entre dos corridas del cron.
 */
async function reservar(
  teamId: number, cargoId: number, aviso: Aviso, offsetDias: number,
  canal: Canal, destino: string | null,
): Promise<boolean> {
  const filas = await db.insert(adminEscolarAvisosEnviados)
    .values({ teamId, cargoId, tipo: aviso, offsetDias, canal, destino })
    .onConflictDoNothing()
    .returning({ id: adminEscolarAvisosEnviados.id });
  return filas.length > 0;
}

async function liberar(cargoId: number, aviso: Aviso, offsetDias: number, canal: Canal) {
  await db.delete(adminEscolarAvisosEnviados).where(and(
    eq(adminEscolarAvisosEnviados.cargoId, cargoId),
    eq(adminEscolarAvisosEnviados.tipo, aviso),
    eq(adminEscolarAvisosEnviados.offsetDias, offsetDias),
    eq(adminEscolarAvisosEnviados.canal, canal),
  ));
}

export interface OpcionesDespacho {
  /** Sin esto no se manda nada: se calcula y se devuelve el plan. */
  dryRun: boolean;
  colegio: string;
  /**
   * Cuántos mensajes como mucho salen en esta corrida.
   *
   * Un colegio de 465 alumnos con tres canales encendidos son más de mil
   * mensajes de golpe a las 8 de la mañana: WhatsApp lo lee como ráfaga y
   * empieza a rebotar, y el proveedor de SMS también tiene su cadencia. Lo que
   * no entra en esta tanda NO se pierde — sigue pendiente y sale en la
   * siguiente corrida del día, porque el plan es el mismo mientras sea el
   * mismo día y la tabla de idempotencia ya sabe lo que salió.
   */
  limite?: number;
  /** Espera entre mensaje y mensaje. Es lo que reparte la tanda en el tiempo. */
  pausaMs?: number;
  enviar: {
    correo: (destino: string, texto: string, p: AvisoPendiente) => Promise<void>;
    whatsapp: (destino: string, texto: string) => Promise<void>;
    sms: (destino: string, texto: string) => Promise<void>;
  };
}

/**
 * Manda lo que toca y anota lo que salió.
 *
 * Los envíos van de uno en uno a propósito. En paralelo, un colegio de 465
 * alumnos dispara cientos de llamadas simultáneas a Resend y a SNS, y el
 * primer 429 se lleva por delante una tanda entera sin dejar rastro de cuál
 * llegó.
 */
export async function despachar(
  pendientes: AvisoPendiente[],
  opts: OpcionesDespacho,
): Promise<EnvioHecho[]> {
  const hechos: EnvioHecho[] = [];
  const limite = opts.limite ?? Infinity;
  const pausaMs = opts.pausaMs ?? 0;
  let salidos = 0;

  // En simulacro hay que consultar lo ya enviado a mano. El envío real no lo
  // necesita —el índice único lo resuelve al insertar— pero un simulacro que
  // no lo mire enseña como pendiente lo que ya salió, y entonces no sirve para
  // lo único que se usa: saber qué va a pasar hoy.
  const yaSalio = new Set<string>();
  if (opts.dryRun && pendientes.length > 0) {
    const previos = await db
      .select({
        cargoId: adminEscolarAvisosEnviados.cargoId,
        tipo: adminEscolarAvisosEnviados.tipo,
        offsetDias: adminEscolarAvisosEnviados.offsetDias,
        canal: adminEscolarAvisosEnviados.canal,
      })
      .from(adminEscolarAvisosEnviados)
      .where(inArray(adminEscolarAvisosEnviados.cargoId, [...new Set(pendientes.map((p) => p.fila.cargoId))]));
    for (const x of previos) yaSalio.add(`${x.cargoId}:${x.tipo}:${x.offsetDias}:${x.canal}`);
  }

  for (const p of pendientes) {
    // Se corta la tanda, no se marca nada: lo que queda sigue pendiente para
    // la corrida siguiente. Cortar aquí y no dentro del canal evita partir un
    // mismo aviso entre dos tandas.
    if (salidos >= limite) break;
    const { largo, corto } = redactar(p, opts.colegio);

    for (const canal of p.canales) {
      const destino = destinoDelCanal(p.fila, canal);
      // Sin dato de contacto no hay nada que intentar, y anotarlo como
      // enviado escondería para siempre a un responsable sin correo.
      if (!destino) {
        hechos.push({
          cargoId: p.fila.cargoId, aviso: p.aviso, canal, destino: null,
          ok: false, error: FALTA[canal],
        });
        continue;
      }

      if (opts.dryRun) {
        if (!yaSalio.has(`${p.fila.cargoId}:${p.aviso}:${p.offsetDias}:${canal}`)) {
          hechos.push({ cargoId: p.fila.cargoId, aviso: p.aviso, canal, destino, ok: true });
        }
        continue;
      }

      const nuevo = await reservar(p.fila.teamId, p.fila.cargoId, p.aviso, p.offsetDias, canal, destino);
      if (!nuevo) continue;  // ya había salido

      // La pausa va ANTES del envío y no después: así el último mensaje de la
      // tanda no deja la función esperando por nada.
      if (salidos > 0 && pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));
      salidos++;

      try {
        if (canal === 'correo') await opts.enviar.correo(destino, largo, p);
        else if (canal === 'whatsapp') await opts.enviar.whatsapp(destino, largo);
        // Al SMS se le quitan los acentos que GSM-7 no tiene. No es cosmética:
        // una sola `í` o `ó` —"Matrícula", "Psicopedagógico"— tumba el límite
        // de 160 a 70 caracteres y el mismo aviso pasa a cobrarse como tres.
        // Solo aquí: el correo y WhatsApp no cobran por carácter y ahí el
        // texto va con su ortografía.
        else await opts.enviar.sms(destino, aGsm7(corto));
        hechos.push({ cargoId: p.fila.cargoId, aviso: p.aviso, canal, destino, ok: true });
      } catch (err) {
        // Se suelta la reserva para que mañana se pueda reintentar. El fallo
        // más común es un teléfono que no normaliza, y ese no se arregla
        // reintentando — pero tampoco se arregla escondiéndolo.
        await liberar(p.fila.cargoId, p.aviso, p.offsetDias, canal);
        hechos.push({
          cargoId: p.fila.cargoId, aviso: p.aviso, canal, destino,
          ok: false, error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return hechos;
}

/** Equipos con algún concepto escolar que tenga los avisos encendidos. */
export async function equiposConAvisos(): Promise<number[]> {
  const filas = await db
    .selectDistinct({ teamId: adminEscolarConceptosPago.teamId })
    .from(adminEscolarConceptosPago)
    .where(and(
      eq(adminEscolarConceptosPago.avisosActivos, true),
      eq(adminEscolarConceptosPago.activo, true),
    ));
  return filas.map((f) => f.teamId);
}

/** Cargos que ya recibieron algún aviso hoy. Solo para el reporte del cron. */
export async function yaAvisadosHoy(teamId: number, hoy: string): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminEscolarAvisosEnviados)
    .where(and(
      eq(adminEscolarAvisosEnviados.teamId, teamId),
      sql`${adminEscolarAvisosEnviados.enviadoAt}::date = ${hoy}::date`,
    ));
  return fila?.n ?? 0;
}
