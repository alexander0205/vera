/**
 * Lo que dicen los tres correos de la corrida de facturación.
 *
 * Aparte del HTML (`lib/email/escolar-corrida.ts`) para que la decisión de QUÉ
 * se le dice al colegio se pueda probar sin Resend ni plantillas: acá se elige
 * el texto según el aviso (5 días, 2 días, resultado) y según quién factura
 * (Zero solo, o el colegio a mano). Allá solo se pinta.
 *
 * Reglas del texto, las mismas de `lib/email/suscripcion.ts`: una idea y un
 * botón. Y dos propias de este módulo:
 *
 *   · NUNCA un nombre de alumno. El correo va a quien administra, pero se
 *     reenvía y se imprime; son cuentas, no personas.
 *   · El tono es el de una persona de atención al cliente, no el de un sistema:
 *     saluda al colegio, agradece, explica en frases cortas qué pasa y por qué
 *     se le avisa, presenta lo que hay que revisar como una ayuda y termina
 *     ofreciendo ayuda. Nada de alarmas: aun cuando algo no salió, se cuenta lo
 *     que se encontró y cuándo se reintenta.
 */

import { fmtDOP } from '@/lib/utils/format';
import {
  type ModoCorrida,
  type PuntoRevision,
  type ResumenCorrida,
  type TipoAviso,
} from './corrida-avisos';

/** 07:00 UTC, la hora a la que corre el cron de devengo y facturación. */
export const HORA_DE_LA_CORRIDA = '3:00 a. m.';

export interface DatosAvisoCorrida {
  tipo: TipoAviso;
  /** La fecha de emisión de las cuotas de las que habla el aviso (ISO). */
  fecha: string;
  modo: ModoCorrida;
  colegio: string;
  resumen: ResumenCorrida;
}

export type DestinoEnlace = 'por-facturar' | 'cuentas-por-cobrar' | 'tarifas';

export interface OpcionesDeRedaccion {
  /** Hay un número de WhatsApp de soporte configurado: se ofrece como vía de ayuda. */
  whatsapp?: boolean;
}

export interface RedaccionCorrida {
  asunto: string;
  titulo: string;
  /** «Hola, equipo de {colegio}». */
  saludo: string;
  /** Párrafos cortos separados por una línea en blanco. */
  intro: string;
  cifras: { etiqueta: string; valor: string }[];
  conceptos: string[];
  tituloRevision: string | null;
  revision: string[];
  boton: { texto: string; destino: DestinoEnlace };
  enlace: { texto: string; destino: DestinoEnlace } | null;
  pie: string;
  /** El ofrecimiento de ayuda con que cierra el correo. */
  ayuda: string;
}

// ─── Fechas y cantidades ─────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «30 de octubre». A mano y no con `Intl`: el mismo texto en cualquier servidor. */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** «viernes 30 de octubre». */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

const cant = (n: number, uno: string, otros: string) => `${n} ${n === 1 ? uno : otros}`;

// ─── Lo que hay que revisar ──────────────────────────────────────────────────

/** Una línea de «lo que hay que revisar», lista para pegar en el correo. */
export function textoDeRevision(p: PuntoRevision): string {
  const n = p.cantidad;
  switch (p.codigo) {
    case 'sin-responsable':
      return `${cant(n, 'alumno no tiene', 'alumnos no tienen')} responsable de pago, así que no hay a quién facturarle.`;
    case 'sin-tarifa':
      return `${cant(n, 'cobro marcado al matricular no tiene', 'cobros marcados al matricular no tienen')} tarifa para el grado del alumno, así que no se ${n === 1 ? 'va' : 'van'} a cobrar.`;
    case 'sin-producto':
      return `${cant(n, 'línea no tiene', 'líneas no tienen')} producto de facturación ni en la tarifa ni en el concepto: saldr${n === 1 ? 'ía' : 'ían'} con ITBIS exento.`;
    case 'planes':
      return `${cant(n, 'cargo de colegiatura queda', 'cargos de colegiatura quedan')} fuera de esta facturación: hay alumnos con un plan recurrente activo y es el plan quien factura la colegiatura.`;
    case 'monto-distinto': {
      const salto = p.de != null && p.a != null ? ` (de ${fmtDOP(p.de)} a ${fmtDOP(p.a)})` : '';
      return `${p.concepto ?? 'Un concepto'}: ${cant(n, 'cargo cambia', 'cargos cambian')} de monto respecto a la cuota anterior${salto}.`;
    }
    case 'sin-saldo':
      return `${cant(n, 'cargo está', 'cargos están')} en cero por beca total: no ${n === 1 ? 'lleva' : 'llevan'} factura.`;
    case 'sin-cargo':
      return `${cant(n, 'cargo que debía existir hoy no se generó', 'cargos que debían existir hoy no se generaron')}. El proceso se repite cada día y debería recogerlos mañana.`;
    case 'sin-factura':
      return `${cant(n, 'familia quedó', 'familias quedaron')} sin factura aunque todo parecía en orden. Zero lo reintenta mañana; si sigue igual, revisa esas familias una por una.`;
  }
}

/** Los puntos que se arreglan en Tarifas, para ofrecer el enlace. */
const SE_ARREGLAN_EN_TARIFAS = new Set(['sin-tarifa', 'sin-producto', 'monto-distinto']);

// ─── Los tres correos ────────────────────────────────────────────────────────

/**
 * Elige y redacta el correo.
 *
 * Dos ejes: QUÉ aviso es y QUIÉN factura. En automático el correo dice que Zero
 * generará las facturas a las 3:00 a. m.; en manual el mismo dato es un
 * recordatorio de que el colegio tiene que facturar él.
 */
export function redactarAviso(d: DatosAvisoCorrida, o: OpcionesDeRedaccion = {}): RedaccionCorrida {
  const base = {
    saludo: `Hola, equipo de ${d.colegio}`,
    ayuda: o.whatsapp
      ? 'Si algo no se ve bien, responde este correo o escríbenos por WhatsApp y te ayudamos.'
      : 'Si algo no se ve bien, responde este correo y te ayudamos.',
  };
  switch (d.tipo) {
    case 'aviso-5': return { ...base, ...avisoDeCincoDias(d) };
    case 'aviso-2': return { ...base, ...avisoDeDosDias(d) };
    case 'resultado': return { ...base, ...resultado(d) };
  }
}

type Cuerpo = Omit<RedaccionCorrida, 'saludo' | 'ayuda'>;

/** Los puntos a revisar, presentados como una ayuda para que la corrida salga bien. */
function revisionDelAviso(r: ResumenCorrida, fecha: string) {
  return {
    revision: r.revisar.map(textoDeRevision),
    tarifas: r.revisar.some((p) => SE_ARREGLAN_EN_TARIFAS.has(p.codigo)),
    titulo: `Para que todo salga bien, revisa esto antes del ${fechaCorta(fecha)}`,
  };
}

function avisoDeCincoDias(d: DatosAvisoCorrida): Cuerpo {
  const r = d.resumen;
  const auto = d.modo === 'automatico';
  const asunto = `Así va a salir la facturación del ${fechaCorta(d.fecha)}`;
  const { revision, tarifas, titulo } = revisionDelAviso(r, d.fecha);

  return {
    asunto,
    titulo: asunto,
    intro: auto
      ? [
          `Gracias por confiar en Zero. Te escribimos con tiempo para que el cobro del ${fechaLarga(d.fecha)} salga sin sorpresas.`,
          `Ese día, a las ${HORA_DE_LA_CORRIDA}, Zero va a generar las facturas por ti, una por familia. Así saldrían con los datos de hoy:`,
        ].join('\n\n')
      : [
          `Gracias por confiar en Zero. Te escribimos para recordarte que el ${fechaLarga(d.fecha)} sale el cobro de ${d.colegio}.`,
          'En este colegio las facturas las hace tu equipo, así que ese día toca facturar a las familias. Esto es lo que habría que facturar con los datos de hoy:',
        ].join('\n\n'),
    cifras: auto
      ? [
          { etiqueta: 'Facturas a generar', valor: String(r.familias) },
          { etiqueta: 'Total', valor: fmtDOP(r.totalCentavos) },
        ]
      : [
          { etiqueta: 'Familias por facturar', valor: String(r.familias) },
          { etiqueta: 'Total', valor: fmtDOP(r.totalCentavos) },
        ],
    conceptos: r.porConcepto.map((c) =>
      `${c.concepto}: ${cant(c.lineas, 'cargo', 'cargos')}, ${fmtDOP(c.totalCentavos)}`),
    tituloRevision: revision.length > 0 ? titulo : 'Todo en orden',
    revision: revision.length > 0
      ? revision
      : ['Con los datos de hoy no encontramos nada que revisar: todo está listo para salir.'],
    boton: { texto: auto ? 'Revisar familias por facturar' : 'Ir a familias por facturar', destino: 'por-facturar' },
    enlace: tarifas ? { texto: 'Revisar las tarifas', destino: 'tarifas' } : null,
    pie: auto
      ? 'Las facturas se crean como borrador: nada se envía a la DGII solo.'
      : 'Las cuotas pasan a ser cargos el día de la emisión; desde ese momento ya puedes facturarlas.',
  };
}

function avisoDeDosDias(d: DatosAvisoCorrida): Cuerpo {
  const r = d.resumen;
  const auto = d.modo === 'automatico';
  const { revision, tarifas, titulo } = revisionDelAviso(r, d.fecha);
  const enOrden = revision.length === 0 ? ' Con los datos de hoy todo está en orden.' : '';
  const recordatorio = 'Gracias por confiar en Zero. Un recordatorio rápido, para que nada te tome por sorpresa.';

  return {
    asunto: 'Pasado mañana se factura',
    titulo: 'Pasado mañana se factura',
    intro: auto
      ? [
          recordatorio,
          `Pasado mañana, ${fechaLarga(d.fecha)}, a las ${HORA_DE_LA_CORRIDA}, Zero genera por ti ${cant(r.familias, 'factura', 'facturas')} de ${d.colegio}, por ${fmtDOP(r.totalCentavos)}.${enOrden}`,
        ].join('\n\n')
      : [
          recordatorio,
          `Pasado mañana, ${fechaLarga(d.fecha)}, sale el cobro de ${d.colegio} y toca facturar a ${cant(r.familias, 'familia', 'familias')} (${fmtDOP(r.totalCentavos)}).${enOrden}`,
        ].join('\n\n'),
    cifras: [],
    conceptos: [],
    tituloRevision: revision.length > 0 ? titulo : null,
    revision,
    boton: { texto: auto ? 'Revisar familias por facturar' : 'Ir a familias por facturar', destino: 'por-facturar' },
    enlace: tarifas ? { texto: 'Revisar las tarifas', destino: 'tarifas' } : null,
    pie: auto ? 'Las facturas se crean como borrador: nada se envía a la DGII solo.' : '',
  };
}

function resultado(d: DatosAvisoCorrida): Cuerpo {
  const r = d.resumen;
  const auto = d.modo === 'automatico';
  const hechas = r.facturadasHoy;
  const pendientes = r.familias;
  const revision = r.revisar.map(textoDeRevision);

  // El día que tocaba facturar y ni siquiera hay cargos: el devengo no corrió o
  // no pudo. Es la noticia más delicada del resultado y se dice primero, igual
  // en los dos modos, pero con calma: se reintenta solo.
  const sinCargo = r.sinCargo;
  const nadaGenerado = hechas.facturas === 0 && pendientes === 0 && sinCargo.lineas > 0;

  const gracias = 'Gracias por confiar en Zero. Te contamos cómo salió la facturación de hoy.';
  let intro: string;
  if (nadaGenerado) {
    intro = [
      'Gracias por confiar en Zero. Hoy tocaba facturar y queremos contarte lo que encontramos.',
      `Los cargos de ${cant(sinCargo.familias, 'familia', 'familias')} de ${d.colegio} (${fmtDOP(sinCargo.totalCentavos)}) todavía no se han generado. No te preocupes: el proceso se repite cada día y debería recogerlos mañana.`,
    ].join('\n\n');
  } else if (auto) {
    if (hechas.facturas > 0 && pendientes === 0) {
      intro = [
        gracias,
        `Zero generó ${cant(hechas.facturas, 'factura', 'facturas')} de ${d.colegio} por ${fmtDOP(hechas.totalCentavos)}, y no quedó ninguna familia pendiente.`,
      ].join('\n\n');
    } else if (hechas.facturas > 0) {
      intro = [
        gracias,
        `Zero generó ${cant(hechas.facturas, 'factura', 'facturas')} de ${d.colegio} por ${fmtDOP(hechas.totalCentavos)}.`,
        `${cant(pendientes, 'familia quedó', 'familias quedaron')} sin factura (${fmtDOP(r.totalCentavos)}). Abajo te contamos qué encontramos.`,
      ].join('\n\n');
    } else {
      intro = [
        gracias,
        `Hoy todavía no se generó ninguna factura de ${d.colegio}, y ${cant(pendientes, 'familia queda', 'familias quedan')} por facturar (${fmtDOP(r.totalCentavos)}). Abajo te contamos qué encontramos.`,
      ].join('\n\n');
    }
  } else if (pendientes === 0) {
    intro = [
      gracias,
      `Hoy salió el cobro de ${d.colegio} y ya está todo facturado: ${cant(hechas.facturas, 'factura', 'facturas')} por ${fmtDOP(hechas.totalCentavos)}.`,
    ].join('\n\n');
  } else {
    const ya = hechas.facturas > 0 ? ` ${cant(hechas.facturas, 'ya tiene', 'ya tienen')} su factura de hoy.` : '';
    intro = [
      gracias,
      `Hoy salió el cobro de ${d.colegio}: ${cant(pendientes, 'familia tiene', 'familias tienen')} cargos nuevos por ${fmtDOP(r.totalCentavos)}.${ya}`,
      'Como en este colegio las facturas las hace tu equipo, ya puedes facturarlas cuando quieras.',
    ].join('\n\n');
  }

  const cifras: RedaccionCorrida['cifras'] = [];
  if (hechas.facturas > 0) {
    cifras.push({ etiqueta: 'Facturas creadas hoy', valor: String(hechas.facturas) });
    cifras.push({ etiqueta: 'Total facturado', valor: fmtDOP(hechas.totalCentavos) });
  }
  if (pendientes > 0) {
    cifras.push({ etiqueta: auto ? 'Familias sin factura' : 'Familias por facturar', valor: String(pendientes) });
    cifras.push({ etiqueta: 'Pendiente de facturar', valor: fmtDOP(r.totalCentavos) });
  }
  if (sinCargo.lineas > 0) {
    cifras.push({ etiqueta: 'Cargos sin generar', valor: String(sinCargo.lineas) });
  }

  // Hay algo que mirar si quedó una familia sin factura o un cargo sin nacer.
  const hayPendientes = pendientes > 0 || sinCargo.lineas > 0;
  return {
    asunto: 'Resultado de la facturación de hoy',
    titulo: 'Resultado de la facturación de hoy',
    intro,
    cifras,
    conceptos: [],
    tituloRevision: revision.length > 0 ? 'Para dejarlo todo al día, revisa esto' : null,
    revision,
    boton: hayPendientes
      ? { texto: auto ? 'Ver familias por facturar' : 'Facturar a las familias', destino: 'por-facturar' }
      : { texto: 'Ver cuentas por cobrar', destino: 'cuentas-por-cobrar' },
    // Los dos destinos viajan siempre: el botón es el que toca según haya o no
    // familias sin factura, y el otro queda de enlace por si hace falta.
    enlace: hayPendientes
      ? { texto: 'Ver cuentas por cobrar', destino: 'cuentas-por-cobrar' }
      : { texto: 'Ver familias por facturar', destino: 'por-facturar' },
    pie: nadaGenerado ? ''
      : auto
        ? 'Las facturas quedaron en borrador: nada se envió a la DGII.'
        : 'Los cargos de hoy ya figuran en cada familia; facturarlos es un paso tuyo.',
  };
}
