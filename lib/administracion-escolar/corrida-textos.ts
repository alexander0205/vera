/**
 * Lo que dicen los tres correos de la corrida de facturación.
 *
 * Aparte del HTML (`lib/email/escolar-corrida.ts`) para que la decisión de QUÉ
 * se le dice al colegio se pueda probar sin Resend ni plantillas: acá se elige
 * el texto según el aviso (5 días, 2 días, resultado) y según quién factura
 * (Zero solo, o el colegio a mano). Allá solo se pinta.
 *
 * Reglas del texto, las mismas de `lib/email/suscripcion.ts`: una idea y un
 * botón. Y una propia de este módulo: NUNCA un nombre de alumno. El correo va a
 * quien administra, pero se reenvía y se imprime; son cuentas, no personas.
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

export interface RedaccionCorrida {
  asunto: string;
  titulo: string;
  intro: string;
  cifras: { etiqueta: string; valor: string }[];
  conceptos: string[];
  tituloRevision: string | null;
  revision: string[];
  boton: { texto: string; destino: DestinoEnlace };
  enlace: { texto: string; destino: DestinoEnlace } | null;
  pie: string;
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
export function redactarAviso(d: DatosAvisoCorrida): RedaccionCorrida {
  switch (d.tipo) {
    case 'aviso-5': return avisoDeCincoDias(d);
    case 'aviso-2': return avisoDeDosDias(d);
    case 'resultado': return resultado(d);
  }
}

function revisionDelAviso(r: ResumenCorrida) {
  const revision = r.revisar.map(textoDeRevision);
  const tarifas = r.revisar.some((p) => SE_ARREGLAN_EN_TARIFAS.has(p.codigo));
  return { revision, tarifas };
}

function avisoDeCincoDias(d: DatosAvisoCorrida): RedaccionCorrida {
  const r = d.resumen;
  const auto = d.modo === 'automatico';
  const asunto = `Así va a salir la facturación del ${fechaCorta(d.fecha)}`;
  const { revision, tarifas } = revisionDelAviso(r);

  return {
    asunto,
    titulo: asunto,
    intro: auto
      ? `El ${fechaLarga(d.fecha)} a las ${HORA_DE_LA_CORRIDA} Zero va a generar solo las facturas de ${d.colegio}, una por familia. Esto es lo que saldría con los datos de hoy.`
      : `El ${fechaLarga(d.fecha)} sale el cobro de ${d.colegio}. En este colegio Zero no factura solo: ese día te toca facturar a las familias. Esto es lo que habría que facturar con los datos de hoy.`,
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
    tituloRevision: 'Lo que hay que revisar antes',
    revision: revision.length > 0
      ? revision
      : ['Nada por ahora: con los datos de hoy todo está listo para salir.'],
    boton: { texto: auto ? 'Revisar familias por facturar' : 'Ir a familias por facturar', destino: 'por-facturar' },
    enlace: tarifas ? { texto: 'Revisar las tarifas', destino: 'tarifas' } : null,
    pie: auto
      ? 'Las facturas se crean como borrador: nada se envía a la DGII solo.'
      : 'Las cuotas pasan a ser cargos el día de la emisión; desde ese momento ya puedes facturarlas.',
  };
}

function avisoDeDosDias(d: DatosAvisoCorrida): RedaccionCorrida {
  const r = d.resumen;
  const auto = d.modo === 'automatico';
  const { revision, tarifas } = revisionDelAviso(r);
  const enOrden = revision.length === 0 ? ' Todo está en orden.' : '';

  return {
    asunto: 'Pasado mañana se factura',
    titulo: 'Pasado mañana se factura',
    intro: auto
      ? `El ${fechaLarga(d.fecha)} a las ${HORA_DE_LA_CORRIDA} Zero genera solo ${cant(r.familias, 'factura', 'facturas')} de ${d.colegio}, por ${fmtDOP(r.totalCentavos)}.${enOrden}`
      : `El ${fechaLarga(d.fecha)} sale el cobro de ${d.colegio} y te toca facturar a ${cant(r.familias, 'familia', 'familias')} (${fmtDOP(r.totalCentavos)}).${enOrden}`,
    cifras: [],
    conceptos: [],
    tituloRevision: revision.length > 0 ? 'Revísalo antes' : null,
    revision,
    boton: { texto: auto ? 'Revisar familias por facturar' : 'Ir a familias por facturar', destino: 'por-facturar' },
    enlace: tarifas ? { texto: 'Revisar las tarifas', destino: 'tarifas' } : null,
    pie: auto ? 'Se crean como borrador: nada se envía a la DGII solo.' : '',
  };
}

function resultado(d: DatosAvisoCorrida): RedaccionCorrida {
  const r = d.resumen;
  const auto = d.modo === 'automatico';
  const hechas = r.facturadasHoy;
  const pendientes = r.familias;
  const { revision } = revisionDelAviso(r);

  // El día que tocaba facturar y ni siquiera hay cargos: el devengo no corrió o
  // no pudo. Es la peor noticia posible del resultado y se dice primero, igual
  // en los dos modos.
  const sinCargo = r.sinCargo;
  const nadaGenerado = hechas.facturas === 0 && pendientes === 0 && sinCargo.lineas > 0;

  let intro: string;
  if (nadaGenerado) {
    intro = `Hoy tocaba facturar ${d.colegio} y todavía no existen los cargos de ${cant(sinCargo.familias, 'familia', 'familias')} (${fmtDOP(sinCargo.totalCentavos)}). El proceso se repite cada día y debería recogerlos mañana.`;
  } else if (auto) {
    if (hechas.facturas > 0 && pendientes === 0) {
      intro = `Hoy Zero generó ${cant(hechas.facturas, 'factura', 'facturas')} de ${d.colegio} por ${fmtDOP(hechas.totalCentavos)}. No quedó ninguna familia por facturar.`;
    } else if (hechas.facturas > 0) {
      intro = `Hoy Zero generó ${cant(hechas.facturas, 'factura', 'facturas')} de ${d.colegio} por ${fmtDOP(hechas.totalCentavos)}. Quedaron ${cant(pendientes, 'familia', 'familias')} sin factura (${fmtDOP(r.totalCentavos)}).`;
    } else {
      intro = `Hoy no se generó ninguna factura de ${d.colegio}. Quedan ${cant(pendientes, 'familia', 'familias')} por facturar (${fmtDOP(r.totalCentavos)}).`;
    }
  } else if (pendientes === 0) {
    intro = `Hoy salió el cobro de ${d.colegio} y ya está facturado: ${cant(hechas.facturas, 'factura', 'facturas')} por ${fmtDOP(hechas.totalCentavos)}.`;
  } else {
    const ya = hechas.facturas > 0 ? ` ${cant(hechas.facturas, 'ya tiene', 'ya tienen')} factura de hoy.` : '';
    intro = `Hoy salió el cobro de ${d.colegio}: ${cant(pendientes, 'familia tiene', 'familias tienen')} cargos nuevos por ${fmtDOP(r.totalCentavos)}. En este colegio las facturas se hacen a mano, así que están esperando que las factures.${ya}`;
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
    tituloRevision: revision.length > 0 ? 'Lo que conviene revisar' : null,
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
