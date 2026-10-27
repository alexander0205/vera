import { aGsm7, LIMITE_GSM7_SIMPLE } from '@/lib/sms/mensaje';
import { huecoDe, type AvisoPlantilla, type DatosAviso } from '@/lib/whatsapp/plantillas';
import type { AvisoPendiente } from './avisos';
import { enLetra, pesos, redactar } from './avisos-texto';
import { sumarDias } from './calendario';
import type { Aviso, Canal } from './ciclo-cobro';

/**
 * Un mensaje por familia, no por cargo.
 *
 * El motor de avisos calcula «qué sale hoy» cargo por cargo, y eso está bien:
 * cada cargo tiene su fecha, su concepto y su fila de idempotencia. Lo que NO
 * está bien es mandar así. Una familia con tres hijos que paga la colegiatura
 * del mismo día recibía tres correos, tres WhatsApp y tres SMS por la misma
 * fecha, uno por hijo, todos con el mismo enlace de pago —el enlace es de la
 * familia, no del cargo—. Se leía como un error del colegio, y el SMS y el
 * WhatsApp los facturan.
 *
 * Aquí se junta lo que es el mismo recado: mismo colegio, mismo responsable de
 * pago, mismo momento (emisión, vencimiento o antes del recargo), mismo canal y
 * mismo día. Todo lo de aquí es PURO y sin base de datos, para poder probar con
 * fechas y familias concretas lo único que importa: que un cargo suelto salga
 * IGUAL que siempre, y que tres hermanos salgan en un solo mensaje.
 */

/** Un mensaje por salir: los cargos de una familia para un momento y un canal. */
export interface GrupoAviso {
  /** Identifica el MENSAJE: la familia en ese momento, más el canal. */
  clave: string;
  /**
   * La familia en ese momento, sin el canal.
   *
   * Es la unidad que una tanda no parte: si el presupuesto de la corrida se
   * acaba, se acaba ANTES de empezar una familia, no entre su correo y su
   * WhatsApp.
   */
  claveFamilia: string;
  teamId: number;
  /** Nulo = el alumno no tiene responsable de pago. Esos no se agrupan. */
  clientId: number | null;
  aviso: Aviso;
  offsetDias: number;
  /** En cuál de los cinco huecos de plantilla cae. Todos sus cargos coinciden. */
  hueco: AvisoPlantilla;
  canal: Canal;
  /** Los cargos que van en el mensaje, en el orden en que se leen. */
  miembros: AvisoPendiente[];
}

/**
 * Lo que un canal necesita saber de un mensaje ya reservado.
 *
 * Los `miembros` son los cargos que de verdad van: los que ya habían salido en
 * una corrida anterior se quedan fuera, así que puede haber menos que en el
 * grupo.
 */
export interface MensajeAviso {
  aviso: Aviso;
  hueco: AvisoPlantilla;
  canal: Canal;
  miembros: AvisoPendiente[];
}

const ORDEN_AVISO: Record<Aviso, number> = { 'al-emitir': 0, 'al-vencer': 1, 'antes-mora': 2 };
const ORDEN_CANAL: Record<Canal, number> = { correo: 0, whatsapp: 1, sms: 2 };

const cmp = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);
const cmpTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Junta los avisos que son el mismo recado.
 *
 * La clave es (colegio, responsable de pago, momento, offset, hueco de
 * plantilla, día, canal):
 *
 * - El **hueco** y no solo el momento porque `al-vencer` termina de tres formas
 *   según la mora del concepto —«tienes N días», «ya se aplicó el recargo»,
 *   «págala para ponerte al día»— y un mensaje no puede decir dos cosas a la
 *   vez. La colegiatura con gracia y los libros sin mora salen aparte. Con
 *   gracia, además, cuenta CUÁNTOS días: «tienes 5» y «tienes 3» no se pueden
 *   fundir en una frase.
 * - El **canal** porque cada concepto enciende los suyos: si a un hijo se le
 *   apagó el SMS, su cobro va en el correo y en el WhatsApp de la familia pero
 *   no en el SMS.
 * - El **día** para que dos corridas de días distintos jamás se mezclen.
 * - Sin **responsable de pago** no hay nadie a quien escribirle, y por eso no
 *   hay con quién agrupar: cada cargo queda solo y falla por su cuenta, que es
 *   lo que hay que ver en el reporte.
 *
 * El orden es determinista (colegio, responsable, momento, canal; dentro del
 * mensaje, por alumno y concepto) y no depende de en qué orden llegó la lista:
 * una familia ocupa siempre el mismo sitio en la cola, y una corrida que se
 * retoma a los quince minutos reconstruye los mismos mensajes.
 */
export function agruparPendientes(pendientes: readonly AvisoPendiente[]): GrupoAviso[] {
  const porClave = new Map<string, GrupoAviso>();

  for (const p of pendientes) {
    const { fila } = p;
    const hueco = huecoDe(p.aviso, fila.cobraMora, fila.moraDiasGracia);
    const gracia = hueco === 'al-vencer-con-gracia' ? Math.max(0, fila.moraDiasGracia) : 0;
    const quien = fila.clientId != null ? `c${fila.clientId}` : `sin-responsable-${fila.cargoId}`;
    const claveFamilia = [fila.teamId, quien, p.aviso, p.offsetDias, hueco, gracia, p.fecha].join('|');

    for (const canal of p.canales) {
      const clave = `${claveFamilia}|${canal}`;
      const ya = porClave.get(clave);
      if (!ya) {
        porClave.set(clave, {
          clave, claveFamilia, teamId: fila.teamId, clientId: fila.clientId,
          aviso: p.aviso, offsetDias: p.offsetDias, hueco, canal, miembros: [p],
        });
      } else if (!ya.miembros.some((m) => m.fila.cargoId === fila.cargoId)) {
        ya.miembros.push(p);
      }
    }
  }

  const grupos = [...porClave.values()];
  for (const g of grupos) {
    g.miembros.sort((a, b) =>
      a.fila.estudiante.localeCompare(b.fila.estudiante, 'es')
      || a.fila.concepto.localeCompare(b.fila.concepto, 'es')
      || cmp(a.fila.cargoId, b.fila.cargoId));
  }

  const primerCargo = (g: GrupoAviso) => Math.min(...g.miembros.map((m) => m.fila.cargoId));
  return grupos.sort((a, b) =>
    cmp(a.teamId, b.teamId)
    // Los sin responsable van al final; entre ellos, por cargo.
    || cmp(a.clientId ?? Number.MAX_SAFE_INTEGER, b.clientId ?? Number.MAX_SAFE_INTEGER)
    || (a.clientId == null && b.clientId == null ? cmp(primerCargo(a), primerCargo(b)) : 0)
    || cmp(ORDEN_AVISO[a.aviso], ORDEN_AVISO[b.aviso])
    || cmp(a.offsetDias, b.offsetDias)
    // Con TODA la familia desempatada antes de mirar el canal, los mensajes de
    // una misma familia quedan seguidos, y `despachar` puede cortar la tanda
    // entre familias sin partir ninguna.
    || cmpTexto(a.claveFamilia, b.claveFamilia)
    || cmp(ORDEN_CANAL[a.canal], ORDEN_CANAL[b.canal]));
}

// ─── Qué dice un mensaje de varios cobros ────────────────────────────────────

export interface ResumenGrupo {
  /** Cuántos cobros trae el mensaje. */
  cobros: number;
  /** Los alumnos, sin repetir y en el orden en que se leen. */
  alumnos: string[];
  conceptos: string[];
  totalCentavos: number;
  /** El vencimiento más cercano. Nulo si ninguno tiene fecha. */
  fechaVencimiento: string | null;
  /** La fecha del RECARGO más cercana: vencimiento más días de gracia. */
  fechaRecargo: string | null;
}

const masCercana = (fechas: (string | null)[]): string | null => {
  const ciertas = fechas.filter((f): f is string => !!f);
  return ciertas.length === 0 ? null : ciertas.reduce((a, b) => (b < a ? b : a));
};

export function resumirGrupo(miembros: readonly AvisoPendiente[]): ResumenGrupo {
  const alumnos = new Map<number, string>();
  for (const m of miembros) alumnos.set(m.fila.estudianteId, m.fila.estudiante);
  return {
    cobros: miembros.length,
    alumnos: [...alumnos.values()],
    conceptos: [...new Set(miembros.map((m) => m.fila.concepto))],
    totalCentavos: miembros.reduce((s, m) => s + m.fila.saldoCentavos, 0),
    fechaVencimiento: masCercana(miembros.map((m) => m.fila.fechaVencimiento)),
    fechaRecargo: masCercana(miembros.map((m) => m.fila.fechaVencimiento
      ? sumarDias(m.fila.fechaVencimiento, Math.max(0, m.fila.moraDiasGracia))
      : null)),
  };
}

/** «A», «A y B», «A, B y C». */
function enumerar(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Una lista legible que no pasa de `maxChars`.
 *
 * Es lo que evita que una familia con ocho hijos reviente el límite de Meta: lo
 * que no cabe se cuenta («Ana, Luis y 5 más») en vez de cortarse a media
 * palabra.
 */
export function unirLista(items: readonly string[], maxChars: number): string {
  const unicos = [...new Set(items.map(limpiar).filter(Boolean))];
  for (let visibles = unicos.length; visibles >= 1; visibles--) {
    const resto = unicos.length - visibles;
    const texto = resto === 0
      ? enumerar(unicos)
      : `${unicos.slice(0, visibles).join(', ')} y ${resto} más`;
    if (texto.length <= maxChars) return texto;
  }
  const primero = unicos[0] ?? '';
  return primero.length <= maxChars ? primero : `${primero.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

/** «08/10»: el día y el mes, que es como se escribe una fecha en un SMS. */
const diaMes = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/** Cuántas líneas de detalle caben en el cuerpo antes de resumir el resto. */
const MAX_LINEAS = 12;

/**
 * El SMS de varios cobros, dentro de los 160 caracteres de una sola parte.
 *
 * Un SMS que pasa de 160 se cobra como dos, y uno con una sola `í` mal puesta
 * como tres, así que el ajuste se hace midiendo el texto ya convertido a GSM-7
 * —que es como sale—. Si no cabe, primero se acorta el nombre del colegio (el
 * enlace es lo que de verdad le sirve al padre); solo si ni así cabe, se
 * renuncia al enlace.
 */
function ajustarSms(colegio: string, cuerpo: string, enlace: string | null): string {
  const armar = (c: string, conEnlace: boolean) =>
    `${c}: ${cuerpo}${conEnlace && enlace ? ` Detalle: ${enlace}` : ''}`;
  const cabe = (t: string) => aGsm7(t).length <= LIMITE_GSM7_SIMPLE;
  const NOMBRE_MIN = 10;

  for (const conEnlace of enlace ? [true, false] : [false]) {
    const completo = armar(colegio, conEnlace);
    if (cabe(completo)) return completo;
    const sobra = aGsm7(completo).length - LIMITE_GSM7_SIMPLE;
    const nombre = colegio.slice(0, Math.max(0, colegio.length - sobra)).trimEnd();
    if (nombre.length >= NOMBRE_MIN) return armar(nombre, conEnlace);
  }
  return aGsm7(armar(colegio, false)).slice(0, LIMITE_GSM7_SIMPLE);
}

/**
 * El texto de un mensaje, sea de uno o de varios cobros.
 *
 * Con UN cobro devuelve exactamente lo que `redactar()` ha devuelto siempre:
 * agrupar no puede cambiarle ni una coma a quien no tiene hermanos. Con varios,
 * enumera «alumno – concepto: monto», suma el total y da la fecha más cercana.
 *
 * `enlace` lleva a la factura del mensaje (o a lo que debe la familia si junta
 * varias; ver `facturaDelMensaje`), así que va uno solo.
 * Solo entra en el SMS de varios cobros (ahí sin él el padre no sabría cuáles);
 * el de un cobro sigue sin enlace, como siempre, porque 60 caracteres de URL se
 * comen media parte.
 */
export function redactarGrupo(
  miembros: readonly AvisoPendiente[],
  colegio: string,
  enlace: string | null = null,
): { largo: string; corto: string } {
  if (miembros.length === 1) return redactar(miembros[0], colegio);

  const r = resumirGrupo(miembros);
  const { aviso, fila } = miembros[0];
  const total = pesos(r.totalCentavos);

  const visibles = miembros.slice(0, MAX_LINEAS).map(
    (m) => `• ${m.fila.estudiante} – ${m.fila.concepto}: ${pesos(m.fila.saldoCentavos)}`,
  );
  if (miembros.length > MAX_LINEAS) {
    visibles.push(`• y ${miembros.length - MAX_LINEAS} cobros más`);
  }
  const lista = visibles.join('\n');

  let intro: string;
  let cierre: string;
  let cuerpoSms: string;

  if (aviso === 'al-emitir') {
    // «Cobros» y no «facturas»: la facturación automática hace UNA factura por
    // familia con todas sus líneas; decir «3 facturas» hace buscar tres.
    intro = `Ya están listos ${r.cobros} cobros, ${total} en total:`;
    cierre = r.fechaVencimiento ? `Tienes hasta el ${enLetra(r.fechaVencimiento)} para pagarlos.` : '';
    cuerpoSms = `${r.cobros} cobros por ${total}${r.fechaVencimiento ? `, vencen el ${diaMes(r.fechaVencimiento)}` : ''}.`;
  } else if (aviso === 'al-vencer') {
    // Mismo reparto que `redactar()`: todos los de un grupo comparten el hueco,
    // así que la cola de uno vale para todos. En plural.
    intro = `Hoy vencieron ${r.cobros} cobros, ${total} en total:`;
    cierre = fila.cobraMora
      ? (fila.moraDiasGracia > 0
          ? `Tienes ${fila.moraDiasGracia} día(s) antes de que se les aplique el recargo.`
          : 'Ya se les aplicó el recargo por mora.')
      : 'Págalos para ponerte al día.';
    cuerpoSms = `${r.cobros} cobros por ${total} vencieron hoy.`;
  } else {
    // antes-mora: la fecha es la del RECARGO, la más cercana de las del grupo.
    const fechaMora = r.fechaRecargo ? enLetra(r.fechaRecargo) : 'pronto';
    intro = `Tienes ${r.cobros} cobros vencidos, ${total} en total:`;
    cierre = `Paga ${total} antes del ${fechaMora} y evita el recargo por mora.`;
    cuerpoSms = `Paga ${total} (${r.cobros} cobros) antes del ${r.fechaRecargo ? diaMes(r.fechaRecargo) : 'pronto'} y evita el recargo.`;
  }

  return {
    largo: [intro, lista, cierre].filter(Boolean).join('\n\n'),
    corto: ajustarSms(colegio, cuerpoSms, enlace),
  };
}

/**
 * El asunto del correo: en plural (cobros) cuando el mensaje trae varios.
 * `conFactura` en false —un cobro recién puesto, sin facturar todavía— dice
 * «cobro» y no «factura»: el padre buscaría una factura que no existe.
 */
export function asuntoDeAviso(aviso: Aviso, cobros: number, conFactura = true): string {
  const varios = cobros > 1;
  if (aviso === 'al-vencer') return varios ? 'Tus cobros vencieron hoy' : 'Tu factura venció hoy';
  if (aviso === 'al-emitir') return varios ? `Tienes ${cobros} cobros nuevos` : conFactura ? 'Tienes una factura nueva' : 'Tienes un cobro nuevo';
  // Antes del recargo ya están VENCIDOS: decir «próximos a vencer» contradice el cuerpo.
  return varios ? 'Evita el recargo de tus cobros' : 'Evita el recargo de tu factura';
}

// ─── Las variables de la plantilla de WhatsApp ───────────────────────────────

/**
 * Cuánto puede ocupar cada lista dentro de la plantilla. Meta rechaza un cuerpo
 * de más de 1024 caracteres, texto fijo de la plantilla incluido: con estos dos
 * topes y el resto de variables cortas queda holgado.
 */
const MAX_ALUMNOS = 160;
const MAX_CONCEPTOS = 160;

/**
 * Los valores con que se rellena la plantilla de WhatsApp.
 *
 * Se usa la MISMA plantilla aprobada que para un solo cobro, rellenando sus
 * variables posicionales con valores combinados —alumno «Ana y Pedro», concepto
 * «Colegiatura de octubre (2)», monto el total—. Una plantilla nueva «de
 * familia» habría que mandarla a aprobar a Meta, esperar, y asignarla en cada
 * colegio; así sale hoy.
 *
 * Con UN cobro devuelve exactamente lo que el cron armaba en línea, valor por
 * valor. Con varios, los textos largos se compactan («Ana, Luis y 3 más») para
 * dejar el cuerpo muy por debajo del tope de Meta; los saltos de línea y los
 * vacíos los resuelve después `parametrosDeAviso()`.
 */
export function datosWhatsAppDeGrupo(
  miembros: readonly AvisoPendiente[],
  base: { colegio: string; telefonoColegio: string },
): DatosAviso {
  const r = resumirGrupo(miembros);
  const { fila } = miembros[0];

  return {
    colegio: base.colegio,
    telefonoColegio: base.telefonoColegio,
    concepto: miembros.length === 1
      ? fila.concepto
      : `${unirLista(r.conceptos, MAX_CONCEPTOS)} (${r.cobros})`,
    estudiante: miembros.length === 1
      ? fila.estudiante
      : unirLista(r.alumnos, MAX_ALUMNOS),
    monto: pesos(r.totalCentavos),
    fechaLimite: r.fechaVencimiento ? enLetra(r.fechaVencimiento) : null,
    diasGracia: fila.moraDiasGracia,
    // La fecha del RECARGO, no la del vencimiento — igual que en `redactar()`.
    fechaRecargo: r.fechaRecargo ? enLetra(r.fechaRecargo) : null,
  };
}

// ─── El enlace de pago del mensaje ───────────────────────────────────────────

/**
 * La factura del mensaje, si es UNA sola.
 *
 * El enlace de la familia (`/pagar/<token>`) enseña TODO lo que debe; con
 * `?f=<factura>` enseña y cobra solo esa factura, y la página valida que sea de
 * esa familia. Un aviso de «ya está lista tu factura» tiene que llevar a ESA
 * factura, no a la deuda entera. La facturación automática hace una factura
 * por familia, así que lo normal es que todos los cobros del mensaje
 * compartan la misma. Si el mensaje junta varias facturas, o algún cobro aún
 * no está facturado, no hay una sola que enseñar: va el enlace de la familia.
 */
export function facturaDelMensaje(miembros: readonly Pick<AvisoPendiente, 'fila'>[]): number | null {
  const ids = new Set(miembros.map((m) => m.fila.ecfDocumentId ?? null));
  if (ids.size !== 1) return null;
  const [id] = ids;
  return id ?? null;
}

/** El enlace de la familia acotado a una factura, si la hay. */
export function enlaceDeFactura(enlaceFamilia: string, facturaId: number | null): string {
  return facturaId != null ? `${enlaceFamilia}?f=${facturaId}` : enlaceFamilia;
}

/**
 * Lo que rellena la variable del botón «Ver y pagar» de WhatsApp.
 *
 * Meta solo deja variable AL FINAL de la URL del botón: la plantilla lleva
 * `https://…/pagar/{{1}}` y aquí va lo que sigue —el token y, si hay, `?f=`—.
 * Mandar la URL entera la duplicaría (`…/pagar/https://…/pagar/abc`).
 */
export function sufijoDeBoton(enlace: string): string {
  const i = enlace.indexOf('/pagar/');
  return i >= 0 ? enlace.slice(i + '/pagar/'.length) : enlace;
}
