import { randomUUID } from 'crypto';
import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getOCrearLink, urlDelLink } from './link-pago';
import {
  adminEscolarAvisosEnviados, adminEscolarCargos, adminEscolarConceptoCuotas,
  adminEscolarConceptosPago, adminEscolarEstudiantes, clients,
} from '@/lib/db/schema';
import { aGsm7 } from '@/lib/sms/mensaje';
import {
  agruparPendientes, redactarGrupo, enlaceDeFactura, facturaDelMensaje, type GrupoAviso, type MensajeAviso,
} from './agrupar-avisos';
import { sumarDias } from './calendario';
import { CANALES_TODOS_ACTIVOS, type CanalesActivos } from './canales';
import { CANALES_DEL_AVISO, type Aviso, type Canal } from './ciclo-cobro';
import { destinoDeContacto } from './destino-canal';

// El texto de un aviso suelto vive en `avisos-texto.ts` para que el de varios
// cobros pueda construirse encima sin un import circular. Se exporta de nuevo
// aquí: es de donde lo ha importado siempre todo el mundo.
export { enLetra, pesos, redactar } from './avisos-texto';

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
 *
 * Calcular es por CARGO; mandar es por FAMILIA. Los cargos de un mismo
 * responsable que caen el mismo día, en el mismo momento y por el mismo canal
 * viajan en un solo mensaje (`agrupar-avisos.ts`), pero en la tabla sigue
 * habiendo una fila por cargo: la idempotencia, la reconciliación de entregas
 * y los paneles no se enteran. Lo que une las filas de un mensaje es `grupo`.
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
  /**
   * La factura que cubre este cargo, si ya se emitió.
   *
   * Decide si el aviso lleva enlace de pago. Un cargo sin factura NO se puede
   * cobrar —el cobro es de un documento, ver aprobarComprobante()—, así que
   * mandarle el enlace es llevar al padre a una página donde transfiere, sube
   * su comprobante, y el colegio no puede aplicarlo. Le queda un pago en el
   * aire y al colegio una explicación que dar.
   */
  ecfDocumentId: number | null;
  /** Los cuatro son distintos y no siempre coinciden. Uno por canal. */
  email: string | null;
  whatsapp: string | null;
  celular: string | null;
  telefono: string | null;
}

/**
 * El número o correo de cada canal. La regla vive en `destino-canal.ts`, que
 * comparten las pantallas: el WhatsApp sale solo al campo «WhatsApp»; el SMS al
 * celular y, si no hay, al número de WhatsApp. El fijo de la casa no recibe
 * nada: mandar un SMS a un fijo es un mensaje cobrado que no llega a nadie.
 */
export function destinoDelCanal(fila: FilaAviso, canal: Canal): string | null {
  return destinoDeContacto(fila, canal);
}

/** Lo que se le dice al usuario cuando falta el dato de contacto. */
const FALTA: Record<Canal, string> = {
  correo: 'El responsable de pago no tiene correo',
  whatsapp: 'El responsable de pago no tiene número de WhatsApp',
  sms: 'El responsable de pago no tiene celular',
};

export interface AvisoPendiente {
  fila: FilaAviso;
  aviso: Aviso;
  /** Días de antelación configurados. Va al índice único. */
  offsetDias: number;
  /**
   * El día en que cae este aviso (`hoy` cuando sale). Dos avisos de días
   * distintos no son el mismo recado aunque lo parezcan, y `agruparPendientes`
   * no los junta.
   */
  fecha: string;
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
      fecha: s.fecha,
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
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
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
    ))
    // Siempre en el mismo orden: colegio, responsable, cargo. Sin ORDER BY
    // Postgres devuelve las filas como le da la gana, y los hermanos de una
    // familia podían caer en puntos distintos de la cola. Ya no importa para
    // agrupar —`agruparPendientes` ordena por su cuenta— pero sí para que dos
    // corridas del mismo día lean la misma lista y retomen donde la anterior
    // se quedó. Los alumnos sin responsable (NULL) quedan al final.
    .orderBy(asc(adminEscolarCargos.teamId), asc(clients.id), asc(adminEscolarCargos.id));

  return filas.map((f) => ({
    ...f,
    estudiante: `${f.nombres} ${f.apellidos ?? ''}`.trim(),
    fechaEmision: f.fechaEmision ? String(f.fechaEmision) : null,
    fechaVencimiento: f.fechaVencimiento ? String(f.fechaVencimiento) : null,
  }));
}

export interface EnvioHecho {
  cargoId: number; aviso: Aviso; canal: Canal; destino: string | null;
  ok: boolean; error?: string;
  /**
   * El mensaje al que pertenece (`GrupoAviso.clave`). Los cargos de una misma
   * familia que viajaron juntos comparten esta clave: hay un `EnvioHecho` por
   * cargo —para que el reporte siga diciendo a quién le falta el correo— pero
   * un solo mensaje, y quien cuenta mensajes tiene que contar claves, no filas.
   */
  grupo?: string;
}

/**
 * Cuántos mensajes DISTINTOS salieron (o saldrían, en un simulacro).
 *
 * Es lo que gasta el presupuesto de la corrida: tres hermanos en un correo son
 * un correo, no tres. Sin esto la tanda se creería llena a los 20 mensajes y
 * dejaría familias sin avisar.
 */
export function mensajesEnviados(hechos: readonly EnvioHecho[]): number {
  return new Set(
    hechos.filter((h) => h.ok).map((h) => h.grupo ?? `${h.cargoId}:${h.aviso}:${h.canal}`),
  ).size;
}

/**
 * Reserva el envío de TODO un mensaje en la tabla de idempotencia.
 *
 * Devuelve los cargos que se reservaron, cada uno con el id de su fila. Los que
 * ya estaban —el índice único rebota el insert y esa es la señal de que ese
 * aviso ya salió— se quedan fuera, y el mensaje se arma solo con los que faltan.
 * Preguntar antes con un SELECT dejaría una carrera abierta entre dos corridas
 * del cron.
 *
 * Una fila por CARGO aunque el mensaje sea uno: el índice único, la
 * reconciliación de entregas y los paneles del alumno trabajan por cargo, y
 * siguen sin enterarse de que se agrupó. Lo único que las une es `grupo`, que
 * es lo que deja contar la cuota por mensaje y no por fila.
 */
async function reservarGrupo(
  g: GrupoAviso, destino: string, grupo: string | null,
): Promise<{ id: number; miembro: AvisoPendiente }[]> {
  const filas = await db.insert(adminEscolarAvisosEnviados)
    .values(g.miembros.map((m) => ({
      teamId: m.fila.teamId,
      cargoId: m.fila.cargoId,
      tipo: g.aviso,
      offsetDias: g.offsetDias,
      canal: g.canal,
      destino,
      grupo,
    })))
    .onConflictDoNothing()
    .returning({ id: adminEscolarAvisosEnviados.id, cargoId: adminEscolarAvisosEnviados.cargoId });

  // En el orden del mensaje, no en el que devuelva Postgres.
  const idPorCargo = new Map(filas.map((f) => [f.cargoId, f.id]));
  return g.miembros.flatMap((m) => {
    const id = idPorCargo.get(m.fila.cargoId);
    return id == null ? [] : [{ id, miembro: m }];
  });
}

/**
 * Suelta la reserva de TODO el mensaje.
 *
 * Todas o ninguna: si se soltara solo la fila de un cargo, la corrida siguiente
 * mandaría ese cargo suelto y a la familia le llegaría el mismo aviso otra vez
 * con los demás hermanos ya dentro del primero.
 */
async function liberarReservas(ids: number[]) {
  if (ids.length === 0) return;
  await db.delete(adminEscolarAvisosEnviados).where(inArray(adminEscolarAvisosEnviados.id, ids));
}

export interface OpcionesDespacho {
  /** Sin esto no se manda nada: se calcula y se devuelve el plan. */
  dryRun: boolean;
  colegio: string;
  /**
   * Cuántos MENSAJES como mucho salen en esta corrida.
   *
   * Un colegio de 465 alumnos con tres canales encendidos son más de mil
   * mensajes de golpe a las 8 de la mañana: WhatsApp lo lee como ráfaga y
   * empieza a rebotar, y el proveedor de SMS también tiene su cadencia. Lo que
   * no entra en esta tanda NO se pierde — sigue pendiente y sale en la
   * siguiente corrida del día, porque el plan es el mismo mientras sea el
   * mismo día y la tabla de idempotencia ya sabe lo que salió.
   *
   * Se cuentan mensajes, no cargos: una familia con tres hijos es un correo, un
   * WhatsApp y un SMS, y la tanda no la parte a la mitad.
   */
  limite?: number;
  /** Espera entre mensaje y mensaje. Es lo que reparte la tanda en el tiempo. */
  pausaMs?: number;
  /**
   * Cuántos mensajes le quedan a cada canal en su cuota MENSUAL del plan.
   * Infinity o ausente = sin tope.
   *
   * No confundir con `limite`, que es el presupuesto de ESTA corrida y solo
   * reparte la ráfaga en el tiempo: lo que no entra hoy sale en un rato. Esto
   * es dinero — cada WhatsApp y cada SMS nos los factura el proveedor — y lo
   * que no entra aquí no sale hasta el mes que viene. Por eso se cuenta por
   * canal y no en un solo saco: que se agote el SMS no debe callar el
   * WhatsApp. El correo nunca lleva tope. Ver lib/suscripcion/cuota-avisos.ts.
   */
  restantePorCanal?: Partial<Record<Canal, number>>;
  enviar: {
    // Reciben el MENSAJE (los cargos que van juntos), no un cargo: el asunto del
    // correo y las variables de la plantilla cambian cuando son varios.
    correo: (destino: string, texto: string, m: MensajeAviso) => Promise<void>;
    // Fuera de la ventana de 24 h WhatsApp solo admite plantillas, y para elegir
    // la plantilla y rellenar sus variables hace falta saber de qué aviso se
    // trata y qué cobros lleva.
    whatsapp: (destino: string, texto: string, m: MensajeAviso, enlace: string | null) => Promise<string | null>;
    sms: (destino: string, texto: string) => Promise<void>;
  };
}

/**
 * Manda lo que toca y anota lo que salió.
 *
 * Los cargos de una misma familia que caen el mismo día, en el mismo momento y
 * por el mismo canal viajan en UN mensaje (ver `agruparPendientes`). Por cada
 * cargo sigue habiendo una fila en la tabla de idempotencia y un `EnvioHecho`.
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

  // Copia local: se va descontando mensaje a mensaje dentro de la tanda. Sin
  // esto habría que releer la base en cada envío para saber si ya se pasó, o
  // —peor— confiar en el conteo del principio y mandar de más.
  const restante: Partial<Record<Canal, number>> = { ...opts.restantePorCanal };

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

  /** clientId → URL de su enlace de pago, dentro de esta tanda. */
  const enlaces = new Map<number, string>();

  let familiaActual: string | null = null;
  for (const g of agruparPendientes(pendientes)) {
    // Se corta la tanda, no se marca nada: lo que queda sigue pendiente para
    // la corrida siguiente. Se corta ENTRE familias y no entre sus canales ni
    // entre sus hijos: a un mismo responsable no se le parte el recado en dos
    // tandas de quince minutos.
    if (g.claveFamilia !== familiaActual) {
      if (salidos >= limite) break;
      familiaActual = g.claveFamilia;
    }

    const { canal } = g;
    // Mismo responsable → mismo correo, WhatsApp y celular para todo el grupo.
    const destino = destinoDelCanal(g.miembros[0].fila, canal);
    const hecho = (m: AvisoPendiente, ok: boolean, error?: string): EnvioHecho => ({
      cargoId: m.fila.cargoId, aviso: g.aviso, canal, destino: destino ?? null,
      ok, ...(error ? { error } : {}), grupo: g.clave,
    });

    // Cuota del mes agotada en este canal: se salta el canal, NO el aviso.
    // El mismo recordatorio sigue saliendo por los canales que le queden —
    // normalmente el correo, que no lleva tope. Se anota como fallo a
    // propósito: un tope que corta callado se lee después como «no había
    // nada que mandar», y nadie se entera de que el colegio necesita
    // más cupo.
    const quedan = restante[canal];
    if (quedan !== undefined && quedan <= 0) {
      for (const m of g.miembros) hechos.push(hecho(m, false, `Cuota mensual de ${canal} agotada`));
      continue;
    }

    // Sin dato de contacto no hay nada que intentar, y anotarlo como
    // enviado escondería para siempre a un responsable sin correo.
    if (!destino) {
      for (const m of g.miembros) hechos.push(hecho(m, false, FALTA[canal]));
      continue;
    }

    if (opts.dryRun) {
      for (const m of g.miembros) {
        if (!yaSalio.has(`${m.fila.cargoId}:${g.aviso}:${g.offsetDias}:${canal}`)) {
          hechos.push(hecho(m, true));
        }
      }
      continue;
    }

    // Un identificador por mensaje, solo si hay varios cargos: es lo que deja
    // contar la cuota por mensaje en el SMS y el correo, que no devuelven id.
    const grupo = g.miembros.length > 1 ? randomUUID() : null;
    const reservados = await reservarGrupo(g, destino, grupo);
    if (reservados.length === 0) continue;  // ya había salido
    const ids = reservados.map((r) => r.id);
    const miembros = reservados.map((r) => r.miembro);

    // La pausa va ANTES del envío y no después: así el último mensaje de la
    // tanda no deja la función esperando por nada.
    if (salidos > 0 && pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));
    salidos++;

    let mensajeId: string | null = null;
    try {
      // El enlace de pago va pegado al aviso: sin él el padre sabe que debe pero
      // no tiene a dónde ir, y termina llamando al colegio. En el texto largo
      // —correo y WhatsApp— siempre; en el SMS de UN cobro no, porque los 60
      // caracteres de la URL se comen la mitad del mensaje y lo parten en dos,
      // que se cobran como dos. El de varios cobros sí lo lleva (ver
      // `redactarGrupo`): sin él el padre no sabe cuáles.
      //
      // Es UN enlace por responsable, no por hijo, y se memoriza dentro de la
      // tanda: la familia lo recibe por tres canales y la consulta es la misma.
      //
      // Sin factura no hay nada que cobrar todavía: el aviso sale igual —la
      // deuda existe— pero sin enlace, porque el enlace promete algo que no se
      // puede cumplir. Basta con que UNO de los cobros del mensaje esté
      // facturado: la página del enlace enseña lo que ya se puede pagar.
      let enlace: string | null = null;
      if (g.clientId != null && miembros.some((m) => m.fila.ecfDocumentId != null)) {
        try {
          let link = enlaces.get(g.clientId);
          if (!link) {
            link = urlDelLink((await getOCrearLink(g.teamId, g.clientId)).token);
            enlaces.set(g.clientId, link);
          }
          // El de la familia se memoriza; lo que cambia por mensaje es la
          // factura: el aviso lleva a ESA factura, no a toda la deuda.
          enlace = enlaceDeFactura(link, facturaDelMensaje(miembros));
        } catch (err) {
          // Que no se pueda crear el enlace no puede impedir el aviso: el padre
          // prefiere enterarse de que debe, aunque sea sin botón.
          console.error('[avisos] no se pudo crear el enlace de pago:', err);
        }
      }

      const { largo, corto } = redactarGrupo(miembros, opts.colegio, enlace);
      const conEnlace = enlace ? `${largo}\n\nPaga o sube tu comprobante aquí: ${enlace}` : largo;
      const mensaje: MensajeAviso = { aviso: g.aviso, hueco: g.hueco, canal, miembros };

      if (canal === 'correo') await opts.enviar.correo(destino, conEnlace, mensaje);
      else if (canal === 'whatsapp') {
        // Se guarda el id que devuelve el CRM. El 201 solo dice que Meta
        // aceptó la petición; con este id se puede volver a preguntar más
        // tarde si el mensaje LLEGÓ, y soltar la reserva si no.
        mensajeId = await opts.enviar.whatsapp(destino, conEnlace, mensaje, enlace);
      }
      // Al SMS se le quitan los acentos que GSM-7 no tiene. No es cosmética:
      // una sola `í` o `ó` —"Matrícula", "Psicopedagógico"— tumba el límite
      // de 160 a 70 caracteres y el mismo aviso pasa a cobrarse como tres.
      // Solo aquí: el correo y WhatsApp no cobran por carácter y ahí el
      // texto va con su ortografía.
      else await opts.enviar.sms(destino, aGsm7(corto));
    } catch (err) {
      // Se suelta la reserva de TODO el mensaje para que se pueda reintentar.
      // El fallo más común es un teléfono que no normaliza, y ese no se
      // arregla reintentando — pero tampoco se arregla escondiéndolo.
      await liberarReservas(ids);
      const error = err instanceof Error ? err.message : String(err);
      for (const m of miembros) hechos.push(hecho(m, false, error));
      continue;
    }

    // El mensaje YA salió. Anotarle el id y la constancia de que viajó junto
    // con otros no puede deshacerlo: va aparte del try de arriba, porque si
    // fallara ahí se soltaría la reserva de algo que sí se mandó y mañana la
    // familia lo recibiría otra vez.
    const conjunto = miembros.length > 1
      ? `Enviado en un solo mensaje con ${miembros.length - 1} cobro(s) más`
      : null;
    if (mensajeId || conjunto) {
      try {
        await db.update(adminEscolarAvisosEnviados)
          .set({
            ...(mensajeId ? { mensajeId } : {}),
            ...(conjunto ? { detalle: conjunto } : {}),
          })
          .where(inArray(adminEscolarAvisosEnviados.id, ids));
      } catch (err) {
        console.error('[avisos] el mensaje salió pero no se pudo anotar su id:', err);
      }
    }

    // Solo se descuenta lo que de verdad salió: un envío que reventó se
    // libera arriba para reintentarse, y cobrarle el cupo además sería
    // castigarlo dos veces por el mismo teléfono mal escrito. Un mensaje es un
    // mensaje, lleve uno o cinco cobros: eso es lo que factura el proveedor.
    if (restante[canal] !== undefined) restante[canal]! -= 1;
    for (const m of miembros) hechos.push(hecho(m, true));
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
